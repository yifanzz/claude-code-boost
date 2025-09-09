#!/usr/bin/env node

import { Command } from 'commander';
import { autoApproveTools } from './commands/auto-approve-tools.js';
import { notification } from './commands/notification.js';
import { install } from './commands/install.js';
import { uninstall } from './commands/uninstall.js';
import { doctor, clearApprovalCache } from './commands/doctor.js';
import { enforceTests } from './commands/enforce-tests.js';

const program = new Command();

program
  .name('ccb')
  .description('Claude Code Boost - Hook utilities for Claude Code')
  .version('0.1.0');

program
  .command('auto-approve-tools')
  .description('Auto-approve specified tools in PreToolUse hook')
  .option('--no-cache', 'Disable approval caching for testing')
  .action((options) => autoApproveTools(!options.cache));

program
  .command('notification')
  .description('Display macOS notifications for Claude Code messages')
  .action(() => notification());

program
  .command('enforce-tests')
  .description('Enforce test execution in Stop hook')
  .action(() => enforceTests());

program
  .command('install')
  .description(
    'Install CCB hooks (auto-approve-tools, notification, and enforce-tests) to Claude Code settings'
  )
  .option('--user', 'Install to user settings (~/.claude/settings.json)')
  .option('--project', 'Install to project settings (.claude/settings.json)')
  .option(
    '--project-local',
    'Install to project local settings (.claude/settings.local.json)'
  )
  .option('--api-key <key>', 'Set Anthropic API key (non-interactive)')
  .option(
    '--beyondthehype-api-key <key>',
    'Set beyondthehype.dev API key (non-interactive)'
  )
  .option('--openai-api-key <key>', 'Set OpenAI API key (non-interactive)')
  .option(
    '--base-url <url>',
    'Set OpenAI-compatible base URL (non-interactive)'
  )
  .option(
    '--non-interactive',
    'Skip interactive prompts (for testing/automation)'
  )
  .action((options) =>
    install({
      user: options.user,
      project: options.project,
      projectLocal: options.projectLocal,
      apiKey: options.apiKey,
      beyondthehypeApiKey: options.beyondthehypeApiKey,
      openaiApiKey: options.openaiApiKey,
      baseUrl: options.baseUrl,
      nonInteractive: options.nonInteractive,
    })
  );

program
  .command('uninstall')
  .description('Remove CCB hooks from Claude Code user settings')
  .option('--remove-config', 'Also remove CCB configuration directory')
  .option(
    '--non-interactive',
    'Skip confirmation prompts (for testing/automation)'
  )
  .action((options) =>
    uninstall({
      removeConfig: options.removeConfig,
      nonInteractive: options.nonInteractive,
    })
  );

program
  .command('doctor')
  .description('Diagnose CCB setup and configuration issues')
  .option('--verbose', 'Show detailed diagnostic information')
  .option('--fix', 'Attempt to fix issues automatically (experimental)')
  .action((options) => doctor({ verbose: options.verbose, fix: options.fix }));

const debugCommand = program
  .command('debug')
  .description('Debug utilities for CCB');

debugCommand
  .command('clear-approval-cache')
  .description('Clear the approval cache')
  .action(clearApprovalCache);

program.parse();
