import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { parseNotificationHookInput } from '../types/hook-schemas.js';

export async function notification(): Promise<void> {
  try {
    const input = readFileSync(0, 'utf8');
    const jsonData = JSON.parse(input);
    const hookData = parseNotificationHookInput(jsonData);

    // Create macOS notification using terminal-notifier
    const title = 'Claude Code';
    const message = hookData.message;

    const terminalNotifier = spawn(
      'terminal-notifier',
      ['-title', title, '-message', message, '-sound', 'Glass'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    let stderr = '';
    terminalNotifier.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    terminalNotifier.on('close', (code) => {
      if (code !== 0) {
        console.error(`Failed to create notification: ${stderr}`);
        process.exit(1);
      }
      process.exit(0);
    });
  } catch (error) {
    process.stderr.write(
      `Error processing notification hook input: ${error}\n`
    );
    process.exit(1);
  }
}
