import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 90000, // 90 seconds for Claude API calls (to handle rate limiting)
  },
});