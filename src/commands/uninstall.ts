import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import inquirer from 'inquirer';
import { getConfigDir } from '../utils/config.js';

interface ClaudeSettings {
  hooks?: {
    PreToolUse?:
      | string
      | Array<{
          matcher: string;
          hooks: Array<{
            type: string;
            command: string;
          }>;
        }>;
    Notification?: Array<{
      matcher: string;
      hooks: Array<{
        type: string;
        command: string;
      }>;
    }>;
    Stop?: Array<{
      matcher: string;
      hooks: Array<{
        type: string;
        command: string;
      }>;
    }>;
  };
  [key: string]: unknown;
}

export interface UninstallOptions {
  removeConfig?: boolean;
  nonInteractive?: boolean;
}

function getUserSettingsPath(): string {
  const home = process.env.HOME || '';
  return join(home, '.claude', 'settings.json');
}

function loadClaudeSettings(settingsPath: string): ClaudeSettings {
  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const content = readFileSync(settingsPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${settingsPath}:`, error);
    return {};
  }
}

function saveClaudeSettings(
  settingsPath: string,
  settings: ClaudeSettings
): void {
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function createBackup(settingsPath: string): void {
  if (!existsSync(settingsPath)) {
    return;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:]/g, '-')
    .replace(/[.]/g, '-');
  const backupPath = settingsPath.replace(
    /(\.[^.]+)$/,
    `-backup-${timestamp}$1`
  );

  try {
    const content = readFileSync(settingsPath, 'utf8');
    writeFileSync(backupPath, content, { mode: 0o600 });
    console.log(`Created backup: ${backupPath}`);
  } catch (error) {
    console.warn(`Warning: Could not create backup: ${error}`);
  }
}

function removeCCBHooks(settings: ClaudeSettings): boolean {
  let hasChanges = false;

  if (!settings.hooks) {
    return false;
  }

  // Handle PreToolUse hooks
  if (settings.hooks.PreToolUse) {
    if (typeof settings.hooks.PreToolUse === 'string') {
      // Check if it's a CCB command
      if (settings.hooks.PreToolUse.includes('ccb auto-approve-tools')) {
        delete settings.hooks.PreToolUse;
        hasChanges = true;
      }
    } else if (Array.isArray(settings.hooks.PreToolUse)) {
      const originalLength = settings.hooks.PreToolUse.length;
      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
        (matcher) => {
          // Remove any matcher that contains CCB commands
          matcher.hooks = matcher.hooks.filter((hook) => {
            return !hook.command.includes('ccb auto-approve-tools');
          });
          // Keep matcher only if it still has hooks after filtering
          return matcher.hooks.length > 0;
        }
      );

      if (
        settings.hooks.PreToolUse.length !== originalLength ||
        settings.hooks.PreToolUse.length === 0
      ) {
        hasChanges = true;
      }

      if (settings.hooks.PreToolUse.length === 0) {
        delete settings.hooks.PreToolUse;
      }
    }
  }

  // Handle Notification hooks
  if (Array.isArray(settings.hooks.Notification)) {
    const originalLength = settings.hooks.Notification.length;
    settings.hooks.Notification = settings.hooks.Notification.filter(
      (matcher) => {
        matcher.hooks = matcher.hooks.filter((hook) => {
          return !hook.command.includes('ccb notification');
        });
        return matcher.hooks.length > 0;
      }
    );

    if (
      settings.hooks.Notification.length !== originalLength ||
      settings.hooks.Notification.length === 0
    ) {
      hasChanges = true;
    }

    if (settings.hooks.Notification.length === 0) {
      delete settings.hooks.Notification;
    }
  }

  // Handle Stop hooks
  if (Array.isArray(settings.hooks.Stop)) {
    const originalLength = settings.hooks.Stop.length;
    settings.hooks.Stop = settings.hooks.Stop.filter((matcher) => {
      matcher.hooks = matcher.hooks.filter((hook) => {
        return !hook.command.includes('ccb enforce-tests');
      });
      return matcher.hooks.length > 0;
    });

    if (
      settings.hooks.Stop.length !== originalLength ||
      settings.hooks.Stop.length === 0
    ) {
      hasChanges = true;
    }

    if (settings.hooks.Stop.length === 0) {
      delete settings.hooks.Stop;
    }
  }

  // Clean up empty hooks object
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return hasChanges;
}

export async function uninstall(options: UninstallOptions): Promise<void> {
  const userSettingsPath = getUserSettingsPath();

  console.log('🗑️  CCB Uninstaller');
  console.log('=================\n');

  // Check if user settings file exists
  if (!existsSync(userSettingsPath)) {
    console.log('No Claude Code user settings found. Nothing to uninstall.');

    // Still offer to remove config if it exists
    if (existsSync(getConfigDir())) {
      await handleConfigRemoval(options);
    }
    return;
  }

  // Load and check for CCB hooks
  const settings = loadClaudeSettings(userSettingsPath);
  let hasCCBHooks = false;

  // Check if any CCB hooks exist
  if (settings.hooks?.PreToolUse) {
    if (typeof settings.hooks.PreToolUse === 'string') {
      hasCCBHooks = settings.hooks.PreToolUse.includes(
        'ccb auto-approve-tools'
      );
    } else if (Array.isArray(settings.hooks.PreToolUse)) {
      hasCCBHooks = settings.hooks.PreToolUse.some((matcher) =>
        matcher.hooks.some((hook) =>
          hook.command.includes('ccb auto-approve-tools')
        )
      );
    }
  }

  if (!hasCCBHooks && settings.hooks?.Notification) {
    hasCCBHooks = settings.hooks.Notification.some((matcher) =>
      matcher.hooks.some((hook) => hook.command.includes('ccb notification'))
    );
  }

  if (!hasCCBHooks && settings.hooks?.Stop) {
    hasCCBHooks = settings.hooks.Stop.some((matcher) =>
      matcher.hooks.some((hook) => hook.command.includes('ccb enforce-tests'))
    );
  }

  if (!hasCCBHooks) {
    console.log('No CCB hooks found in user settings. Nothing to uninstall.');

    // Still offer to remove config if it exists
    if (existsSync(getConfigDir())) {
      await handleConfigRemoval(options);
    }
    return;
  }

  // Confirm uninstallation
  if (!options.nonInteractive) {
    const { confirmUninstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUninstall',
        message: 'Remove CCB hooks from user settings?',
        default: false,
      },
    ]);

    if (!confirmUninstall) {
      console.log('Uninstall cancelled.');
      return;
    }
  }

  // Create backup and remove hooks
  createBackup(userSettingsPath);
  const hasChanges = removeCCBHooks(settings);

  if (hasChanges) {
    saveClaudeSettings(userSettingsPath, settings);
    console.log(`✅ Successfully removed CCB hooks from: ${userSettingsPath}`);
  } else {
    console.log('No CCB hooks were found to remove.');
  }

  // Warning about project-specific configurations
  console.log(
    '\n⚠️  Important: This only removes CCB from your user settings.'
  );
  console.log(
    '   If you have CCB installed in project-specific settings, you need to'
  );
  console.log('   manually remove it from:');
  console.log('   • .claude/settings.json (project settings)');
  console.log('   • .claude/settings.local.json (project local settings)');

  // Handle config removal
  await handleConfigRemoval(options);
}

async function handleConfigRemoval(options: UninstallOptions): Promise<void> {
  const configDir = getConfigDir();

  if (!existsSync(configDir)) {
    return;
  }

  if (options.removeConfig) {
    // Non-interactive mode with --remove-config flag
    rmSync(configDir, { recursive: true, force: true });
    console.log(`\n🗂️  Removed CCB configuration directory: ${configDir}`);
    return;
  }

  if (options.nonInteractive) {
    // Non-interactive mode without --remove-config flag
    console.log(`\n🗂️  CCB configuration directory preserved: ${configDir}`);
    console.log('   Use --remove-config flag to remove it automatically.');
    return;
  }

  // Interactive mode - ask user
  console.log(`\n🗂️  CCB configuration directory found: ${configDir}`);
  console.log('   This contains your API keys and settings.');

  const { removeConfig } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'removeConfig',
      message: 'Do you want to remove the CCB configuration directory?',
      default: false,
    },
  ]);

  if (removeConfig) {
    rmSync(configDir, { recursive: true, force: true });
    console.log(`✅ Removed CCB configuration directory: ${configDir}`);
  } else {
    console.log(`📁 CCB configuration directory preserved: ${configDir}`);
  }
}
