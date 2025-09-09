import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { loadConfig, getConfigDir, getConfigPath } from '../utils/config.js';
import { canConfigureLLMClient, getLLMClient } from '../utils/llm-client.js';
import { clearCache } from '../utils/cache.js';

interface DiagnosticResult {
  status: 'ok' | 'warning' | 'error';
  title: string;
  message: string;
  details?: string;
  solution?: string;
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?:
      | string
      | Array<{
          matcher: string;
          hooks: Array<{ type: string; command: string }>;
        }>;
    Notification?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
    Stop?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
  };
  [key: string]: unknown;
}

export interface DoctorOptions {
  verbose?: boolean;
  fix?: boolean;
}

const HOOK_COMMAND_SUFFIX = 'auto-approve-tools';
const CCB_PACKAGE_NAME = 'claude-code-boost';

class CCBDoctor {
  private results: DiagnosticResult[] = [];
  private verbose: boolean;
  private fix: boolean;

  constructor(options: DoctorOptions = {}) {
    this.verbose = options.verbose || false;
    this.fix = options.fix || false;
  }

  private addResult(result: DiagnosticResult): void {
    this.results.push(result);
    if (this.verbose) {
      const statusIcon =
        result.status === 'ok'
          ? '✅'
          : result.status === 'warning'
            ? '⚠️'
            : '❌';
      console.log(`${statusIcon} ${result.title}: ${result.message}`);
      if (result.details && this.verbose) {
        console.log(`   ${result.details}`);
      }
      if (result.solution) {
        console.log(`   💡 ${result.solution}`);
      }
    }
  }

  private checkConfigurationSetup(): void {
    const configDir = getConfigDir();
    const configPath = getConfigPath();

    // Check if config directory exists
    if (!existsSync(configDir)) {
      this.addResult({
        status: 'warning',
        title: 'Configuration Directory',
        message: `Configuration directory does not exist: ${configDir}`,
        solution: 'Run `ccb install` to create the configuration directory',
      });
      return;
    }

    this.addResult({
      status: 'ok',
      title: 'Configuration Directory',
      message: `Configuration directory exists: ${configDir}`,
    });

    // Check if config file exists
    if (!existsSync(configPath)) {
      this.addResult({
        status: 'warning',
        title: 'Configuration File',
        message: `Configuration file does not exist: ${configPath}`,
        solution: 'Run `ccb install` to create the configuration file',
      });
      return;
    }

    this.addResult({
      status: 'ok',
      title: 'Configuration File',
      message: `Configuration file exists: ${configPath}`,
    });

    // Validate configuration content
    try {
      const config = loadConfig();

      this.addResult({
        status: 'ok',
        title: 'Configuration Validation',
        message: 'Configuration file is valid',
        details: this.verbose ? JSON.stringify(config, null, 2) : undefined,
      });

      // Check logging configuration
      if (config.log) {
        this.addResult({
          status: 'ok',
          title: 'Approval Logging',
          message: 'Approval logging is enabled',
        });
      } else {
        this.addResult({
          status: 'warning',
          title: 'Approval Logging',
          message: 'Approval logging is disabled',
          details: "You won't see approval decisions in the log file",
        });
      }

      // Check cache configuration
      if (config.cache) {
        this.addResult({
          status: 'ok',
          title: 'Approval Caching',
          message: 'Approval caching is enabled',
        });
      } else {
        this.addResult({
          status: 'warning',
          title: 'Approval Caching',
          message: 'Approval caching is disabled',
          details: 'Each tool usage will require a new LLM query',
        });
      }
    } catch (error) {
      this.addResult({
        status: 'error',
        title: 'Configuration Validation',
        message: 'Configuration file is invalid',
        details: error instanceof Error ? error.message : String(error),
        solution: 'Delete the config file and run `ccb install` to recreate it',
      });
    }
  }

