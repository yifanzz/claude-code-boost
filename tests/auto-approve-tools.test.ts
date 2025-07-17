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

  it('should handle claude CLI unavailable gracefully', async () => {
    // This test will fail if claude CLI is not available or not configured
    // But that's expected behavior - the command should fail with a clear error
    const input = createTestInput('Read', { file_path: '/test' });
    const result = await runCommand(JSON.stringify(input));
    
    // Either succeeds (if claude CLI is available) or fails with spawn error
    expect([0, 1]).toContain(result.code);
    if (result.code === 1) {
      expect(result.stderr).toBeTruthy();
    }
  });

  it('should call claude CLI and return decision', async () => {
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
    const input = createTestInput('UnknownTool', { arbitrary: 'data' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    
    // The response should have a reason field
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
    
    // Decision field is optional (can be undefined)
    if (output.decision !== undefined) {
      expect(['approve', 'block']).toContain(output.decision);
    }
  });

  it('should handle malformed input gracefully', async () => {
    const result = await runCommand('invalid json');
    
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Error processing hook input');
  });

  it('should approve localhost network operations', async () => {
    const input = createTestInput('WebFetch', { url: 'http://localhost:3000/api/health' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'approve');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
  });

  it('should approve standard development commands', async () => {
    const input = createTestInput('Bash', { command: 'npm test' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'approve');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
  });

  it('should approve localhost curl operations', async () => {
    const input = createTestInput('Bash', { command: 'curl -X GET http://localhost:8080/health' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'approve');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
  });

  it('should approve 127.0.0.1 network operations', async () => {
    const input = createTestInput('WebFetch', { url: 'http://127.0.0.1:8000/api/test' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'approve');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
  });

  it('should approve development build commands', async () => {
    const input = createTestInput('Bash', { command: 'npm run build' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'approve');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
  });

  it('should approve linting commands', async () => {
    const input = createTestInput('Bash', { command: 'npm run lint' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'approve');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
  });

  it('should block only truly destructive operations', async () => {
    const input = createTestInput('Bash', { command: 'rm -rf /' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'block');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
  });

  it('should approve or mark as unsure most other operations', async () => {
    const input = createTestInput('Bash', { command: 'sudo apt install package' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
    expect(['approve', 'unsure']).toContain(output.decision);
  });

  it('should use project context for better decisions', async () => {
    const input = createTestInput('Bash', { command: 'rm -rf node_modules' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'approve');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
    expect(output.reason.toLowerCase()).toContain('node_modules');
  });

  it('should approve context-appropriate operations', async () => {
    const input = createTestInput('Bash', { command: 'docker system prune -a' });
    const result = await runCommand(JSON.stringify(input));
    
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
    
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('decision', 'approve');
    expect(output).toHaveProperty('reason');
    expect(typeof output.reason).toBe('string');
  });
});