import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { getConfigDir, ensureConfigDir } from './config.js';
import {
  parseApprovalCache,
  type ApprovalCache,
  type ApprovalCacheEntry,
} from '../types/hook-schemas.js';

const CACHE_FILE = 'approval_cache.json';

export function getCachePath(): string {
  return join(getConfigDir(), CACHE_FILE);
}

function generateCacheKey(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  const data = JSON.stringify({ toolName, toolInput });
  return createHash('sha256').update(data).digest('hex');
}

function migrateLegacyCache(cache: unknown): ApprovalCache {
  const migratedCache: ApprovalCache = {};

  if (cache && typeof cache === 'object') {
    for (const [workingDir, entries] of Object.entries(cache)) {
      if (typeof entries === 'object' && entries !== null) {
        const migratedEntries: Record<string, ApprovalCacheEntry> = {};

        for (const [cacheKey, entry] of Object.entries(
          entries as Record<string, unknown>
        )) {
          if (entry && typeof entry === 'object') {
            const entryObj = entry as Record<string, unknown>;
            // Migrate old decision values to new ones
            let decision = entryObj.decision;
            if (decision === 'approve') {
              decision = 'allow';
            } else if (decision === 'block') {
              decision = 'deny';
            }

            // Only migrate if the decision is valid
            if (decision === 'allow' || decision === 'deny') {
              migratedEntries[cacheKey] = {
                toolName: (entryObj.toolName as string) || '',
                toolInput:
                  (entryObj.toolInput as Record<string, unknown>) || {},
                decision: decision as 'allow' | 'deny',
                reason: (entryObj.reason as string) || '',
                timestamp:
                  (entryObj.timestamp as string) || new Date().toISOString(),
              };
            }
          }
        }

        // Only add the working directory if it has entries
        if (Object.keys(migratedEntries).length > 0) {
          migratedCache[workingDir] = migratedEntries;
        }
      }
    }
  }

  return migratedCache;
}

export function loadCache(): ApprovalCache {
  const cachePath = getCachePath();

  if (!existsSync(cachePath)) {
    return {};
  }

  try {
    const cacheData = readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(cacheData);

    // Try parsing with new schema first
    try {
      return parseApprovalCache(parsed);
    } catch {
      // If schema validation fails, try to migrate legacy format

      console.warn('Warning: Migrating legacy approval cache format.');
      const migrated = migrateLegacyCache(parsed);

      // Save the migrated cache
      if (Object.keys(migrated).length > 0) {
        saveCache(migrated);
      }

      return migrated;
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn('Warning: Invalid JSON in approval cache. Starting fresh.');
    } else {
      console.warn('Warning: Unable to read approval cache. Starting fresh.');
    }
    return {};
  }
}

export function saveCache(cache: ApprovalCache): void {
  ensureConfigDir();
  const cachePath = getCachePath();
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export function getCachedDecision(
  toolName: string,
  toolInput: Record<string, unknown>,
  workingDir: string
): ApprovalCacheEntry | null {
  const cache = loadCache();
  const cacheKey = generateCacheKey(toolName, toolInput);

  return cache[workingDir]?.[cacheKey] || null;
}

export function setCachedDecision(
  toolName: string,
  toolInput: Record<string, unknown>,
  workingDir: string,
  decision: 'allow' | 'deny',
  reason: string
): void {
  const cache = loadCache();
  const cacheKey = generateCacheKey(toolName, toolInput);

  if (!cache[workingDir]) {
    cache[workingDir] = {};
  }

  cache[workingDir][cacheKey] = {
    toolName,
    toolInput,
    decision,
    reason,
    timestamp: new Date().toISOString(),
  };

  saveCache(cache);
}

export function clearCache(): void {
  ensureConfigDir();
  const cachePath = getCachePath();

  if (existsSync(cachePath)) {
    writeFileSync(cachePath, JSON.stringify({}, null, 2));
  }
}
