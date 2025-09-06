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
  openaiApiKey?: string;
  beyondthehypeApiKey?: string;
  baseUrl?: string;
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
  const hasExistingAnthropicKey =
    existingConfig.apiKey && existingConfig.apiKey.trim().length > 0;
  const hasExistingOpenAIKey =
    existingConfig.openaiApiKey &&
    existingConfig.openaiApiKey.trim().length > 0;
  const hasExistingBeyondthehypeKey =
    existingConfig.beyondthehypeApiKey &&
    existingConfig.beyondthehypeApiKey.trim().length > 0;

  console.log('\nCCB can work in three ways:');
  console.log('1. Use beyondthehype.dev API proxy (https://litellm.yifan.dev/) [recommended]');
  console.log('2. Use an Anthropic API key for direct Claude API access');
  console.log('3. Use OpenAI-compatible API (OpenAI, OpenRouter, etc.)\n');

  // Build the choices array dynamically based on existing API key
  const choices = [
    {
      name: 'Use beyondthehype.dev API proxy (recommended)',
      value: 'beyondthehype',
    },
    {
      name: 'Use Anthropic API key',
      value: 'anthropic',
    },
    {
      name: 'Use OpenAI-compatible API',
      value: 'openai',
    },
  ];

  // Add option to use existing beyondthehype API key if one exists
  if (hasExistingBeyondthehypeKey) {
    const maskedApiKey = `${existingConfig.beyondthehypeApiKey!.substring(0, 7)}...${existingConfig.beyondthehypeApiKey!.substring(existingConfig.beyondthehypeApiKey!.length - 4)}`;
    choices.splice(1, 0, {
      name: `Use existing beyondthehype API key (${maskedApiKey})`,
      value: 'existing-beyondthehype',
    });
  }

  // Add option to use existing Anthropic API key if one exists
  if (hasExistingAnthropicKey) {
    const maskedApiKey = `${existingConfig.apiKey!.substring(0, 7)}...${existingConfig.apiKey!.substring(existingConfig.apiKey!.length - 4)}`;
    choices.splice(-2, 0, {
      name: `Use existing Anthropic API key (${maskedApiKey})`,
      value: 'existing-anthropic',
    });
  }

  // Add option to use existing OpenAI API key if one exists
  if (hasExistingOpenAIKey) {
    const maskedApiKey = `${existingConfig.openaiApiKey!.substring(0, 7)}...${existingConfig.openaiApiKey!.substring(existingConfig.openaiApiKey!.length - 4)}`;
    choices.splice(-1, 0, {
      name: `Use existing OpenAI API key (${maskedApiKey})`,
      value: 'existing-openai',
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

  if (authMethod === 'existing-beyondthehype') {
    console.log('\n✅ Using existing beyondthehype API key from configuration.');
  } else if (authMethod === 'existing-anthropic') {
    console.log('\n✅ Using existing Anthropic API key from configuration.');
  } else if (authMethod === 'existing-openai') {
    console.log('\n✅ Using existing OpenAI API key from configuration.');
  } else if (authMethod === 'beyondthehype') {
    console.log('\n💡 You need an API key for beyondthehype.dev proxy access.');
    console.log('   Contact the administrator for an API key.');
    console.log('   The proxy runs at: https://litellm.yifan.dev/\n');

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your beyondthehype API key:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please enter a valid API key';
          }
          return true;
        },
      },
    ]);

    // Save the API key to config and set auth method
    const config = loadConfig();
    config.beyondthehypeApiKey = apiKey.trim();
    config.authMethod = 'beyondthehype';
    saveConfig(config);

    console.log('\n✅ beyondthehype API key saved to configuration.');
  } else if (authMethod === 'anthropic') {
    console.log(
      '\n💡 You need an Anthropic API key for direct Claude API access.'
    );
    console.log('   Get your API key from: https://console.anthropic.com/');
    console.log('   Your API key should start with "sk-ant-"\n');

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Anthropic API key:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please enter a valid API key';
          }
          if (!input.startsWith('sk-ant-')) {
            return 'Anthropic API keys should start with "sk-ant-"';
          }
          return true;
        },
      },
    ]);

    // Save the API key to config and set auth method
    const config = loadConfig();
    config.apiKey = apiKey.trim();
    config.authMethod = 'openai-compatible'; // Anthropic key uses openai-compatible method
    saveConfig(config);

    console.log('\n✅ Anthropic API key saved to configuration.');
  } else if (authMethod === 'openai') {
    console.log('\n💡 You need an OpenAI API key for API access.');
    console.log('   Options include:');
    console.log('   • OpenAI official: https://platform.openai.com/api-keys');
    console.log('   • OpenRouter: https://openrouter.ai/keys');
    console.log('   • Other OpenAI-compatible providers\n');

    const responses = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'Which provider would you like to use?',
        choices: [
          {
            name: 'OpenAI (official) - https://api.openai.com/v1',
            value: 'openai',
          },
          {
            name: 'OpenRouter - https://openrouter.ai/api/v1',
            value: 'openrouter',
          },
          {
            name: 'Custom OpenAI-compatible endpoint',
            value: 'custom',
          },
        ],
        default: 'openai',
      },
    ]);

    let baseUrl: string | undefined;
    let apiKeyHelp: string;
    let apiKeyPrefix: string;

    if (responses.provider === 'openai') {
      baseUrl = undefined; // Use default OpenAI endpoint
      apiKeyHelp =
        'Get your API key from: https://platform.openai.com/api-keys';
      apiKeyPrefix = 'sk-';
    } else if (responses.provider === 'openrouter') {
      baseUrl = 'https://openrouter.ai/api/v1';
      apiKeyHelp = 'Get your API key from: https://openrouter.ai/keys';
      apiKeyPrefix = 'sk-';
    } else {
      const { customUrl } = await inquirer.prompt([
        {
          type: 'input',
          name: 'customUrl',
          message: 'Enter your custom OpenAI-compatible endpoint URL:',
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Please enter a valid URL';
            }
            try {
              new URL(input.trim());
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          },
        },
      ]);
      baseUrl = customUrl.trim();
      apiKeyHelp = 'Enter your API key from your provider';
      apiKeyPrefix = ''; // Custom providers may have different key formats
    }

    console.log(`\n💡 ${apiKeyHelp}`);
    if (apiKeyPrefix) {
      console.log(`   Your API key should start with "${apiKeyPrefix}"\n`);
    } else {
      console.log('   Check your provider documentation for key format\n');
    }

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your API key:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please enter a valid API key';
          }
          if (apiKeyPrefix && !input.startsWith(apiKeyPrefix)) {
            return `API keys for this provider should start with "${apiKeyPrefix}"`;
          }
          return true;
        },
      },
    ]);

    // Save the API key and base URL to config and set auth method
    const config = loadConfig();
    config.openaiApiKey = apiKey.trim();
    config.authMethod = 'openai-compatible';
    if (baseUrl) {
      config.baseUrl = baseUrl;
    }
    saveConfig(config);

    console.log('\n✅ OpenAI-compatible API configuration saved.');
  } else {
    // Default to beyondthehype - set auth method
    const config = loadConfig();
    config.authMethod = 'beyondthehype';
    saveConfig(config);
    console.log('\n✅ CCB will use beyondthehype.dev API proxy for access.');
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

function addHooksToSettings(
  settings: ClaudeSettings,
  preToolUseCommand: string,
  notificationCommand: string,
  stopCommand: string
): void {
  // Validate the hook commands before adding
  if (!validateHookCommand(preToolUseCommand)) {
    throw new Error(`Invalid PreToolUse hook command: ${preToolUseCommand}`);
  }
  if (!validateHookCommand(notificationCommand)) {
    throw new Error(
      `Invalid Notification hook command: ${notificationCommand}`
    );
  }
  if (!validateHookCommand(stopCommand)) {
    throw new Error(`Invalid Stop hook command: ${stopCommand}`);
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
          command: preToolUseCommand,
        },
      ],
    },
  ];

  settings.hooks.Notification = [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: notificationCommand,
        },
      ],
    },
  ];

  settings.hooks.Stop = [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: stopCommand,
        },
      ],
    },
  ];
}

