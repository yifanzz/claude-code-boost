import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from 'fs';
import { join } from 'path';
import { uninstall } from './uninstall.js';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock('../utils/config.js', () => ({
  getConfigDir: () => '/tmp/ccb-test-config',
}));

// Get the mocked inquirer
import inquirer from 'inquirer';

describe('uninstall', () => {
  const testDir = '/tmp/ccb-uninstall-test';
  const userSettingsPath = join(testDir, '.claude', 'settings.json');
  const configDir = '/tmp/ccb-test-config';

  beforeEach(() => {
    // Clear mocks
    vi.clearAllMocks();

    // Mock HOME environment variable
    process.env.HOME = testDir;

    // Clean up any existing test directories
    try {
      rmSync(testDir, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(() => {
    // Clean up test directories
    try {
      rmSync(testDir, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should handle missing user settings file', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({ nonInteractive: true });

    expect(consoleSpy).toHaveBeenCalledWith(
      'No Claude Code user settings found. Nothing to uninstall.'
    );

    consoleSpy.mockRestore();
  });

  it('should handle settings file with no CCB hooks', async () => {
    // Create settings directory and file
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(
      userSettingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: 'some-other-command',
            Notification: [],
          },
        },
        null,
        2
      )
    );

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({ nonInteractive: true });

    expect(consoleSpy).toHaveBeenCalledWith(
      'No CCB hooks found in user settings. Nothing to uninstall.'
    );

    consoleSpy.mockRestore();
  });

  it('should remove CCB hooks from string PreToolUse hook', async () => {
    // Create settings directory and file
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(
      userSettingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: 'ccb auto-approve-tools',
          },
        },
        null,
        2
      )
    );

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({ nonInteractive: true });

    // Check that settings were updated
    const updatedSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8'));
    expect(updatedSettings.hooks?.PreToolUse).toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      `✅ Successfully removed CCB hooks from: ${userSettingsPath}`
    );

    consoleSpy.mockRestore();
  });

  it('should remove CCB hooks from array format hooks', async () => {
    // Create settings directory and file
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(
      userSettingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: '*',
                hooks: [
                  { type: 'command', command: 'ccb auto-approve-tools' },
                  { type: 'command', command: 'other-command' },
                ],
              },
            ],
            Notification: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'ccb notification' }],
              },
            ],
            Stop: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'ccb enforce-tests' }],
              },
            ],
          },
        },
        null,
        2
      )
    );

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({ nonInteractive: true });

    // Check that CCB hooks were removed but other hooks preserved
    const updatedSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8'));

    // PreToolUse should still exist with the other command
    expect(updatedSettings.hooks?.PreToolUse).toHaveLength(1);
    expect(updatedSettings.hooks.PreToolUse[0].hooks).toHaveLength(1);
    expect(updatedSettings.hooks.PreToolUse[0].hooks[0].command).toBe(
      'other-command'
    );

    // Notification and Stop should be removed completely
    expect(updatedSettings.hooks?.Notification).toBeUndefined();
    expect(updatedSettings.hooks?.Stop).toBeUndefined();

    consoleSpy.mockRestore();
  });

  it('should create backup before making changes', async () => {
    // Create settings directory and file
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    const originalSettings = {
      hooks: { PreToolUse: 'ccb auto-approve-tools' },
    };
    writeFileSync(userSettingsPath, JSON.stringify(originalSettings, null, 2));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({ nonInteractive: true });

    // Check that backup was created
    const backupFiles = readdirSync(join(testDir, '.claude')).filter(
      (file: string) => file.includes('backup')
    );

    expect(backupFiles.length).toBe(1);

    // Verify backup contains original content
    const backupPath = join(testDir, '.claude', backupFiles[0]);
    const backupContent = JSON.parse(readFileSync(backupPath, 'utf8'));
    expect(backupContent).toEqual(originalSettings);

    consoleSpy.mockRestore();
  });

  it('should prompt for confirmation in interactive mode', async () => {
    // Create settings directory and file
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(
      userSettingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: 'ccb auto-approve-tools',
          },
        },
        null,
        2
      )
    );

    // Mock user declining uninstall
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({
      confirmUninstall: false,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({});

    expect(vi.mocked(inquirer.prompt)).toHaveBeenCalledWith([
      {
        type: 'confirm',
        name: 'confirmUninstall',
        message: 'Remove CCB hooks from user settings?',
        default: false,
      },
    ]);

    expect(consoleSpy).toHaveBeenCalledWith('Uninstall cancelled.');

    // Settings should remain unchanged
    const settings = JSON.parse(readFileSync(userSettingsPath, 'utf8'));
    expect(settings.hooks.PreToolUse).toBe('ccb auto-approve-tools');

    consoleSpy.mockRestore();
  });

  it('should show warning about project-specific configurations', async () => {
    // Create settings directory and file
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(
      userSettingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: 'ccb auto-approve-tools',
          },
        },
        null,
        2
      )
    );

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({ nonInteractive: true });

    expect(consoleSpy).toHaveBeenCalledWith(
      '\n⚠️  Important: This only removes CCB from your user settings.'
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '   If you have CCB installed in project-specific settings, you need to'
    );
    expect(consoleSpy).toHaveBeenCalledWith('   manually remove it from:');
    expect(consoleSpy).toHaveBeenCalledWith(
      '   • .claude/settings.json (project settings)'
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '   • .claude/settings.local.json (project local settings)'
    );

    consoleSpy.mockRestore();
  });

  it('should handle config directory removal with --remove-config flag', async () => {
    // Create config directory
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{"apiKey": "test-key"}');

    // Create settings file with no CCB hooks (to skip uninstall)
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(userSettingsPath, JSON.stringify({ hooks: {} }, null, 2));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({ nonInteractive: true, removeConfig: true });

    expect(existsSync(configDir)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      `\n🗂️  Removed CCB configuration directory: ${configDir}`
    );

    consoleSpy.mockRestore();
  });

  it('should prompt for config removal in interactive mode', async () => {
    // Create config directory
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{"apiKey": "test-key"}');

    // Create settings file with no CCB hooks (to skip uninstall)
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(userSettingsPath, JSON.stringify({ hooks: {} }, null, 2));

    // Mock user choosing to remove config
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ removeConfig: true });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({});

    expect(vi.mocked(inquirer.prompt)).toHaveBeenCalledWith([
      {
        type: 'confirm',
        name: 'removeConfig',
        message: 'Do you want to remove the CCB configuration directory?',
        default: false,
      },
    ]);

    expect(existsSync(configDir)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      `✅ Removed CCB configuration directory: ${configDir}`
    );

    consoleSpy.mockRestore();
  });

  it('should preserve config when user declines removal', async () => {
    // Create config directory
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{"apiKey": "test-key"}');

    // Create settings file with no CCB hooks (to skip uninstall)
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(userSettingsPath, JSON.stringify({ hooks: {} }, null, 2));

    // Mock user choosing not to remove config
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ removeConfig: false });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstall({});

    expect(existsSync(configDir)).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      `📁 CCB configuration directory preserved: ${configDir}`
    );

    consoleSpy.mockRestore();
  });
});
