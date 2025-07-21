import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { ZodError } from 'zod';
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

export function loadCache(): ApprovalCache {
  const cachePath = getCachePath();

  if (!existsSync(cachePath)) {
    return {};
  }

  try {
    const cacheData = readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(cacheData);
    return parseApprovalCache(parsed);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      console.warn('Warning: Invalid approval cache format. Starting fresh.');
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
  decision: 'approve' | 'block',
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
