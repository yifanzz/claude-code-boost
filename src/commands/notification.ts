import { readFileSync } from 'fs';
import notifier from 'node-notifier';
import { parseNotificationHookInput } from '../types/hook-schemas.js';

export async function notification(): Promise<void> {
  let input: string | undefined;
  try {
    input = readFileSync(0, 'utf8');
    const jsonData = JSON.parse(input);
    const hookData = parseNotificationHookInput(jsonData);

    // Create cross-platform notification using node-notifier
    notifier.notify({
      title: 'Claude Code',
      message: hookData.message,
      sound: true,
      wait: false,
    });

    process.exit(0);
  } catch (error) {
    if (error instanceof SyntaxError) {
      process.stderr.write(
        `JSON parsing error: ${error.message}\nRaw input (${input?.length || 0} chars): ${JSON.stringify(input || 'undefined')}\n`
      );
    } else {
      process.stderr.write(
        `Error processing notification hook input: ${error}\n`
      );
    }
    process.exit(1);
  }
}
