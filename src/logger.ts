import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { getConfig } from './config.js';

export interface ApprovalLogEntry {
  datetime: string;
  tool: string;
  inputs: Record<string, unknown>;
  reason: string;
  decision: string;
  cwd: string;
  session_id: string;
}

class ApprovalLogger {
  private static instance: ApprovalLogger;
  private logFile: string;
  private pendingWrites: Map<string, Promise<void>> = new Map();

  private constructor() {
    this.logFile = getConfig().logFile;
  }

  static getInstance(): ApprovalLogger {
    if (!ApprovalLogger.instance) {
      ApprovalLogger.instance = new ApprovalLogger();
    }
    return ApprovalLogger.instance;
  }

  async logApproval(entry: ApprovalLogEntry): Promise<void> {
    // Create a unique key for this log entry to prevent concurrent writes
    const logKey = `${entry.session_id}-${entry.datetime}`;

    // If there's already a pending write for this key, wait for it
    if (this.pendingWrites.has(logKey)) {
      await this.pendingWrites.get(logKey);
      return;
    }

    // Create the write operation
    const writePromise = this.performWrite(entry);
    this.pendingWrites.set(logKey, writePromise);

    try {
      await writePromise;
    } finally {
      this.pendingWrites.delete(logKey);
    }
  }

  private async performWrite(entry: ApprovalLogEntry): Promise<void> {
    try {
      // Ensure the directory exists
      await mkdir(dirname(this.logFile), { recursive: true });

      // Create JSONL entry
      const jsonlEntry = JSON.stringify(entry) + '\n';

      // Append to file (atomic operation)
      await appendFile(this.logFile, jsonlEntry, 'utf8');
    } catch {
      // Don't throw errors that would interrupt the main process
      // Silently fail to avoid interrupting the hook execution
    }
  }
}

export async function logApproval(
  toolName: string,
  toolInput: Record<string, unknown>,
  decision: string,
  reason: string,
  sessionId: string
): Promise<void> {
  const logger = ApprovalLogger.getInstance();

  const entry: ApprovalLogEntry = {
    datetime: new Date().toISOString(),
    tool: toolName,
    inputs: toolInput,
    reason,
    decision,
    cwd: process.cwd(),
    session_id: sessionId,
  };

  await logger.logApproval(entry);
}
