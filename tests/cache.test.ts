import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import {
  loadCache,
  saveCache,
  getCachedDecision,
  setCachedDecision,
  clearCache,
  getCachePath,
} from '../src/utils/cache.js';

describe('Cache functionality', () => {
  const testCacheDir = join(tmpdir(), 'ccb-cache-test');
  const originalEnv = process.env;

  beforeEach(() => {
    // Clean up and recreate test directory
    try {
      rmSync(testCacheDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    mkdirSync(testCacheDir, { recursive: true });

    // Set test environment
    process.env = { ...originalEnv };
    process.env.CCB_CONFIG_DIR = testCacheDir;
  });

  afterEach(() => {
    process.env = originalEnv;

    // Clean up test directory
    try {
      rmSync(testCacheDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('loadCache', () => {
    it('should return empty cache when file does not exist', () => {
      const cache = loadCache();
      expect(cache).toEqual({});
    });

    it('should load valid cache from file', () => {
      const testCache = {
        '/test/dir': {
          hash123: {
            toolName: 'Read',
            toolInput: { file_path: '/test.txt' },
            decision: 'approve' as const,
            reason: 'Safe read operation',
            timestamp: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      const cachePath = getCachePath();
      writeFileSync(cachePath, JSON.stringify(testCache));

      const cache = loadCache();
      expect(cache).toEqual(testCache);
    });

    it('should return empty cache when file has invalid JSON', () => {
      const cachePath = getCachePath();
      writeFileSync(cachePath, 'invalid json');

      const cache = loadCache();
      expect(cache).toEqual({});
    });

    it('should return empty cache when file has invalid schema', () => {
      const invalidCache = {
        '/test/dir': {
          hash123: {
            toolName: 'Read',
            // Missing required fields
            decision: 'invalid_decision',
          },
        },
      };

      const cachePath = getCachePath();
      writeFileSync(cachePath, JSON.stringify(invalidCache));

      const cache = loadCache();
      expect(cache).toEqual({});
    });
  });

  describe('saveCache', () => {
    it('should save cache to file', () => {
      const testCache = {
        '/test/dir': {
          hash123: {
            toolName: 'Read',
            toolInput: { file_path: '/test.txt' },
            decision: 'approve' as const,
            reason: 'Safe read operation',
            timestamp: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      saveCache(testCache);

      const cachePath = getCachePath();
      const savedData = readFileSync(cachePath, 'utf8');
      const savedCache = JSON.parse(savedData);

      expect(savedCache).toEqual(testCache);
    });

    it('should create directory if it does not exist', () => {
      // Remove the test directory
      rmSync(testCacheDir, { recursive: true, force: true });

      const testCache = {
        '/test/dir': {
          hash123: {
            toolName: 'Read',
            toolInput: { file_path: '/test.txt' },
            decision: 'approve' as const,
            reason: 'Safe read operation',
            timestamp: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      saveCache(testCache);

      const cachePath = getCachePath();
      expect(() => readFileSync(cachePath, 'utf8')).not.toThrow();
    });
  });

  describe('getCachedDecision', () => {
    it('should return null when no cache exists', () => {
      const decision = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir'
      );
      expect(decision).toBe(null);
    });

    it('should return null when working directory not in cache', () => {
      const testCache = {
        '/other/dir': {
          hash123: {
            toolName: 'Read',
            toolInput: { file_path: '/test.txt' },
            decision: 'approve' as const,
            reason: 'Safe read operation',
            timestamp: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      saveCache(testCache);

      const decision = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir'
      );
      expect(decision).toBe(null);
    });

    it('should return null when tool/input combination not in cache', () => {
      const testCache = {
        '/test/dir': {
          hash123: {
            toolName: 'Read',
            toolInput: { file_path: '/other.txt' },
            decision: 'approve' as const,
            reason: 'Safe read operation',
            timestamp: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      saveCache(testCache);

      const decision = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir'
      );
      expect(decision).toBe(null);
    });

    it('should return cached decision when it exists', () => {
      // First set a cached decision
      setCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir',
        'approve',
        'Safe read operation'
      );

      const decision = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir'
      );

      expect(decision).toBeTruthy();
      expect(decision!.toolName).toBe('Read');
      expect(decision!.toolInput).toEqual({ file_path: '/test.txt' });
      expect(decision!.decision).toBe('approve');
      expect(decision!.reason).toBe('Safe read operation');
      expect(decision!.timestamp).toBeTruthy();
    });

    it('should generate consistent cache keys for identical tool/input', () => {
      // Set decision for first identical input
      setCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir',
        'approve',
        'Safe read operation'
      );

      // Get decision for identical tool/input
      const decision = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir'
      );

      expect(decision).toBeTruthy();
      expect(decision!.decision).toBe('approve');
    });

    it('should generate different cache keys for different inputs', () => {
      // Set decision for first input
      setCachedDecision(
        'Read',
        { file_path: '/test1.txt' },
        '/test/dir',
        'approve',
        'Safe read operation'
      );

      // Try to get decision for different input
      const decision = getCachedDecision(
        'Read',
        { file_path: '/test2.txt' },
        '/test/dir'
      );

      expect(decision).toBe(null);
    });
  });

  describe('setCachedDecision', () => {
    it('should create new cache entry', () => {
      setCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir',
        'approve',
        'Safe read operation'
      );

      const decision = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir'
      );

      expect(decision).toBeTruthy();
      expect(decision!.toolName).toBe('Read');
      expect(decision!.decision).toBe('approve');
      expect(decision!.reason).toBe('Safe read operation');
    });

    it('should update existing cache entry', () => {
      // Set initial decision
      setCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir',
        'approve',
        'Initial reason'
      );

      // Update with new decision
      setCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir',
        'block',
        'Updated reason'
      );

      const decision = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir'
      );

      expect(decision).toBeTruthy();
      expect(decision!.decision).toBe('block');
      expect(decision!.reason).toBe('Updated reason');
    });

    it('should handle multiple working directories', () => {
      setCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/dir1',
        'approve',
        'Safe in dir1'
      );

      setCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/dir2',
        'block',
        'Blocked in dir2'
      );

      const decision1 = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/dir1'
      );
      const decision2 = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/dir2'
      );

      expect(decision1!.decision).toBe('approve');
      expect(decision1!.reason).toBe('Safe in dir1');
      expect(decision2!.decision).toBe('block');
      expect(decision2!.reason).toBe('Blocked in dir2');
    });

    it('should set valid ISO timestamp', () => {
      const beforeTime = Date.now();

      setCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir',
        'approve',
        'Safe read operation'
      );

      const afterTime = Date.now();

      const decision = getCachedDecision(
        'Read',
        { file_path: '/test.txt' },
        '/test/dir'
      );

      expect(decision).toBeTruthy();
      expect(decision!.timestamp).toBeTruthy();

      const timestampMs = new Date(decision!.timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampMs).toBeLessThanOrEqual(afterTime);

      // Verify it's a valid ISO string
      expect(() => new Date(decision!.timestamp)).not.toThrow();
      expect(new Date(decision!.timestamp).toISOString()).toBe(
        decision!.timestamp
      );
    });
  });

  describe('clearCache', () => {
    it('should clear existing cache', () => {
      // Set some cache entries
      setCachedDecision(
        'Read',
        { file_path: '/test1.txt' },
        '/dir1',
        'approve',
        'Safe operation'
      );
      setCachedDecision(
        'Write',
        { file_path: '/test2.txt', content: 'test' },
        '/dir2',
        'block',
        'Blocked operation'
      );

      // Verify entries exist
      expect(
        getCachedDecision('Read', { file_path: '/test1.txt' }, '/dir1')
      ).toBeTruthy();
      expect(
        getCachedDecision(
          'Write',
          { file_path: '/test2.txt', content: 'test' },
          '/dir2'
        )
      ).toBeTruthy();

      // Clear cache
      clearCache();

      // Verify entries are gone
      expect(
        getCachedDecision('Read', { file_path: '/test1.txt' }, '/dir1')
      ).toBe(null);
      expect(
        getCachedDecision(
          'Write',
          { file_path: '/test2.txt', content: 'test' },
          '/dir2'
        )
      ).toBe(null);

      // Verify cache file contains empty object
      const cache = loadCache();
      expect(cache).toEqual({});
    });

    it('should handle clearing when cache file does not exist', () => {
      // Cache file should not exist yet
      expect(() => clearCache()).not.toThrow();

      // Cache should be empty
      const cache = loadCache();
      expect(cache).toEqual({});
    });
  });

  describe('Complex tool inputs', () => {
    it('should handle complex nested tool inputs', () => {
      const complexInput = {
        edits: [
          {
            old_string: 'old code',
            new_string: 'new code',
            replace_all: false,
          },
        ],
        file_path: '/test.ts',
        metadata: {
          author: 'test',
          timestamp: '2025-01-01T00:00:00.000Z',
        },
      };

      setCachedDecision(
        'MultiEdit',
        complexInput,
        '/project',
        'approve',
        'Safe edit operation'
      );

      const decision = getCachedDecision('MultiEdit', complexInput, '/project');

      expect(decision).toBeTruthy();
      expect(decision!.toolInput).toEqual(complexInput);
    });

    it('should differentiate between similar but different inputs', () => {
      const input1 = { file_path: '/test.txt', option: true };
      const input2 = { file_path: '/test.txt', option: false };

      setCachedDecision(
        'Tool',
        input1,
        '/dir',
        'approve',
        'Approved with true'
      );
      setCachedDecision('Tool', input2, '/dir', 'block', 'Blocked with false');

      const decision1 = getCachedDecision('Tool', input1, '/dir');
      const decision2 = getCachedDecision('Tool', input2, '/dir');

      expect(decision1!.decision).toBe('approve');
      expect(decision1!.reason).toBe('Approved with true');
      expect(decision2!.decision).toBe('block');
      expect(decision2!.reason).toBe('Blocked with false');
    });
  });

  describe('Config integration', () => {
    it('should load config with cache enabled by default', async () => {
      const { loadConfig } = await import('../src/utils/config.js');
      const config = loadConfig();
      expect(config.cache).toBe(true);
    });

    it('should respect cache disabled config', async () => {
      const { loadConfig, saveConfig } = await import('../src/utils/config.js');

      // Save config with cache disabled
      const disabledConfig = { log: true, cache: false };
      saveConfig(disabledConfig);

      // Load and verify cache is disabled
      const loadedConfig = loadConfig();
      expect(loadedConfig.cache).toBe(false);
    });

    it('should respect cache enabled config', async () => {
      const { loadConfig, saveConfig } = await import('../src/utils/config.js');

      // Save config with cache explicitly enabled
      const enabledConfig = { log: true, cache: true };
      saveConfig(enabledConfig);

      // Load and verify cache is enabled
      const loadedConfig = loadConfig();
      expect(loadedConfig.cache).toBe(true);
    });
  });
});
