import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('enforce-tests', () => {
  const originalEnv = process.env;
  const testDir = join(tmpdir(), 'ccb-enforce-tests');

  beforeEach(() => {
    process.env = { ...originalEnv };

    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    process.env = originalEnv;

    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist, ignore
    }
  });

  function createTestTranscript(
    messages: Array<{
      role: 'user' | 'assistant';
      content:
        | string
        | Array<{
            type: string;
            text?: string;
            tool_use_id?: string;
            content?: string;
          }>;
    }>
  ): string {
    const transcriptPath = join(testDir, `test-transcript-${Date.now()}.jsonl`);
    const lines = messages.map((msg, index) => {
      return JSON.stringify({
        type: 'message',
        message: msg,
        uuid: `test-uuid-${index}`,
        timestamp: new Date().toISOString(),
      });
    });

    writeFileSync(transcriptPath, lines.join('\n'));
    return transcriptPath;
  }

  function createStopHookInput(transcriptPath: string) {
    return {
      session_id: 'test-session',
      transcript_path: transcriptPath,
      cwd: testDir,
      hook_event_name: 'Stop',
    };
  }

  function runCommand(
    inputData: string
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
      const args = ['src/index.ts', 'enforce-tests'];

      const child = spawn('tsx', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
        cwd: join(__dirname, '..'),
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

  it('should handle missing transcript file gracefully', async () => {
    const input = createStopHookInput('/nonexistent/path.jsonl');
    const result = await runCommand(JSON.stringify(input));

    // The command should exit with error code 1 due to missing API key in test env
    // but may exit with 0 if it fails at transcript parsing stage
    expect([0, 1]).toContain(result.code);

    if (result.code === 0) {
      expect(result.stdout).toBeTruthy();
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('hookSpecificOutput');
      expect(output.hookSpecificOutput).toHaveProperty('hookEventName', 'Stop');
      expect(output.hookSpecificOutput).toHaveProperty('decision', 'undefined');
      expect(output.hookSpecificOutput.reason).toContain(
        'Could not parse conversation transcript'
      );
    } else {
      expect(result.stderr).toContain('Error processing stop hook input');
    }
  });

  it('should BLOCK when tests exist but were not run', async () => {
    const transcriptPath = createTestTranscript([
      {
        role: 'user',
        content:
          'I want you to implement a prime number checker. This project has npm test available.',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I've implemented the isPrime function using an efficient algorithm.",
          },
        ],
      },
      { role: 'user', content: 'Thanks, that looks great!' },
    ]);

    const input = createStopHookInput(transcriptPath);
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);

    // Log the reason for debugging
    console.log('BLOCK scenario reason:', output.reason);

    // Only validate the binary decision
    expect(output.decision).toBe('block');
    expect(typeof output.reason).toBe('string');
    expect(output.reason.length).toBeGreaterThan(0);
  });

  it('should ALLOW when tests were run and passed', async () => {
    const transcriptPath = createTestTranscript([
      {
        role: 'user',
        content: 'I want you to implement a prime number checker.',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Now let me run the tests to verify everything works.',
          },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: '✓ All tests passed! (3 passing)' }],
      },
      { role: 'user', content: 'Perfect!' },
    ]);

    const input = createStopHookInput(transcriptPath);
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);

    // Log the reason for debugging
    console.log('ALLOW (tests passed) scenario reason:', output.reason);

    // Only validate the binary decision
    expect(output.decision).toBe('approve');
    expect(typeof output.reason).toBe('string');
    expect(output.reason.length).toBeGreaterThan(0);
  });

  it('should ALLOW when only documentation was changed', async () => {
    const transcriptPath = createTestTranscript([
      {
        role: 'user',
        content: 'Can you update the README to document the prime function?',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I've updated the README with comprehensive documentation.",
          },
        ],
      },
      { role: 'user', content: 'Great documentation!' },
    ]);

    const input = createStopHookInput(transcriptPath);
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);

    // Log the reason for debugging
    console.log('ALLOW (documentation only) scenario reason:', output.reason);

    // Only validate the binary decision
    expect(output.decision).toBe('approve');
    expect(typeof output.reason).toBe('string');
    expect(output.reason.length).toBeGreaterThan(0);
  });

  it('should ALLOW when no code changes were made', async () => {
    const transcriptPath = createTestTranscript([
      {
        role: 'user',
        content: 'Can you explain how the current prime function works?',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'The function uses the 6k±1 optimization algorithm...',
          },
        ],
      },
      { role: 'user', content: "That's helpful, thanks!" },
    ]);

    const input = createStopHookInput(transcriptPath);
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);

    // Log the reason for debugging
    console.log('ALLOW (no code changes) scenario reason:', output.reason);

    // Only validate the binary decision
    expect(output.decision).toBe('approve');
    expect(typeof output.reason).toBe('string');
    expect(output.reason.length).toBeGreaterThan(0);
  });
});
