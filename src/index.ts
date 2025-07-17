#!/usr/bin/env node

import { Command } from 'commander';
import { autoApproveTools } from './commands/auto-approve-tools.js';
import { install } from './commands/install.js';

const program = new Command();

program
  .name('ccy')
  .description('Claude Code YOLO - Hook utilities for Claude Code')
  .version('1.0.0');

program
  .command('auto-approve-tools')
  .description('Auto-approve specified tools in PreToolUse hook')
  .action(autoApproveTools);

program
  .command('install')
  .description('Install CCY auto-approve-tools hook to Claude Code settings')
  .option('--user', 'Install to user settings (~/.claude/settings.json)')
  .option('--project', 'Install to project settings (.claude/settings.json)')
  .option(
    '--project-local',
    'Install to project local settings (.claude/settings.local.json)'
  )
  .action(install);

program.parse();
