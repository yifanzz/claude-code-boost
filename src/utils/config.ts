import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ZodError, type ZodIssue } from 'zod';
import { parseConfig, type Config } from '../types/hook-schemas.js';

const CONFIG_FILE = 'config.json';

export function getConfigDir(): string {
  return process.env.CCB_CONFIG_DIR || join(process.env.HOME || '', '.ccb');
}

export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILE);
}

export function loadConfig(): Config {
  const configPath = getConfigPath();
  const defaultConfig: Config = {
    log: true,
    cache: true,
    model: 'gpt-4o-mini',
  };

  if (!existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    const configData = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(configData);
    return parseConfig(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      console.warn(
        `Warning: Invalid config.json format. Using defaults. Errors: ${error.issues.map((e: ZodIssue) => e.message).join(', ')}`
      );
    } else if (error instanceof SyntaxError) {
      console.warn(`Warning: Invalid JSON in config.json. Using defaults.`);
    } else {
      console.warn(`Warning: Unable to read config.json. Using defaults.`);
    }
    return defaultConfig;
  }
}

export function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

export function saveConfig(config: Config): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
}
