import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { notification } from '../src/commands/notification';

// Mock fs functions
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const mockReadFileSync = vi.mocked(readFileSync);
const mockSpawn = vi.mocked(spawn);

describe('notification', () => {
  const mockProcess = {
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReturnValue(
      mockProcess as unknown as ReturnType<typeof spawn>
    );

    // Mock process.exit
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Mock stderr.write
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create macOS notification with correct parameters', async () => {
    const testInput = {
      session_id: 'test-session',
      transcript_path: '/tmp/test.jsonl',
      cwd: '/test/directory',
      hook_event_name: 'Notification',
      message: 'Test message from Claude Code',
    };

    mockReadFileSync.mockReturnValue(JSON.stringify(testInput));

    // Mock successful process execution
    mockProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        // Call the callback synchronously
        callback(0);
      }
    });

    try {
      notification();
    } catch (error) {
      // Expect process.exit to be called
      expect(error.message).toBe('process.exit called');
    }

    expect(mockSpawn).toHaveBeenCalledWith(
      'terminal-notifier',
      [
        '-title',
        'Claude Code',
        '-message',
        'Test message from Claude Code',
        '-sound',
        'Glass',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
  });

  it('should handle messages with quotes correctly', async () => {
    const testInput = {
      session_id: 'test-session',
      transcript_path: '/tmp/test.jsonl',
      cwd: '/test/directory',
      hook_event_name: 'Notification',
      message: 'Message with "quotes" and backslashes\\',
    };

    mockReadFileSync.mockReturnValue(JSON.stringify(testInput));

    // Mock successful process execution
    mockProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        // Call the callback synchronously
        callback(0);
      }
    });

    try {
      notification();
    } catch (error) {
      // Expect process.exit to be called
      expect(error.message).toBe('process.exit called');
    }

    expect(mockSpawn).toHaveBeenCalledWith(
      'terminal-notifier',
      [
        '-title',
        'Claude Code',
        '-message',
        'Message with "quotes" and backslashes\\',
        '-sound',
        'Glass',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
  });

  it('should handle process errors', async () => {
    const testInput = {
      session_id: 'test-session',
      transcript_path: '/tmp/test.jsonl',
      cwd: '/test/directory',
      hook_event_name: 'Notification',
      message: 'Test message',
    };

    mockReadFileSync.mockReturnValue(JSON.stringify(testInput));

    // Remove unused variable

    // Mock process error
    mockProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        // Call the callback synchronously
        callback('terminal-notifier error');
      }
    });

    mockProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        // Call the callback synchronously
        callback(1);
      }
    });

    try {
      notification();
    } catch (error) {
      // Expect process.exit to be called
      expect(error.message).toBe('process.exit called');
    }

    expect(process.stderr.write).toHaveBeenCalledWith(
      'Failed to create notification: terminal-notifier error\n'
    );
  });

  it('should handle invalid JSON input', async () => {
    mockReadFileSync.mockReturnValue('invalid json');

    try {
      await notification();
    } catch (error) {
      // Expect process.exit to be called
      expect(error.message).toBe('process.exit called');
    }

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Error processing notification hook input:')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should handle invalid hook schema', async () => {
    const invalidInput = {
      session_id: 'test-session',
      hook_event_name: 'WrongHook', // Should be 'Notification'
      message: 'Test message',
    };

    mockReadFileSync.mockReturnValue(JSON.stringify(invalidInput));

    try {
      await notification();
    } catch (error) {
      // Expect process.exit to be called
      expect(error.message).toBe('process.exit called');
    }

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Error processing notification hook input:')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
