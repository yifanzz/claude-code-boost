import { join } from 'path';
import { homedir } from 'os';

export interface Config {
  configDir: string;
  logFile: string;
}

export function getConfig(): Config {
  const configDir = process.env.CCY_CONFIG_DIR || join(homedir(), '.ccy');
  const logFile = join(configDir, 'approval.jsonl');

  return {
    configDir,
    logFile,
  };
}