  private checkGlobalAccessibility(): void {
    try {
      // Try to run 'which ccb' to see if it's in PATH
      const whichResult = execSync('which ccb', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (whichResult) {
        this.addResult({
          status: 'ok',
          title: 'Global CCB Access',
          message: `CCB is globally accessible: ${whichResult}`,
        });
      }
    } catch {
      // Try npm list to check if it's installed globally
      try {
        execSync(`npm list -g ${CCB_PACKAGE_NAME} --depth=0`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.addResult({
          status: 'warning',
          title: 'Global CCB Access',
          message: 'CCB is installed globally but not in PATH',
          solution: 'Ensure your global npm bin directory is in your PATH',
        });
      } catch {
        this.addResult({
          status: 'warning',
          title: 'Global CCB Access',
          message: 'CCB is not installed globally',
          details: 'Using local installation for hooks',
          solution: 'Run `npm install -g claude-code-boost` for global access',
        });
      }
    }

    // Check if current directory has CCB installed locally
    const localDistPath = join(process.cwd(), 'dist', 'index.js');
    if (existsSync(localDistPath)) {
      this.addResult({
        status: 'ok',
        title: 'Local CCB Access',
        message: `Local CCB build exists: ${localDistPath}`,
      });
    } else {
      this.addResult({
        status: 'warning',
        title: 'Local CCB Access',
        message: 'No local CCB build found',
        details: "If you're in the CCB project directory, run `npm run build`",
      });
    }
  }

  private checkAuthenticationSetup(): void {
    if (!canConfigureLLMClient()) {
      this.addResult({
        status: 'error',
        title: 'Authentication Configuration',
        message: 'No authentication method configured',
        details: 'CCB requires an API key to function',
        solution: 'Run `ccb install` to configure authentication interactively',
      });
      return;
    }

    try {
      const llmClient = getLLMClient();
      const authMethod = llmClient.getAuthMethod();
      const model = llmClient.getModel();

      this.addResult({
        status: 'ok',
        title: 'Authentication Configuration',
        message: `Using ${authMethod} authentication with model: ${model}`,
      });

      // Test API connectivity
      if (this.verbose) {
        this.addResult({
          status: 'ok',
          title: 'LLM Client Test',
          message: 'LLM client initialized successfully',
          details: `Auth method: ${authMethod}, Model: ${model}`,
        });
      }
    } catch (error) {
      this.addResult({
        status: 'error',
        title: 'Authentication Configuration',
        message: 'Failed to initialize authentication',
        details: error instanceof Error ? error.message : String(error),
        solution:
          'Check your API key configuration and run `ccb install` if needed',
      });
    }
  }

  private loadClaudeSettings(settingsPath: string): ClaudeSettings | null {
    if (!existsSync(settingsPath)) {
      return null;
    }

    try {
      const content = readFileSync(settingsPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private checkClaudeCodeSettings(): void {
    const home = process.env.HOME || '';
    const settingsPaths = [
      { name: 'User Settings', path: join(home, '.claude', 'settings.json') },
      {
        name: 'Project Settings',
        path: join(process.cwd(), '.claude', 'settings.json'),
      },
      {
        name: 'Project Local Settings',
        path: join(process.cwd(), '.claude', 'settings.local.json'),
      },
    ];

    let foundHooks = false;

    for (const settingsLocation of settingsPaths) {
      const settings = this.loadClaudeSettings(settingsLocation.path);

      if (!settings) {
        // Only report missing settings files if they might be expected to exist
        // Skip reporting missing project settings as that's normal
        continue;
      }

      this.addResult({
        status: 'ok',
        title: settingsLocation.name,
        message: `Settings file exists: ${settingsLocation.path}`,
      });

      // Check for CCB hooks
      const hooks = settings.hooks;
      if (!hooks) {
        continue;
      }

      // Check PreToolUse hook
      const preToolUse = hooks.PreToolUse;
      let hasCCBPreToolUse = false;

      if (typeof preToolUse === 'string') {
        hasCCBPreToolUse = preToolUse.includes(HOOK_COMMAND_SUFFIX);
      } else if (Array.isArray(preToolUse)) {
        hasCCBPreToolUse = preToolUse.some((matcher) =>
          matcher.hooks.some((hook) =>
            hook.command.includes(HOOK_COMMAND_SUFFIX)
          )
        );
      }

      // Check Notification hook
      const notification = hooks.Notification;
      let hasCCBNotification = false;
      if (Array.isArray(notification)) {
        hasCCBNotification = notification.some((matcher) =>
          matcher.hooks.some((hook) =>
            hook.command.includes('ccb notification')
          )
        );
      }

      // Check Stop hook
      const stop = hooks.Stop;
      let hasCCBStop = false;
      if (Array.isArray(stop)) {
        hasCCBStop = stop.some((matcher) =>
          matcher.hooks.some((hook) =>
            hook.command.includes('ccb enforce-tests')
          )
        );
      }

      if (hasCCBPreToolUse || hasCCBNotification || hasCCBStop) {
        foundHooks = true;
        const enabledHooks = [];
        if (hasCCBPreToolUse) enabledHooks.push('auto-approve-tools');
        if (hasCCBNotification) enabledHooks.push('notification');
        if (hasCCBStop) enabledHooks.push('enforce-tests');

        this.addResult({
          status: 'ok',
          title: `CCB Hooks in ${settingsLocation.name}`,
          message: `Found CCB hooks: ${enabledHooks.join(', ')}`,
          details: this.verbose
            ? `Location: ${settingsLocation.path}`
            : undefined,
        });

        // Warn about missing hooks
        const missingHooks = [];
        if (!hasCCBPreToolUse) missingHooks.push('auto-approve-tools');
        if (!hasCCBNotification) missingHooks.push('notification');
        if (!hasCCBStop) missingHooks.push('enforce-tests');

        if (missingHooks.length > 0) {
          this.addResult({
            status: 'warning',
            title: `Missing CCB Hooks in ${settingsLocation.name}`,
            message: `Missing hooks: ${missingHooks.join(', ')}`,
            solution: 'Run `ccb install` to install all hooks',
          });
        }
      }
    }

    if (!foundHooks) {
      this.addResult({
        status: 'error',
        title: 'CCB Hook Installation',
        message: 'No CCB hooks found in any Claude Code settings',
        solution: 'Run `ccb install` to install CCB hooks',
      });
    }
  }

  private checkApprovalLogFile(): void {
    const configDir = getConfigDir();
    const logPath = join(configDir, 'approval.jsonl');

    if (existsSync(logPath)) {
      try {
        const stats = statSync(logPath);
        this.addResult({
          status: 'ok',
          title: 'Approval Log File',
          message: `Approval log exists: ${logPath}`,
          details: `Size: ${Math.round(stats.size / 1024)}KB, Last modified: ${stats.mtime.toISOString()}`,
        });
      } catch (error) {
        this.addResult({
          status: 'warning',
          title: 'Approval Log File',
          message: 'Approval log file exists but cannot read stats',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      this.addResult({
        status: 'warning',
        title: 'Approval Log File',
        message: 'No approval log file found',
        details:
          'This is normal for new installations or if logging is disabled',
      });
    }
  }

  private checkCacheFile(): void {
    const configDir = getConfigDir();
    const cachePath = join(configDir, 'cache.json');

    if (existsSync(cachePath)) {
      try {
        const cacheContent = readFileSync(cachePath, 'utf8');
        const cache = JSON.parse(cacheContent);
        const entryCount = Object.keys(cache).length;

        this.addResult({
          status: 'ok',
          title: 'Approval Cache',
          message: `Cache file exists with ${entryCount} entries: ${cachePath}`,
          details: this.verbose
            ? `Sample keys: ${Object.keys(cache).slice(0, 3).join(', ')}`
            : undefined,
        });
      } catch (error) {
        this.addResult({
          status: 'warning',
          title: 'Approval Cache',
          message: 'Cache file exists but is invalid',
          details: error instanceof Error ? error.message : String(error),
          solution: 'Run `ccb debug clear-approval-cache` to reset the cache',
        });
      }
    } else {
      this.addResult({
        status: 'warning',
        title: 'Approval Cache',
        message: 'No cache file found',
        details: 'This is normal for new installations',
      });
    }
  }

  public async runDiagnostics(): Promise<void> {
    console.log('🔍 Running CCB diagnostics...\n');

    this.checkConfigurationSetup();
    this.checkGlobalAccessibility();
    this.checkAuthenticationSetup();
    this.checkClaudeCodeSettings();
    this.checkApprovalLogFile();
    this.checkCacheFile();

    this.generateReport();
  }

  private generateReport(): void {
    const okCount = this.results.filter((r) => r.status === 'ok').length;
    const warningCount = this.results.filter(
      (r) => r.status === 'warning'
    ).length;
    const errorCount = this.results.filter((r) => r.status === 'error').length;

    console.log('\n📊 Diagnostic Summary:');
    console.log(`✅ OK: ${okCount}`);
    console.log(`⚠️  Warnings: ${warningCount}`);
    console.log(`❌ Errors: ${errorCount}`);

    if (errorCount > 0) {
      console.log('\n🚨 Critical Issues Found:');
      this.results
        .filter((r) => r.status === 'error')
        .forEach((r) => {
          console.log(`❌ ${r.title}: ${r.message}`);
          if (r.solution) {
            console.log(`   💡 Solution: ${r.solution}`);
          }
        });
    }

    if (warningCount > 0 && !this.verbose) {
      console.log('\n⚠️  Warnings Found:');
      this.results
        .filter((r) => r.status === 'warning')
        .forEach((r) => {
          console.log(`⚠️  ${r.title}: ${r.message}`);
          if (r.solution) {
            console.log(`   💡 Solution: ${r.solution}`);
          }
        });
    }

    if (errorCount === 0 && warningCount === 0) {
      console.log('\n🎉 All checks passed! CCB is properly configured.');
    } else {
      console.log('\n💡 Run `ccb doctor --verbose` for detailed information.');
      if (errorCount > 0) {
        console.log('   Run `ccb install` to fix most configuration issues.');
      }
    }
  }
}

export async function doctor(options: DoctorOptions = {}): Promise<void> {
  const ccbDoctor = new CCBDoctor(options);
  await ccbDoctor.runDiagnostics();
}

export function clearApprovalCache(): void {
  try {
    clearCache();
    console.log('✅ Approval cache cleared successfully.');
  } catch (error) {
    console.error(`❌ Error clearing approval cache: ${error}`);
    process.exit(1);
  }
}
