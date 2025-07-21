import { clearCache } from '../utils/cache.js';

export function clearApprovalCache(): void {
  try {
    clearCache();
    console.log('Approval cache cleared successfully.');
  } catch (error) {
    console.error(`Error clearing approval cache: ${error}`);
    process.exit(1);
  }
}
