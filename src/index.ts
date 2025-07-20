#!/usr/bin/env node

import { Command } from 'commander';
import { autoApproveTools } from './commands/auto-approve-tools.js';
import { install } from './commands/install.js';

const program = new Command();

program
  .name('ccb')
  .description('Claude Code Boost - Hook utilities for Claude Code')
  .version('0.1.0');

program
  .command('auto-approve-tools')
  .description('Auto-approve specified tools in PreToolUse hook')
  .option('--use-claude-cli', 'Use Claude CLI instead of direct API calls')
  .action((options) => autoApproveTools(options.useClaudeCli));

program
  .command('install')
  .description('Install CCB auto-approve-tools hook to Claude Code settings')
  .option('--user', 'Install to user settings (~/.claude/settings.json)')
  .option('--project', 'Install to project settings (.claude/settings.json)')
  .option(
    '--project-local',
    'Install to project local settings (.claude/settings.local.json)'
  )
  .action(install);

program.parse();
