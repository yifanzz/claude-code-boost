import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('auto-approve-tools', () => {
  const originalEnv = process.env;
  const testInputFile = join(__dirname, 'test-input.json');

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    
    // Clean up test file
    try {
      unlinkSync(testInputFile);
    } catch {
      // File might not exist, ignore
    }
  });

  function createTestInput(toolName: string, toolInput: Record<string, unknown> = {}) {
    const input = {
      session_id: 'test-session',
      transcript_path: '/tmp/test-transcript',
      tool_name: toolName,
      tool_input: toolInput
    };
    
    writeFileSync(testInputFile, JSON.stringify(input));
    return input;
  }

  function runCommand(inputData: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
      const child = spawn('tsx', ['src/index.ts', 'auto-approve-tools'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
        cwd: join(__dirname, '..')
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });

      child.stdin.write(inputData);
      child.stdin.end();
    });
  }

  it('should require ANTHROPIC_API_KEY environment variable', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    
    const input = createTestInput('Read', { file_path: '/test' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('ANTHROPIC_API_KEY environment variable is required');
  });

  it('should call claude CLI and return decision', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Skipping integration test - ANTHROPIC_API_KEY not set');
      return;
    }
    
    const input = createTestInput('Read', { file_path: '/test/file.txt' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
    if (output.decision !== undefined) {
      expect(['approve', 'block']).toContain(output.decision);
    }
  });

  it('should handle different tool types', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Skipping integration test - ANTHROPIC_API_KEY not set');
      return;
    }
    
    const input = createTestInput('Write', { file_path: '/test/file.txt', content: 'test content' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
    if (output.decision !== undefined) {
      expect(['approve', 'block']).toContain(output.decision);
    }
  });

  it('should handle potentially dangerous tools', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Skipping integration test - ANTHROPIC_API_KEY not set');
      return;
    }
    
    const input = createTestInput('Bash', { command: 'rm -rf /' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
    if (output.decision !== undefined) {
      expect(['approve', 'block']).toContain(output.decision);
    }
  });

  it('should handle unknown tools', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Skipping integration test - ANTHROPIC_API_KEY not set');
      return;
    }
    
    const input = createTestInput('UnknownTool', { arbitrary: 'data' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
    if (output.decision !== undefined) {
      expect(['approve', 'block']).toContain(output.decision);
    }
  });

  it('should handle malformed input gracefully', async () => {
    const result = await runCommand('invalid json');
    
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Error processing hook input');
  });
});