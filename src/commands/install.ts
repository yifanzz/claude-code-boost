import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

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

export interface InstallOptions {
  user?: boolean;
  project?: boolean;
  projectLocal?: boolean;
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
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
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

function saveClaudeSettings(
  settingsPath: string,
  settings: ClaudeSettings
): void {
  ensureDirectoryExists(settingsPath);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function getCCBPath(): string {
  try {
    // Try to get the global npm path for ccb
    const npmPath = execSync('npm list -g ccb --depth=0 --json', {
      encoding: 'utf8',
    });
    const npmData = JSON.parse(npmPath);
    if (npmData.dependencies?.ccb) {
      return 'ccb';
    }
  } catch {
    // Fallback to local path
  }

  // If not globally installed, use the local path
  return join(process.cwd(), 'dist', 'index.js');
}

export function install(options: InstallOptions): void {
  const settingsPath = getClaudeSettingsPath(options);
  const settings = loadClaudeSettings(settingsPath);

  const ccbPath = getCCBPath();
  const hookCommand = `${ccbPath} auto-approve-tools`;

  // Check for existing PreToolUse hook
  if (settings.hooks?.PreToolUse) {
    const currentHook = settings.hooks.PreToolUse;

    if (typeof currentHook === 'string') {
      if (currentHook === hookCommand) {
        console.log('CCB auto-approve-tools hook is already installed.');
        return;
      } else {
        console.error(
          'Conflict detected: A different PreToolUse hook is already configured.'
        );
        console.error(`Current hook: ${currentHook}`);
        console.error(`Proposed hook: ${hookCommand}`);
        console.error(
          'Please remove the existing hook first or use a different settings location.'
        );
        process.exit(1);
      }
    } else if (Array.isArray(currentHook)) {
      // Check if our hook is already in the array
      const hasOurHook = currentHook.some((matcher) =>
        matcher.hooks.some((hook) => hook.command === hookCommand)
      );

      if (hasOurHook) {
        console.log('CCB auto-approve-tools hook is already installed.');
        return;
      } else {
        console.error(
          'Conflict detected: PreToolUse hook is configured as an array.'
        );
        console.error(
          `Current configuration: ${JSON.stringify(currentHook, null, 2)}`
        );
        console.error(`Proposed hook: ${hookCommand}`);
        console.error(
          'Please manually add the hook to the array or use a different settings location.'
        );
        process.exit(1);
      }
    }
  }

  // Install the hook
  if (!settings.hooks) {
    settings.hooks = {};
  }
  settings.hooks.PreToolUse = hookCommand;

  saveClaudeSettings(settingsPath, settings);

  // Configure git to ignore .claude/settings.local.json if we're using project local
  if (options.projectLocal) {
    const gitignorePath = join(process.cwd(), '.gitignore');
    const gitignoreEntry = '.claude/settings.local.json';

    if (existsSync(gitignorePath)) {
      const gitignoreContent = readFileSync(gitignorePath, 'utf8');
      if (!gitignoreContent.includes(gitignoreEntry)) {
        writeFileSync(
          gitignorePath,
          gitignoreContent + '\n' + gitignoreEntry + '\n'
        );
        console.log('Added .claude/settings.local.json to .gitignore');
      }
    } else {
      writeFileSync(gitignorePath, gitignoreEntry + '\n');
      console.log('Created .gitignore and added .claude/settings.local.json');
    }
  }

  const locationType = options.user
    ? 'user'
    : options.project
      ? 'project'
      : options.projectLocal
        ? 'project-local'
        : 'user';

  console.log(
    `Successfully installed CCB auto-approve-tools hook to ${locationType} settings: ${settingsPath}`
  );
}
