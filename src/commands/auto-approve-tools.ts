import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { HookOutput, ToolDecision } from '../types/hook-schemas.js';
import { parseHookInput, ToolDecisionSchema } from '../types/hook-schemas.js';
import { logApproval } from '../logger.js';
import { loadConfig } from '../utils/config.js';
import { getCachedDecision, setCachedDecision } from '../utils/cache.js';
import { log } from '../utils/general-logger.js';
import { getLLMClient, canConfigureLLMClient } from '../utils/llm-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadSystemPrompt(): string {
  const promptPath = join(__dirname, '../../prompts/system-prompt.md');
  return readFileSync(promptPath, 'utf8');
}

function loadUserPromptTemplate(): string {
  const promptPath = join(__dirname, '../../prompts/user-prompt.md');
  return readFileSync(promptPath, 'utf8');
}

function buildUserPrompt(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  const template = loadUserPromptTemplate();
  return template
    .replace('{{toolName}}', toolName)
    .replace('{{toolInput}}', JSON.stringify(toolInput, null, 2));
}

function getToolDecisionJsonSchema() {
  return {
    name: 'tool_decision',
    strict: true,
    schema: {
      type: 'object' as const,
      properties: {
        decision: {
          type: 'string' as const,
          enum: ['allow', 'deny', 'ask'],
          description: 'The approval decision for the tool execution',
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

async function queryLLM(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ToolDecision> {
  const llmClient = getLLMClient();
  const systemPrompt = loadSystemPrompt();
  const userPrompt = buildUserPrompt(toolName, toolInput);

  const response = await llmClient.chatCompletion(
    systemPrompt,
    userPrompt,
    {
      model: llmClient.getModel(),
      maxTokens: 1000,
    },
    getToolDecisionJsonSchema()
  );

  return llmClient.parseJsonResponse<ToolDecision>(
    response.content,
    ToolDecisionSchema
  );
}

// Tools that are unambiguously safe and should be auto-approved without AI query
const FAST_APPROVE_TOOLS = new Set([
  'Read',
  'LS',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'NotebookRead',
  'TodoWrite',
  'Task',
]);

// Tools that are safe for writing/editing in development contexts
const SAFE_WRITE_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
]);

function shouldFastApprove(
  toolName: string,
  _toolInput: Record<string, unknown>
): HookOutput | null {
  // ExitPlanMode should always ask for user feedback
  if (toolName === 'ExitPlanMode') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason:
          'ExitPlanMode requires user confirmation before proceeding',
      },
    };
  }

  // Always approve read-only tools
  if (FAST_APPROVE_TOOLS.has(toolName)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: `${toolName} is a safe read-only operation`,
      },
    };
  }

  // Approve safe write tools for development files
  if (SAFE_WRITE_TOOLS.has(toolName)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: `${toolName} is a safe development operation`,
      },
    };
  }

  return null; // No fast approval, use AI query
}

export async function autoApproveTools(
  noCache?: boolean
): Promise<void> {
  try {
    const input = readFileSync(0, 'utf8');
    const jsonData = JSON.parse(input);
    const hookData = parseHookInput(jsonData);
    const workingDir = process.cwd();
    const config = loadConfig();

    log.debug(
      {
        tool: hookData.tool_name,
        input: hookData.tool_input,
        sessionId: hookData.session_id,
        cwd: workingDir,
        noCache: noCache,
        cacheEnabled: config.cache,
      },
      'Processing tool approval request'
    );

    let output: HookOutput;

    // Check for fast approval first
    const fastApproval = shouldFastApprove(
      hookData.tool_name,
      hookData.tool_input
    );
    if (fastApproval) {
      log.info(
        {
          tool: hookData.tool_name,
          decision: fastApproval.hookSpecificOutput.permissionDecision,
          reason: fastApproval.hookSpecificOutput.permissionDecisionReason,
        },
        'Fast approval granted'
      );
      output = fastApproval;
    } else {
      // Check cache for previous decision (only if cache is enabled and not disabled by flag)
      let cachedDecision = null;
      if (config.cache && !noCache) {
        cachedDecision = getCachedDecision(
          hookData.tool_name,
          hookData.tool_input,
          workingDir
        );
      }

      if (cachedDecision) {
        log.info(
          {
            tool: hookData.tool_name,
            decision: cachedDecision.decision,
            reason: cachedDecision.reason,
          },
          'Using cached decision'
        );
        output = {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: cachedDecision.decision,
            permissionDecisionReason: `${cachedDecision.reason} (cached)`,
          },
        };
      } else {
        // Check if LLM client can be configured
        if (!canConfigureLLMClient()) {
          throw new Error(
            'No authentication method configured. Available options:\n' +
            '1. beyondthehype.dev: Set beyondthehypeApiKey in config (recommended)\n' +
            '2. OpenAI-compatible: Set openaiApiKey/OPENAI_API_KEY or apiKey/ANTHROPIC_API_KEY in config or environment\n' +
            '\nRun `ccb install` to configure authentication interactively.'
          );
        }

        log.debug(
          {
            tool: hookData.tool_name,
            hasApiKey: canConfigureLLMClient(),
          },
          'Querying LLM for decision'
        );

        // Fall back to AI-powered decision making
        const claudeResponse = await queryLLM(
          hookData.tool_name,
          hookData.tool_input
        );

        output = {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: claudeResponse.decision,
            permissionDecisionReason: claudeResponse.reason,
          },
        };

        // Cache the decision if it's allow or deny (not ask) and cache is enabled and not disabled by flag
        if (config.cache && !noCache && claudeResponse.decision !== 'ask') {
          setCachedDecision(
            hookData.tool_name,
            hookData.tool_input,
            workingDir,
            claudeResponse.decision,
            claudeResponse.reason
          );
        }
      }
    }

    // Log the approval decision if enabled in config
    if (config.log) {
      await logApproval(
        hookData.tool_name,
        hookData.tool_input,
        output.hookSpecificOutput.permissionDecision || 'undefined',
        output.hookSpecificOutput.permissionDecisionReason,
        hookData.session_id
      );
    }

    log.info(
      {
        tool: hookData.tool_name,
        decision: output.hookSpecificOutput.permissionDecision,
        reason: output.hookSpecificOutput.permissionDecisionReason,
        sessionId: hookData.session_id,
      },
      'Final decision made'
    );

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error processing hook input'
    );
    process.stderr.write(`Error processing hook input: ${error}\n`);
    process.exit(1);
  }
}