function addHooksToExistingArray(
  settings: ClaudeSettings,
  preToolUseCommand: string,
  notificationCommand: string
): void {
  // Validate the hook commands before adding
  if (!validateHookCommand(preToolUseCommand)) {
    throw new Error(`Invalid PreToolUse hook command: ${preToolUseCommand}`);
  }
  if (!validateHookCommand(notificationCommand)) {
    throw new Error(
      `Invalid Notification hook command: ${notificationCommand}`
    );
  }

  const currentPreToolUse = settings.hooks?.PreToolUse as Array<{
    matcher: string;
    hooks: Array<{ type: string; command: string }>;
  }>;

  const newPreToolUseHook = {
    matcher: '*',
    hooks: [
      {
        type: 'command',
        command: preToolUseCommand,
      },
    ],
  };

  settings.hooks!.PreToolUse = [newPreToolUseHook, ...currentPreToolUse];

  // Add notification hook (create new array since it likely doesn't exist)
  const newNotificationHook = [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: notificationCommand,
        },
      ],
    },
  ];

  settings.hooks!.Notification = newNotificationHook;
}

function checkForExistingHooks(
  settings: ClaudeSettings,
  preToolUseCommand: string,
  notificationCommand: string
): { preToolUse: boolean; notification: boolean } {
  const currentPreToolUse = settings.hooks?.PreToolUse;
  const currentNotification = settings.hooks?.Notification;

  let preToolUseExists = false;
  let notificationExists = false;

  // Check PreToolUse hook
  if (typeof currentPreToolUse === 'string') {
    preToolUseExists = currentPreToolUse === preToolUseCommand;
  } else if (Array.isArray(currentPreToolUse)) {
    preToolUseExists = currentPreToolUse.some((matcher) =>
      matcher.hooks.some((hook) => hook.command === preToolUseCommand)
    );
  }

  // Check Notification hook
  if (Array.isArray(currentNotification)) {
    notificationExists = currentNotification.some((matcher) =>
      matcher.hooks.some((hook) => hook.command === notificationCommand)
    );
  }

  return { preToolUse: preToolUseExists, notification: notificationExists };
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
    config.authMethod = 'openai-compatible';
    saveConfig(config);
    console.log('✅ Anthropic API key saved to configuration.');
  } else if (options.beyondthehypeApiKey) {
    ensureConfigDir();
    const config = loadConfig();
    config.beyondthehypeApiKey = options.beyondthehypeApiKey;
    config.authMethod = 'beyondthehype';
    saveConfig(config);
    console.log('✅ beyondthehype API key saved to configuration.');
  } else if (options.openaiApiKey) {
    ensureConfigDir();
    const config = loadConfig();
    config.openaiApiKey = options.openaiApiKey;
    config.authMethod = 'openai-compatible';
    if (options.baseUrl) {
      config.baseUrl = options.baseUrl;
    }
    saveConfig(config);
    console.log('✅ OpenAI-compatible API configuration saved.');
  } else {
    // Interactive setup for auth method
    await promptForAuthMethod(options);
  }

  const settingsPath = getClaudeSettingsPath(options);
  const settings = loadClaudeSettings(settingsPath);

  // Create backup before making changes
  createBackup(settingsPath);

  const ccbPath = getCCBPath();
  const preToolUseCommand = `${ccbPath} ${HOOK_COMMAND_SUFFIX}`;
  const notificationCommand = `${ccbPath} notification`;
  const stopCommand = `${ccbPath} enforce-tests`;

  // Check if hooks are already installed
  const existingHooks = checkForExistingHooks(
    settings,
    preToolUseCommand,
    notificationCommand
  );

  if (existingHooks.preToolUse && existingHooks.notification) {
    console.log(
      'CCB hooks are already installed (both auto-approve-tools and notification).'
    );
    return;
  } else if (existingHooks.preToolUse || existingHooks.notification) {
    console.log(
      'Some CCB hooks are already installed. Installing missing hooks...'
    );
  }

  // Handle existing hooks
  const currentPreToolUse = settings.hooks?.PreToolUse;

  if (typeof currentPreToolUse === 'string') {
    console.error(
      'Conflict detected: A different PreToolUse hook is already configured.'
    );
    console.error(`Current hook: ${currentPreToolUse}`);
    console.error(`Proposed hook: ${preToolUseCommand}`);
    console.error(
      'Please remove the existing hook first or use a different settings location.'
    );
    process.exit(1);
  } else if (Array.isArray(currentPreToolUse)) {
    // Add our hooks to the existing array
    addHooksToExistingArray(settings, preToolUseCommand, notificationCommand);
    // Add Stop hook separately since addHooksToExistingArray doesn't handle it yet
    if (!settings.hooks!.Stop) {
      settings.hooks!.Stop = [];
    }
    settings.hooks!.Stop.push({
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: stopCommand,
        },
      ],
    });
  } else {
    // Install the hooks as new array format
    addHooksToSettings(
      settings,
      preToolUseCommand,
      notificationCommand,
      stopCommand
    );
  }

  // Save the updated settings
  saveClaudeSettings(settingsPath, settings);

  // Configure git to ignore .claude/settings.local.json if we're using project local
  if (options.projectLocal) {
    updateGitignore(CLAUDE_SETTINGS_LOCAL_FILE);
  }

  const locationType = getLocationTypeString(options);
  console.log(
    `\n🎉 Successfully installed CCB hooks to ${locationType} settings: ${settingsPath}`
  );
  console.log(
    '   - Auto-approve-tools: Intelligently approves safe Claude Code operations'
  );
  console.log(
    '   - Notification: Shows macOS notifications for Claude Code messages'
  );
  console.log(
    '   - Enforce-tests: Ensures tests are run before stopping conversations'
  );
  console.log('\n📖 CCB is now ready to enhance your Claude Code experience!');
}
