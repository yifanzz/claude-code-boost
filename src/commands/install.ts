import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, ensureConfigDir } from '../utils/config.js';

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
  };
  [key: string]: unknown;
}

interface NpmListOutput {
  dependencies?: {
    [key: string]: {
      version?: string;
      resolved?: string;
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
}

// Constants
const CLAUDE_SETTINGS_LOCAL_FILE = '.claude/settings.local.json';
const GITIGNORE_FILE = '.gitignore';
const CCB_PACKAGE_NAME = 'claude-code-boost';
const HOOK_COMMAND_SUFFIX = 'auto-approve-tools';

export interface InstallOptions {
  user?: boolean;
  project?: boolean;
  projectLocal?: boolean;
  apiKey?: string;
  nonInteractive?: boolean;
}

function getClaudeSettingsPath(options: InstallOptions): string {
  const home = process.env.HOME || '';

  if (options.user) {
    return join(home, '.claude', 'settings.json');
  } else if (options.project) {
    return join(process.cwd(), '.claude', 'settings.json');
  } else if (options.projectLocal) {
    return join(process.cwd(), '.claude', 'settings.local.json');
  }

  // Default to user settings
  return join(home, '.claude', 'settings.json');
}

function ensureDirectoryExists(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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

function createBackup(settingsPath: string): void {
  if (!existsSync(settingsPath)) {
    return;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:]/g, '-')
    .replace(/[.]/g, '-');
  const randomSuffix = randomBytes(4).toString('hex');
  const backupPath = settingsPath.replace(
    /(\.[^.]+)$/,
    `-${timestamp}-${randomSuffix}$1`
  );

  try {
    const content = readFileSync(settingsPath, 'utf8');
    writeFileSync(backupPath, content, { mode: 0o600 });
    console.log(`Created backup: ${backupPath}`);
  } catch (error) {
    console.warn(`Warning: Could not create backup: ${error}`);
  }
}

function saveClaudeSettings(
  settingsPath: string,
  settings: ClaudeSettings
): void {
  ensureDirectoryExists(settingsPath);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function validateHookCommand(command: string): boolean {
  // Basic validation for hook commands
  if (!command || typeof command !== 'string') {
    return false;
  }

  // Check length
  if (command.length > 500) {
    return false;
  }

  // Allow alphanumeric, path separators, dashes, dots, and spaces
  const validPattern = /^[a-zA-Z0-9/\\.\s-]+$/;
  return validPattern.test(command);
}

function validateNpmOutput(output: string): NpmListOutput | null {
  try {
    const parsed = JSON.parse(output);

    // Basic validation - should be an object
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    // If dependencies exists, it should be an object
    if (parsed.dependencies && typeof parsed.dependencies !== 'object') {
      return null;
    }

    return parsed as NpmListOutput;
  } catch {
    return null;
  }
}

function getCCBPath(): string {
  try {
    // Try to get the global npm path for ccb
    const npmOutput = execSync(
      `npm list -g ${CCB_PACKAGE_NAME} --depth=0 --json`,
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const npmData = validateNpmOutput(npmOutput);
    if (npmData?.dependencies?.[CCB_PACKAGE_NAME]) {
      return 'ccb';
    }
  } catch (error) {
    // Log the error for debugging but continue with fallback
    console.debug(
      `Could not find global CCB installation: ${error}, using local path instead`
    );
  }

  // If not globally installed, use the local path
  return join(process.cwd(), 'dist', 'index.js');
}

async function promptForInstallLocation(
  options: InstallOptions
): Promise<void> {
  if (options.nonInteractive) {
    return; // Skip prompts in non-interactive mode
  }

  // If location is already specified via flags, skip this prompt
  if (options.user || options.project || options.projectLocal) {
    return;
  }

  console.log('\n🚀 Welcome to Claude Code Boost setup!\n');
  console.log('Where would you like to install the CCB hook?\n');

  const { location } = await inquirer.prompt([
    {
      type: 'list',
      name: 'location',
      message: 'Choose installation location:',
      choices: [
        {
          name: 'User settings (recommended) - ~/.claude/settings.json',
          value: 'user',
        },
        {
          name: 'Project settings - .claude/settings.json',
          value: 'project',
        },
        {
          name: 'Project local settings - .claude/settings.local.json',
          value: 'project-local',
        },
      ],
    },
  ]);

  // Set the selected location on the options object
  if (location === 'user') {
    options.user = true;
  } else if (location === 'project') {
    options.project = true;
  } else if (location === 'project-local') {
    options.projectLocal = true;
  }
}

async function promptForAuthMethod(options: InstallOptions): Promise<void> {
  if (options.nonInteractive) {
    return; // Skip prompts in non-interactive mode
  }

  // Check if there's already an API key in the config
  ensureConfigDir();
  const existingConfig = loadConfig();
  const hasExistingApiKey =
    existingConfig.apiKey && existingConfig.apiKey.trim().length > 0;

  console.log('\nCCB can work in two ways:');
  console.log(
    '1. Use Claude CLI directly (requires `claude` command available)'
  );
  console.log('2. Use an API key/token for direct API access\n');

  // Build the choices array dynamically based on existing API key
  const choices = [
    {
      name: 'Use Claude CLI (recommended for most users)',
      value: 'cli',
    },
    {
      name: 'Use API key/token',
      value: 'api',
    },
  ];

  // Add option to use existing API key if one exists
  if (hasExistingApiKey) {
    const maskedApiKey = `${existingConfig.apiKey!.substring(0, 7)}...${existingConfig.apiKey!.substring(existingConfig.apiKey!.length - 4)}`;
    choices.splice(1, 0, {
      name: `Use existing API key (${maskedApiKey})`,
      value: 'existing',
    });
  }

  const { authMethod } = await inquirer.prompt([
    {
      type: 'list',
      name: 'authMethod',
      message: 'How would you like CCB to interact with Claude?',
      choices,
    },
  ]);

  if (authMethod === 'existing') {
    console.log('\n✅ Using existing API key from configuration.');
  } else if (authMethod === 'api') {
    console.log('\n💡 You need an Anthropic API key for direct API access.');
    console.log('   Get your API key from: https://console.anthropic.com/');
    console.log('   Your API key should start with "sk-"\n');

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Anthropic API key:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please enter a valid API key';
          }
          if (!input.startsWith('sk-')) {
            return 'Anthropic API keys should start with "sk-"';
          }
          return true;
        },
      },
    ]);

