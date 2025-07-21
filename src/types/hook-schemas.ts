import { z } from 'zod';

// Claude Code Hook Input Schema
export const HookInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
});

export type HookInput = z.infer<typeof HookInputSchema>;

// Claude Code Hook Output Schema
export const HookOutputSchema = z.object({
  decision: z.enum(['approve', 'block']).optional(),
  reason: z.string(),
});

export type HookOutput = z.infer<typeof HookOutputSchema>;

// Claude CLI Response Schema
export const ClaudeResponseSchema = z.object({
  decision: z.enum(['approve', 'block', 'unsure']),
  reason: z.string(),
});

export type ClaudeResponse = z.infer<typeof ClaudeResponseSchema>;

// Config Schema
export const ConfigSchema = z.object({
  log: z.boolean().default(true),
  apiKey: z.string().optional(), // Anthropic API key (sk-...)
  cache: z.boolean().default(true), // Enable approval caching
});

export type Config = z.infer<typeof ConfigSchema>;

// Safe parsing functions
export function parseHookInput(data: unknown): HookInput {
  return HookInputSchema.parse(data);
}

export function parseClaudeResponse(data: unknown): ClaudeResponse {
  return ClaudeResponseSchema.parse(data);
}

export function parseConfig(data: unknown): Config {
  return ConfigSchema.parse(data);
}

// Approval Cache Schema
export const ApprovalCacheEntrySchema = z.object({
  toolName: z.string(),
  toolInput: z.record(z.string(), z.unknown()),
  decision: z.enum(['approve', 'block']),
  reason: z.string(),
  timestamp: z.string(), // ISO timestamp
});

export type ApprovalCacheEntry = z.infer<typeof ApprovalCacheEntrySchema>;

export const ApprovalCacheSchema = z.record(
  z.string(), // working directory
  z.record(
    z.string(), // cache key (hash of tool + input)
    ApprovalCacheEntrySchema
  )
);

export type ApprovalCache = z.infer<typeof ApprovalCacheSchema>;

// Safe parsing function for cache
export function parseApprovalCache(data: unknown): ApprovalCache {
  return ApprovalCacheSchema.parse(data);
}
