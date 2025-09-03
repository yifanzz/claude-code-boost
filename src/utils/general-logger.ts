import pino from 'pino';
import { join } from 'path';
import { getConfig } from '../config.js';
import { loadConfig } from './config.js';

let logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!logger) {
    const configDir = getConfig().configDir;
    const config = loadConfig();
    const logFile = join(configDir, 'ccb.log');

    logger = pino(
      {
        level: config.logLevel,
        formatters: {
          level: (label) => {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.destination({
        dest: logFile,
        sync: false,
        mkdir: true,
      })
    );
  }

  return logger;
}

// Convenience functions for different log levels
export const log = {
  debug: (obj: any, msg?: string) => {
    const config = loadConfig();
    if (config.generalLog) getLogger().debug(obj, msg);
  },
  info: (obj: any, msg?: string) => {
    const config = loadConfig();
    if (config.generalLog) getLogger().info(obj, msg);
  },
  warn: (obj: any, msg?: string) => {
    const config = loadConfig();
    if (config.generalLog) getLogger().warn(obj, msg);
  },
  error: (obj: any, msg?: string) => {
    const config = loadConfig();
    if (config.generalLog) getLogger().error(obj, msg);
  },
  fatal: (obj: any, msg?: string) => {
    const config = loadConfig();
    if (config.generalLog) getLogger().fatal(obj, msg);
  },
};
