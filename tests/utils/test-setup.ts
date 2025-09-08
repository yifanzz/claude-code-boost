import { join } from 'path';
import { rmSync } from 'fs';

export interface TestSetup {
  originalEnv: NodeJS.ProcessEnv;
  testConfigDir: string;
}

/**
 * Set up a clean test environment with isolated CCB config
 */
export function setupTestEnvironment(): TestSetup {
  const originalEnv = process.env;
  const testConfigDir = join(
    __dirname,
    `../tmp/test-ccb-config-${Date.now()}-${Math.random()}`
  );

  // Preserve API keys while resetting other env vars
  const apiKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };

  // Use a custom config directory for tests to avoid global config interference
  process.env = {
    ...originalEnv,
    ...apiKeys,
    CCB_CONFIG_DIR: testConfigDir,
  };

  return { originalEnv, testConfigDir };
}

/**
 * Clean up test environment
 */
export function teardownTestEnvironment(setup: TestSetup) {
  process.env = setup.originalEnv;

  // Clean up test config directory
  try {
    rmSync(setup.testConfigDir, { recursive: true, force: true });
  } catch {
    // Directory might not exist, ignore
  }
}

/**
 * Set up test environment for beforeEach/afterEach pattern
 */
export function createTestEnvironmentHooks() {
  let currentSetup: TestSetup | null = null;

  return {
    beforeEach: () => {
      currentSetup = setupTestEnvironment();
    },
    afterEach: () => {
      if (currentSetup) {
        teardownTestEnvironment(currentSetup);
        currentSetup = null;
      }
    },
  };
}
