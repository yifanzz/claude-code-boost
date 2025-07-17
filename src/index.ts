#!/usr/bin/env node

import { Command } from 'commander';
import { autoApproveTools } from './commands/auto-approve-tools.js';

const program = new Command();

program
  .name('ccy')
  .description('Claude Code YOLO - Hook utilities for Claude Code')
  .version('1.0.0');

program
  .command('auto-approve-tools')
  .description('Auto-approve specified tools in PreToolUse hook')
  .action(autoApproveTools);

program.parse();
