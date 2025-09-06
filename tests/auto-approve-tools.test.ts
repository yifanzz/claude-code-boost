import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('auto-approve-tools', () => {
  const originalEnv = process.env;
  const testInputFile = join(__dirname, 'test-input.json');

  beforeEach(() => {
    // Preserve API keys while resetting other env vars
    const apiKeys = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    process.env = { ...originalEnv, ...apiKeys };
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

  function createTestInput(
    toolName: string,
    toolInput: Record<string, unknown> = {}
  ) {
    const input = {
      session_id: 'test-session',
      transcript_path: '/tmp/test-transcript',
      tool_name: toolName,
      tool_input: toolInput,
    };

    writeFileSync(testInputFile, JSON.stringify(input));
    return input;
  }

  function runCommand(
    inputData: string
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
      const args = ['src/index.ts', 'auto-approve-tools'];

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

  it('should handle API configuration and return decision', async () => {
    const input = createTestInput('Read', { file_path: '/test/file.txt' });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('hookSpecificOutput');
    expect(output.hookSpecificOutput).toHaveProperty('permissionDecision');
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
    if (output.hookSpecificOutput.permissionDecision !== undefined) {
      expect(['allow', 'deny', 'ask']).toContain(
        output.hookSpecificOutput.permissionDecision
      );
    }
  });

  it('should handle different tool types', async () => {
    const input = createTestInput('Write', {
      file_path: '/test/file.txt',
      content: 'test content',
    });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('hookSpecificOutput');
    expect(output.hookSpecificOutput).toHaveProperty('permissionDecision');
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
    if (output.hookSpecificOutput.permissionDecision !== undefined) {
      expect(['allow', 'deny', 'ask']).toContain(
        output.hookSpecificOutput.permissionDecision
      );
    }
  });

  it('should handle potentially dangerous tools', async () => {
    const input = createTestInput('Bash', { command: 'rm -rf /' });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('hookSpecificOutput');
    expect(output.hookSpecificOutput).toHaveProperty('permissionDecision');
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
    if (output.hookSpecificOutput.permissionDecision !== undefined) {
      expect(['allow', 'deny', 'ask']).toContain(
        output.hookSpecificOutput.permissionDecision
      );
    }
  });

  it('should handle unknown tools', async () => {
    const input = createTestInput('UnknownTool', { arbitrary: 'data' });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);

    // The response should have hookSpecificOutput with a reason field
    expect(output).toHaveProperty('hookSpecificOutput');
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );

    // Decision field is optional (can be undefined)
    if (output.hookSpecificOutput.permissionDecision !== undefined) {
      expect(['allow', 'deny', 'ask']).toContain(
        output.hookSpecificOutput.permissionDecision
      );
    }
  });

  it('should handle malformed input gracefully', async () => {
    const result = await runCommand('invalid json');

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Error processing hook input');
  });

  it('should approve localhost network operations', async () => {
    const input = createTestInput('WebFetch', {
      url: 'http://localhost:3000/api/health',
    });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'allow'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
  });

  it('should approve standard development commands', async () => {
    const input = createTestInput('Bash', { command: 'npm test' });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'allow'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
  });

  it('should approve localhost curl operations', async () => {
    const input = createTestInput('Bash', {
      command: 'curl -X GET http://localhost:8080/health',
    });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'allow'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
  });

  it('should approve 127.0.0.1 network operations', async () => {
    const input = createTestInput('WebFetch', {
      url: 'http://127.0.0.1:8000/api/test',
    });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'allow'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
  });

  it('should approve development build commands', async () => {
    const input = createTestInput('Bash', { command: 'npm run build' });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'allow'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
  });

  it('should approve linting commands', async () => {
    const input = createTestInput('Bash', { command: 'npm run lint' });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'allow'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
  });

  it('should block only truly destructive operations', async () => {
    const input = createTestInput('Bash', { command: 'rm -rf /' });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'deny'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
  });

  it('should approve or mark as unsure most other operations', async () => {
    const input = createTestInput('Bash', {
      command: 'sudo apt install curl',
    });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('hookSpecificOutput');
    expect(output.hookSpecificOutput).toHaveProperty('permissionDecision');
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
    expect(['allow', 'ask']).toContain(
      output.hookSpecificOutput.permissionDecision
    );
  });

  it('should use project context for better decisions', async () => {
    const input = createTestInput('Bash', { command: 'rm -rf node_modules' });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'allow'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
    expect(
      output.hookSpecificOutput.permissionDecisionReason.toLowerCase()
    ).toContain('node_modules');
  });

  it('should approve context-appropriate operations', async () => {
    const input = createTestInput('Bash', {
      command: 'docker system prune -a',
    });
    const result = await runCommand(JSON.stringify(input));

    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecision',
      'allow'
    );
    expect(output.hookSpecificOutput).toHaveProperty(
      'permissionDecisionReason'
    );
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
      'string'
    );
  });

  describe('Fast-path approval', () => {
    it('should fast-approve Read operations', async () => {
      const input = createTestInput('Read', { file_path: '/test/file.txt' });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'Read is a safe read-only operation'
      );
    });

    it('should fast-approve LS operations', async () => {
      const input = createTestInput('LS', { path: '/test' });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'LS is a safe read-only operation'
      );
    });

    it('should fast-approve Grep operations', async () => {
      const input = createTestInput('Grep', { pattern: 'test', path: '/test' });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'Grep is a safe read-only operation'
      );
    });

    it('should fast-approve Write operations', async () => {
      const input = createTestInput('Write', {
        file_path: '/test/file.txt',
        content: 'test',
      });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'Write is a safe development operation'
      );
    });

    it('should fast-approve Edit operations', async () => {
      const input = createTestInput('Edit', {
        file_path: '/test/file.txt',
        old_string: 'old',
        new_string: 'new',
      });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'Edit is a safe development operation'
      );
    });

    it('should fast-approve localhost WebFetch operations', async () => {
      const input = createTestInput('WebFetch', {
        url: 'http://localhost:3000/api',
      });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'WebFetch is a safe read-only operation'
      );
    });

    it('should fast-approve 127.0.0.1 WebFetch operations', async () => {
      const input = createTestInput('WebFetch', {
        url: 'http://127.0.0.1:8080/health',
      });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'WebFetch is a safe read-only operation'
      );
    });

    it('should fast-approve external WebFetch operations', async () => {
      const input = createTestInput('WebFetch', {
        url: 'https://example.com/api',
      });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'WebFetch is a safe read-only operation'
      );
    });

    it('should fast-approve WebSearch operations', async () => {
      const input = createTestInput('WebSearch', {
        query: 'typescript documentation',
      });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecision',
        'allow'
      );
      expect(output.hookSpecificOutput).toHaveProperty(
        'permissionDecisionReason'
      );
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'WebSearch is a safe read-only operation'
      );
    });
  });

  describe('Logging functionality', () => {
    const testLogDir = join(tmpdir(), 'ccb-test-logging');
    const testLogFile = join(testLogDir, 'approval.jsonl');

    beforeEach(() => {
      // Set up test logging directory
      try {
        rmSync(testLogDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist
      }
      mkdirSync(testLogDir, { recursive: true });

      // Set environment variable for test config directory
      process.env.CCB_CONFIG_DIR = testLogDir;
    });

    afterEach(() => {
      // Clean up test logging directory
      try {
        rmSync(testLogDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist
      }
    });

    it('should create log file and log approval decisions', async () => {
      const input = createTestInput('Read', { file_path: '/test/file.txt' });
      const result = await runCommand(JSON.stringify(input));

      expect(result.code).toBe(0);

      // Check that log file was created
      expect(() => readFileSync(testLogFile, 'utf8')).not.toThrow();

      // Read and parse the log entry
      const logContent = readFileSync(testLogFile, 'utf8');
      const logLines = logContent.trim().split('\n');
      expect(logLines).toHaveLength(1);

      const logEntry = JSON.parse(logLines[0]);

      // Verify log entry structure
      expect(logEntry).toHaveProperty('datetime');
      expect(logEntry).toHaveProperty('tool', 'Read');
      expect(logEntry).toHaveProperty('inputs');
      expect(logEntry.inputs).toEqual({ file_path: '/test/file.txt' });
      expect(logEntry).toHaveProperty('reason');
      expect(logEntry).toHaveProperty('decision', 'allow');
      expect(logEntry).toHaveProperty('cwd');
      expect(logEntry).toHaveProperty('session_id', 'test-session');

      // Verify datetime is valid ISO string
      expect(() => new Date(logEntry.datetime)).not.toThrow();
      expect(new Date(logEntry.datetime).toISOString()).toBe(logEntry.datetime);
    });

    it('should log different decision types (approve, block, undefined)', async () => {
      // Test approve decision
      const approveInput = createTestInput('Read', {
        file_path: '/test/file.txt',
      });
      await runCommand(JSON.stringify(approveInput));

      // Test block decision
      const blockInput = createTestInput('Bash', { command: 'rm -rf /' });
      await runCommand(JSON.stringify(blockInput));

      // Test undefined decision
      const undefinedInput = createTestInput('UnknownTool', {
        arbitrary: 'data',
      });
      await runCommand(JSON.stringify(undefinedInput));

      // Read and verify log entries
      const logContent = readFileSync(testLogFile, 'utf8');
      const logLines = logContent.trim().split('\n');
      expect(logLines).toHaveLength(3);

      const logEntries = logLines.map((line) => JSON.parse(line));

      // Find entries by tool name (order may vary)
      const approveEntry = logEntries.find((entry) => entry.tool === 'Read');
      const blockEntry = logEntries.find((entry) => entry.tool === 'Bash');
      const undefinedEntry = logEntries.find(
        (entry) => entry.tool === 'UnknownTool'
      );

      expect(approveEntry).toBeDefined();
      expect(approveEntry.decision).toBe('allow');
      expect(approveEntry.tool).toBe('Read');

      expect(blockEntry).toBeDefined();
      expect(blockEntry.decision).toBe('deny');
      expect(blockEntry.tool).toBe('Bash');

      expect(undefinedEntry).toBeDefined();
      expect(['undefined', 'deny', 'ask']).toContain(undefinedEntry.decision);
      expect(undefinedEntry.tool).toBe('UnknownTool');
    });

    it('should log multiple entries in JSONL format', async () => {
      // Execute multiple commands
      const commands = [
        { tool: 'Read', input: { file_path: '/test/1.txt' } },
        { tool: 'Write', input: { file_path: '/test/2.txt', content: 'test' } },
        { tool: 'LS', input: { path: '/test' } },
        { tool: 'Grep', input: { pattern: 'test', path: '/test' } },
      ];

      for (const cmd of commands) {
        const input = createTestInput(cmd.tool, cmd.input);
        await runCommand(JSON.stringify(input));
      }

      // Verify all entries were logged
      const logContent = readFileSync(testLogFile, 'utf8');
      const logLines = logContent.trim().split('\n');
      expect(logLines).toHaveLength(commands.length);

      // Verify each line is valid JSON
      for (let i = 0; i < logLines.length; i++) {
        const logEntry = JSON.parse(logLines[i]);
        expect(logEntry.tool).toBe(commands[i].tool);
        expect(logEntry.inputs).toEqual(commands[i].input);
        expect(logEntry.decision).toBe('allow'); // All these should be fast-approved
      }
    });

    it('should handle concurrent logging without corruption', async () => {
      // Run multiple commands concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const input = createTestInput('Read', {
          file_path: `/test/file${i}.txt`,
        });
        promises.push(runCommand(JSON.stringify(input)));
      }

      // Wait for all to complete
      const results = await Promise.all(promises);

      // Verify all succeeded
      for (const result of results) {
        expect(result.code).toBe(0);
      }

      // Verify log file integrity
      const logContent = readFileSync(testLogFile, 'utf8');
      const logLines = logContent.trim().split('\n');
      expect(logLines).toHaveLength(5);

      // Verify each line is valid JSON and has unique inputs
      const fileNumbers = new Set();
      for (const line of logLines) {
        const logEntry = JSON.parse(line);
        expect(logEntry.tool).toBe('Read');
        expect(logEntry.decision).toBe('allow');

        // Extract file number from path
        const match = logEntry.inputs.file_path.match(/file(\d+)\.txt$/);
        expect(match).toBeTruthy();
        fileNumbers.add(match[1]);
      }

      // Verify we have 5 unique file numbers
      expect(fileNumbers.size).toBe(5);
    });

    it('should include correct cwd and session_id in log entries', async () => {
      const sessionId = 'test-session-123';
      const input = {
        session_id: sessionId,
        transcript_path: '/tmp/test-transcript',
        tool_name: 'Read',
        tool_input: { file_path: '/test/file.txt' },
      };

      const result = await runCommand(JSON.stringify(input));
      expect(result.code).toBe(0);

      const logContent = readFileSync(testLogFile, 'utf8');
      const logEntry = JSON.parse(logContent.trim());

      expect(logEntry.session_id).toBe(sessionId);
      expect(logEntry.cwd).toBe(join(__dirname, '..'));
    });

    it('should not fail if logging directory does not exist', async () => {
      // Remove the test directory
      rmSync(testLogDir, { recursive: true, force: true });

      const input = createTestInput('Read', { file_path: '/test/file.txt' });
      const result = await runCommand(JSON.stringify(input));

      // Command should still succeed even if logging fails
      expect(result.code).toBe(0);

      // Log file should be created automatically
      expect(() => readFileSync(testLogFile, 'utf8')).not.toThrow();

      const logContent = readFileSync(testLogFile, 'utf8');
      const logEntry = JSON.parse(logContent.trim());
      expect(logEntry.tool).toBe('Read');
    });
  });

  describe('Caching functionality', () => {
    const testCacheDir = join(tmpdir(), 'ccb-test-caching');

    beforeEach(() => {
      // Set up test cache directory
      try {
        rmSync(testCacheDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist
      }
      mkdirSync(testCacheDir, { recursive: true });

      // Set environment variable for test config directory
      process.env.CCB_CONFIG_DIR = testCacheDir;
    });

    afterEach(() => {
      // Clean up test cache directory
      try {
        rmSync(testCacheDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist
      }
    });

    it('should use cache by default', async () => {
      // Set up config with cache enabled (default)
      const configPath = join(testCacheDir, 'config.json');
      writeFileSync(
        configPath,
        JSON.stringify({ log: false, cache: true, generalLog: false })
      );

      const input = createTestInput('Bash', { command: 'rm -rf /' });

      // First call - should hit LLM and cache result
      const result1 = await runCommand(JSON.stringify(input));
      expect(result1.code).toBe(0);
      const output1 = JSON.parse(result1.stdout);
      expect(output1.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output1.hookSpecificOutput.permissionDecisionReason).not.toContain(
        '(cached)'
      );

      // Second call - should use cache
      const result2 = await runCommand(JSON.stringify(input));
      expect(result2.code).toBe(0);
      const output2 = JSON.parse(result2.stdout);
      expect(output2.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output2.hookSpecificOutput.permissionDecisionReason).toContain(
        '(cached)'
      );
    });

    it('should not use cache when disabled', async () => {
      // Set up config with cache disabled
      const configPath = join(testCacheDir, 'config.json');
      writeFileSync(configPath, JSON.stringify({ log: false, cache: false }));

      const input = createTestInput('Bash', { command: 'rm -rf /' });

      // First call
      const result1 = await runCommand(JSON.stringify(input));
      expect(result1.code).toBe(0);
      const output1 = JSON.parse(result1.stdout);
      expect(output1.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output1.hookSpecificOutput.permissionDecisionReason).not.toContain(
        '(cached)'
      );

      // Second call - should NOT use cache since it's disabled
      const result2 = await runCommand(JSON.stringify(input));
      expect(result2.code).toBe(0);
      const output2 = JSON.parse(result2.stdout);
      expect(output2.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output2.hookSpecificOutput.permissionDecisionReason).not.toContain(
        '(cached)'
      );

      // Verify no cache file was created
      const cachePath = join(testCacheDir, 'approval_cache.json');
      expect(() => readFileSync(cachePath, 'utf8')).toThrow();
    });

    it('should work with cache enabled by default when no config exists', async () => {
      // No config file - should use defaults (cache enabled)
      const input = createTestInput('Bash', { command: 'rm -rf /' });

      // First call
      const result1 = await runCommand(JSON.stringify(input));
      expect(result1.code).toBe(0);
      const output1 = JSON.parse(result1.stdout);
      expect(output1.hookSpecificOutput.permissionDecision).toBe('deny');

      // Second call - should use cache (default behavior)
      const result2 = await runCommand(JSON.stringify(input));
      expect(result2.code).toBe(0);
      const output2 = JSON.parse(result2.stdout);
      expect(output2.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output2.hookSpecificOutput.permissionDecisionReason).toContain(
        '(cached)'
      );
    });
  });
});
