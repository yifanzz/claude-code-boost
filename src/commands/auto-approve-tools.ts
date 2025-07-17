import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { HookOutput, ClaudeResponse } from '../types/hook-schemas.js';
import { parseHookInput, parseClaudeResponse } from '../types/hook-schemas.js';
import { logApproval } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadPromptTemplate(): string {
  const promptPath = join(__dirname, '../../prompts/auto-approve-tools.md');
  return readFileSync(promptPath, 'utf8');
}

function buildPrompt(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  const template = loadPromptTemplate();
  return template
    .replace('{{toolName}}', toolName)
    .replace('{{toolInput}}', JSON.stringify(toolInput, null, 2));
}

async function queryClaudeCode(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ClaudeResponse> {
  return new Promise((resolve, reject) => {
    const prompt = buildPrompt(toolName, toolInput);

    const claude = spawn('claude', ['-p', '--output-format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const claudeOutput = JSON.parse(stdout.trim());

        // Extract the actual response from Claude's wrapped format
        let actualResponse = claudeOutput.result;

        // If the response is wrapped in markdown code blocks, extract the JSON
        if (actualResponse.includes('```json')) {
          const jsonMatch = actualResponse.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            actualResponse = jsonMatch[1];
          }
        }

        const jsonData = JSON.parse(actualResponse);
        const response = parseClaudeResponse(jsonData);
        resolve(response);
      } catch (parseError) {
        reject(new Error(`Failed to parse Claude response: ${parseError}`));
      }
    });

    claude.stdin.write(prompt);
    claude.stdin.end();
  });
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
  // Always approve read-only tools
  if (FAST_APPROVE_TOOLS.has(toolName)) {
    return {
      decision: 'approve',
      reason: `${toolName} is a safe read-only operation`,
    };
  }

  // Approve safe write tools for development files
  if (SAFE_WRITE_TOOLS.has(toolName)) {
    return {
      decision: 'approve',
      reason: `${toolName} is a safe development operation`,
    };
  }

  return null; // No fast approval, use AI query
}

export async function autoApproveTools(): Promise<void> {
  try {
    const input = readFileSync(0, 'utf8');
    const jsonData = JSON.parse(input);
    const hookData = parseHookInput(jsonData);

    let output: HookOutput;

    // Check for fast approval first
    const fastApproval = shouldFastApprove(
      hookData.tool_name,
      hookData.tool_input
    );
    if (fastApproval) {
      output = fastApproval;
    } else {
      // Fall back to AI-powered decision making
      const claudeResponse = await queryClaudeCode(
        hookData.tool_name,
        hookData.tool_input
      );

      output = {
        decision:
          claudeResponse.decision === 'unsure'
            ? undefined
            : claudeResponse.decision,
        reason: claudeResponse.reason,
      };
    }

    // Log the approval decision
    await logApproval(
      hookData.tool_name,
      hookData.tool_input,
      output.decision || 'undefined',
      output.reason,
      hookData.session_id
    );

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (error) {
    process.stderr.write(`Error processing hook input: ${error}\n`);
    process.exit(1);
  }
}
