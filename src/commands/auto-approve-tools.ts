import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import type { HookOutput, ClaudeResponse } from '../types/hook-schemas.js';
import { parseHookInput, parseClaudeResponse } from '../types/hook-schemas.js';

async function queryClaudeCode(toolName: string, toolInput: Record<string, unknown>): Promise<ClaudeResponse> {
  return new Promise((resolve, reject) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      reject(new Error('ANTHROPIC_API_KEY environment variable is required'));
      return;
    }

    const prompt = `You are a security filter for Claude Code tool execution. Analyze the tool "${toolName}" with input: ${JSON.stringify(toolInput)}

Return ONLY valid JSON with no markdown formatting, explanations, or additional text. The response must be exactly:
{"decision": "approve|block|unsure", "reason": "one sentence explanation"}

Decision criteria:
- "approve" for safe, standard operations
- "block" for dangerous/destructive operations  
- "unsure" for unclear or complex cases

Response:`;
    
    const claude = spawn('claude', ['-p', '--output-format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
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

export async function autoApproveTools(): Promise<void> {
  try {
    const input = readFileSync(0, 'utf8');
    const jsonData = JSON.parse(input);
    const hookData = parseHookInput(jsonData);
    
    const claudeResponse = await queryClaudeCode(hookData.tool_name, hookData.tool_input);
    
    const output: HookOutput = {
      decision: claudeResponse.decision === 'unsure' ? undefined : claudeResponse.decision,
      reason: claudeResponse.reason
    };
    
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (error) {
    process.stderr.write(`Error processing hook input: ${error}\n`);
    process.exit(1);
  }
}