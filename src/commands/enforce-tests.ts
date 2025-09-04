import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { StopHookOutput, StopDecision } from '../types/hook-schemas.js';
import {
  parseStopHookInput,
  StopDecisionSchema,
} from '../types/hook-schemas.js';
import { log } from '../utils/general-logger.js';
import { extractTextMessages, convertToXml } from '../transcript-parser.js';
import { getLLMClient, canConfigureLLMClient } from '../utils/llm-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadStopSystemPrompt(): string {
  const promptPath = join(__dirname, '../../prompts/stop-system-prompt.md');
  return readFileSync(promptPath, 'utf8');
}

function buildStopUserPrompt(conversationHistory: string): string {
  return `Please analyze this Claude Code conversation transcript and determine if tests should have been run but weren't:

${conversationHistory}

Based on the conversation history, should I block the stop action to ensure tests are run?`;
}

function getStopDecisionJsonSchema() {
  return {
    name: 'stop_decision',
    strict: true,
    schema: {
      type: 'object' as const,
      properties: {
        decision: {
          type: 'string' as const,
          enum: ['block', 'undefined'],
          description: 'Whether to block the stop action',
        },
        reason: {
          type: 'string' as const,
          description: 'Human-readable explanation for the decision',
        },
      },
      required: ['decision', 'reason'],
      additionalProperties: false,
    },
  };
}

async function queryLLM(conversationHistory: string): Promise<StopDecision> {
  const llmClient = getLLMClient();
  const systemPrompt = loadStopSystemPrompt();
  const userPrompt = buildStopUserPrompt(conversationHistory);

  const response = await llmClient.chatCompletion(
    systemPrompt,
    userPrompt,
    {
      model: llmClient.getModel(),
      maxTokens: 1000,
    },
    getStopDecisionJsonSchema()
  );

  return llmClient.parseJsonResponse<StopDecision>(
    response.content,
    StopDecisionSchema
  );
}

export async function enforceTests(_useClaudeCli?: boolean): Promise<void> {
  try {
    const input = readFileSync(0, 'utf8');
    const jsonData = JSON.parse(input);
    const hookData = parseStopHookInput(jsonData);

    log.debug(
      {
        sessionId: hookData.session_id,
        transcriptPath: hookData.transcript_path,
        cwd: hookData.cwd,
      },
      'Processing stop hook request'
    );

    // Parse the conversation transcript
    let conversationHistory: string;
    try {
      const messages = extractTextMessages(hookData.transcript_path);
      conversationHistory = convertToXml(messages);
    } catch (error) {
      log.error({ error }, 'Failed to parse conversation transcript');
      // If we can't parse the transcript, allow the stop (don't block)
      const output: StopHookOutput = {
        hookSpecificOutput: {
          hookEventName: 'Stop',
          decision: 'undefined',
          reason: 'Could not parse conversation transcript for analysis',
        },
      };
      process.stdout.write(JSON.stringify(output));
      process.exit(0);
      return;
    }

    // Check if LLM client can be configured
    if (!canConfigureLLMClient()) {
      throw new Error(
        'No API key configured. Set openaiApiKey/OPENAI_API_KEY or apiKey/ANTHROPIC_API_KEY in config or environment'
      );
    }

    log.debug(
      {
        hasApiKey: canConfigureLLMClient(),
      },
      'Querying LLM for stop decision'
    );

    // Query LLM for decision
    const aiResponse = await queryLLM(conversationHistory);

    const output: StopHookOutput = {
      hookSpecificOutput: {
        hookEventName: 'Stop',
        decision: aiResponse.decision,
        reason: aiResponse.reason,
      },
    };

    log.info(
      {
        decision: aiResponse.decision,
        reason: aiResponse.reason,
        sessionId: hookData.session_id,
      },
      'Stop decision made'
    );

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error processing stop hook input'
    );
    process.stderr.write(`Error processing stop hook input: ${error}\n`);
    process.exit(1);
  }
}
