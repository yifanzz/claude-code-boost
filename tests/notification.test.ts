import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { notification } from '../src/commands/notification';

// Mock fs functions
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock node-notifier
vi.mock('node-notifier', () => ({
  default: {
    notify: vi.fn(),
  },
}));

const mockReadFileSync = vi.mocked(readFileSync);

// Import the mocked notify function
import notifier from 'node-notifier';
const mockNotify = vi.mocked(notifier.notify);

describe('notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

    try {
      await notification();
    } catch (error) {
      // Expect process.exit to be called
      expect(error.message).toBe('process.exit called');
    }

    expect(mockNotify).toHaveBeenCalledWith({
      title: 'Claude Code',
      message: 'Test message from Claude Code',
      sound: true,
      wait: false,
    });
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

    try {
      await notification();
    } catch (error) {
      // Expect process.exit to be called
      expect(error.message).toBe('process.exit called');
    }

    expect(mockNotify).toHaveBeenCalledWith({
      title: 'Claude Code',
      message: 'Message with "quotes" and backslashes\\',
      sound: true,
      wait: false,
    });
  });

  it('should handle notification errors', async () => {
    const testInput = {
      session_id: 'test-session',
      transcript_path: '/tmp/test.jsonl',
      cwd: '/test/directory',
      hook_event_name: 'Notification',
      message: 'Test message',
    };

    mockReadFileSync.mockReturnValue(JSON.stringify(testInput));

    // Mock node-notifier to throw an error
    mockNotify.mockImplementation(() => {
      throw new Error('notification failed');
    });

    try {
      await notification();
    } catch (error) {
      // Expect process.exit to be called
      expect(error.message).toBe('process.exit called');
    }

    expect(process.stderr.write).toHaveBeenCalledWith(
      'Error processing notification hook input: Error: notification failed\n'
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
      expect.stringContaining('JSON parsing error:')
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
