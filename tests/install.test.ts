import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { install } from '../src/commands/install';

// Mock fs functions
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock crypto
vi.mock('crypto', () => ({
  randomBytes: vi.fn(),
}));

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

// Mock config utilities
vi.mock('../src/utils/config', () => ({
  loadConfig: vi.fn(() => ({ log: true })),
  saveConfig: vi.fn(),
  ensureConfigDir: vi.fn(),
}));

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockExecSync = vi.mocked(execSync);
const mockRandomBytes = vi.mocked(randomBytes);

describe('install', () => {
  const originalHome = process.env.HOME;
  const testHome = '/test/home';
  const testCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HOME = testHome;
    vi.spyOn(process, 'cwd').mockReturnValue(testCwd);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit called with code ${code}`);
    });

    // Set default mock for randomBytes
    mockRandomBytes.mockReturnValue(Buffer.from([0xd0, 0x51, 0x95, 0x5a]));
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  describe('settings path resolution', () => {
    it('should use user settings by default', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        join(testHome, '.claude', 'settings.json'),
        expect.any(String)
      );
    });

    it('should use user settings when --user flag is provided', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ user: true, nonInteractive: true });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        join(testHome, '.claude', 'settings.json'),
        expect.any(String)
      );
    });

    it('should use project settings when --project flag is provided', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ project: true, nonInteractive: true });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        join(testCwd, '.claude', 'settings.json'),
        expect.any(String)
      );
    });

    it('should use project local settings when --project-local flag is provided', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ projectLocal: true, nonInteractive: true });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        join(testCwd, '.claude', 'settings.local.json'),
        expect.any(String)
      );
    });
  });

  describe('backup creation', () => {
    it('should create backup of existing settings file', async () => {
      const settingsPath = join(testHome, '.claude', 'settings.json');
      const existingSettings = '{"existing": "config"}';

      mockExistsSync.mockImplementation((path) => {
        return path === settingsPath;
      });
      mockReadFileSync.mockReturnValue(existingSettings);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      await install({ nonInteractive: true });

      const expectedBackupPath = join(
        testHome,
        '.claude',
        'settings-2023-01-01T12-00-00-000Z-d051955a.json'
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expectedBackupPath,
        existingSettings,
        { mode: 0o600 }
      );
    });

    it('should not create backup if settings file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      // Should not call writeFileSync for backup, only for new settings
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('CCB path resolution', () => {
    it('should use "ccb" when globally installed', async () => {
      const npmOutput = JSON.stringify({
        dependencies: {
          'claude-code-boost': { version: '1.0.0' },
        },
      });

      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockReturnValue(npmOutput);

      await install({ nonInteractive: true });

      const expectedSettings = JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: 'ccb auto-approve-tools',
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expectedSettings
      );
    });

    it('should use local path when not globally installed', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      const expectedCommand =
        join(testCwd, 'dist', 'index.js') + ' auto-approve-tools';
      const expectedSettings = JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: expectedCommand,
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expectedSettings
      );
    });
  });

  describe('hook installation', () => {
    const testCommand =
      join(testCwd, 'dist', 'index.js') + ' auto-approve-tools';

    it('should install hook to empty settings', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      const expectedSettings = JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: testCommand,
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expectedSettings
      );
    });

    it('should preserve existing settings when installing hook', async () => {
      const existingSettings = {
        permissions: {
          allow: ['Bash(npm init:*)'],
          deny: [],
        },
        defaultMode: 'acceptEdits',
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingSettings));
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      const expectedSettings = JSON.stringify(
        {
          ...existingSettings,
          hooks: {
            PreToolUse: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: testCommand,
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expectedSettings
      );
    });

    it('should detect when hook is already installed', async () => {
      const existingSettings = {
        hooks: {
          PreToolUse: [
            {
              matcher: '*',
              hooks: [
                {
                  type: 'command',
                  command: testCommand,
                },
              ],
            },
          ],
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingSettings));
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      expect(console.log).toHaveBeenCalledWith(
        'CCB auto-approve-tools hook is already installed.'
      );
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1); // Only backup, no settings write
    });

    it('should add hook to existing array configuration', async () => {
      const existingHooks = [
        {
          matcher: 'specific-tool',
          hooks: [
            {
              type: 'command',
              command: 'other-hook',
            },
          ],
        },
      ];

      const existingSettings = {
        hooks: {
          PreToolUse: existingHooks,
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingSettings));
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      const expectedSettings = JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: testCommand,
                  },
                ],
              },
              ...existingHooks,
            ],
          },
        },
        null,
        2
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expectedSettings
      );
    });

    it('should exit with error when conflicting string hook exists', async () => {
      const existingSettings = {
        hooks: {
          PreToolUse: 'different-hook-command',
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingSettings));
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await expect(() => install({ nonInteractive: true })).rejects.toThrow(
        'process.exit called with code 1'
      );
      expect(console.error).toHaveBeenCalledWith(
        'Conflict detected: A different PreToolUse hook is already configured.'
      );
    });
  });

  describe('git integration', () => {
    it('should add settings.local.json to .gitignore for project-local install', async () => {
      const gitignorePath = join(testCwd, '.gitignore');
      const existingGitignore = 'node_modules\n.env\n';

      mockExistsSync.mockImplementation((path) => {
        return path === gitignorePath;
      });
      mockReadFileSync.mockImplementation((path) => {
        if (path === gitignorePath) {
          return existingGitignore;
        }
        return '{}';
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ projectLocal: true, nonInteractive: true });

      // Check that both files were written
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        join(testCwd, '.claude', 'settings.local.json'),
        expect.any(String)
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        gitignorePath,
        existingGitignore + '\n' + '.claude/settings.local.json' + '\n'
      );
    });

    it('should create .gitignore if it does not exist for project-local install', async () => {
      const gitignorePath = join(testCwd, '.gitignore');

      mockExistsSync.mockImplementation((path) => {
        return path !== gitignorePath; // gitignore doesn't exist
      });
      mockReadFileSync.mockImplementation(() => '{}');
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ projectLocal: true, nonInteractive: true });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        gitignorePath,
        '.claude/settings.local.json\n'
      );
      // Also expect the settings file to be written
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        join(testCwd, '.claude', 'settings.local.json'),
        expect.any(String)
      );
    });

    it('should not modify .gitignore if entry already exists', async () => {
      const gitignorePath = join(testCwd, '.gitignore');
      const existingGitignore =
        'node_modules\n.claude/settings.local.json\n.env\n';

      mockExistsSync.mockImplementation((path) => {
        return path === gitignorePath;
      });
      mockReadFileSync.mockImplementation((path) => {
        if (path === gitignorePath) {
          return existingGitignore;
        }
        return '{}';
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ projectLocal: true, nonInteractive: true });

      // Should not write to gitignore since entry already exists
      expect(mockWriteFileSync).not.toHaveBeenCalledWith(
        gitignorePath,
        expect.any(String)
      );
      // But should still write the settings file
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        join(testCwd, '.claude', 'settings.local.json'),
        expect.any(String)
      );
    });

    it('should not modify .gitignore for non-project-local installs', async () => {
      const gitignorePath = join(testCwd, '.gitignore');

      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ user: true, nonInteractive: true });

      expect(mockWriteFileSync).not.toHaveBeenCalledWith(
        gitignorePath,
        expect.any(String)
      );
      // Should write the user settings file
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        join(testHome, '.claude', 'settings.json'),
        expect.any(String)
      );
    });
  });

  describe('directory creation', () => {
    it('should create .claude directory if it does not exist', async () => {
      const claudeDir = join(testHome, '.claude');

      mockExistsSync.mockImplementation((path) => {
        return path !== claudeDir; // Directory doesn't exist
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      expect(mockMkdirSync).toHaveBeenCalledWith(claudeDir, {
        recursive: true,
      });
    });

    it('should not create directory if it already exists', async () => {
      const claudeDir = join(testHome, '.claude');

      mockExistsSync.mockImplementation((path) => {
        return path === claudeDir; // Directory exists
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle JSON parsing errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      await install({ nonInteractive: true });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error reading'),
        expect.any(Error)
      );
    });

    it('should handle backup creation errors gracefully', async () => {
      const settingsPath = join(testHome, '.claude', 'settings.json');

      mockExistsSync.mockImplementation((path) => {
        return path === settingsPath;
      });
      mockReadFileSync.mockImplementation((path) => {
        if (path === settingsPath) {
          return '{"existing": "config"}';
        }
        throw new Error('Backup read error');
      });
      mockWriteFileSync.mockImplementation((path, _content) => {
        if (path.includes('-2023-01-01T12-00-00-000Z')) {
          throw new Error('Backup write error');
        }
        // Allow other writes to succeed
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      await install({ nonInteractive: true });

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not create backup:')
      );
    });
  });
});