    // Save the API key to config
    const config = loadConfig();
    config.apiKey = apiKey.trim();
    saveConfig(config);

    console.log('\n✅ API key saved to configuration.');
  } else {
    console.log('\n✅ CCB will use Claude CLI for API access.');
  }
}

function updateGitignore(entry: string): void {
  const gitignorePath = join(process.cwd(), GITIGNORE_FILE);

  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, 'utf8');
    if (!gitignoreContent.includes(entry)) {
      writeFileSync(gitignorePath, gitignoreContent + '\n' + entry + '\n');
      console.log(`Added ${entry} to .gitignore`);
    }
  } else {
    writeFileSync(gitignorePath, entry + '\n');
    console.log(`Created .gitignore and added ${entry}`);
  }
}

function addHookToSettings(
  settings: ClaudeSettings,
  hookCommand: string
): void {
  // Validate the hook command before adding
  if (!validateHookCommand(hookCommand)) {
    throw new Error(`Invalid hook command: ${hookCommand}`);
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  settings.hooks.PreToolUse = [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: hookCommand,
        },
      ],
    },
  ];
}

function addHookToExistingArray(
  settings: ClaudeSettings,
  hookCommand: string
): void {
  // Validate the hook command before adding
  if (!validateHookCommand(hookCommand)) {
    throw new Error(`Invalid hook command: ${hookCommand}`);
  }

  const currentHook = settings.hooks?.PreToolUse as Array<{
    matcher: string;
    hooks: Array<{ type: string; command: string }>;
  }>;

  const newHook = {
    matcher: '*',
    hooks: [
      {
        type: 'command',
        command: hookCommand,
      },
    ],
  };

  settings.hooks!.PreToolUse = [newHook, ...currentHook];
}

function checkForExistingHook(
  settings: ClaudeSettings,
  hookCommand: string
): boolean {
  const currentHook = settings.hooks?.PreToolUse;

  if (typeof currentHook === 'string') {
    return currentHook === hookCommand;
  } else if (Array.isArray(currentHook)) {
    return currentHook.some((matcher) =>
      matcher.hooks.some((hook) => hook.command === hookCommand)
    );
  }

  return false;
}

function getLocationTypeString(options: InstallOptions): string {
  if (options.user) return 'user';
  if (options.project) return 'project';
  if (options.projectLocal) return 'project-local';
  return 'user'; // Default to user when no specific location is set
}

export async function install(options: InstallOptions): Promise<void> {
  // Interactive setup for installation location (if not specified via flags)
  await promptForInstallLocation(options);

  // Handle API key from command line options
  if (options.apiKey) {
    ensureConfigDir();
    const config = loadConfig();
    config.apiKey = options.apiKey;
    saveConfig(config);
    console.log('✅ Anthropic API key saved to configuration.');
  } else {
    // Interactive setup for auth method
    await promptForAuthMethod(options);
  }

  const settingsPath = getClaudeSettingsPath(options);
  const settings = loadClaudeSettings(settingsPath);

  // Create backup before making changes
  createBackup(settingsPath);

  const ccbPath = getCCBPath();
  const hookCommand = `${ccbPath} ${HOOK_COMMAND_SUFFIX}`;

  // Check if hook is already installed
  if (checkForExistingHook(settings, hookCommand)) {
    console.log('CCB auto-approve-tools hook is already installed.');
    return;
  }

  // Handle existing hooks
  const currentHook = settings.hooks?.PreToolUse;

  if (typeof currentHook === 'string') {
    console.error(
      'Conflict detected: A different PreToolUse hook is already configured.'
    );
    console.error(`Current hook: ${currentHook}`);
    console.error(`Proposed hook: ${hookCommand}`);
    console.error(
      'Please remove the existing hook first or use a different settings location.'
    );
    process.exit(1);
  } else if (Array.isArray(currentHook)) {
    // Add our hook to the existing array
    addHookToExistingArray(settings, hookCommand);
  } else {
    // Install the hook as new array format
    addHookToSettings(settings, hookCommand);
  }

  // Save the updated settings
  saveClaudeSettings(settingsPath, settings);

  // Configure git to ignore .claude/settings.local.json if we're using project local
  if (options.projectLocal) {
    updateGitignore(CLAUDE_SETTINGS_LOCAL_FILE);
  }

  const locationType = getLocationTypeString(options);
  console.log(
    `\n🎉 Successfully installed CCB auto-approve-tools hook to ${locationType} settings: ${settingsPath}`
  );
  console.log(
    '\n📖 CCB is now ready to intelligently auto-approve safe Claude Code operations!'
  );
}
