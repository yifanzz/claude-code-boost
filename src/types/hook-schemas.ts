import { z } from 'zod';

// Claude Code Hook Input Schema
export const HookInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
});

export type HookInput = z.infer<typeof HookInputSchema>;

// Notification Hook Input Schema
export const NotificationHookInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  hook_event_name: z.literal('Notification'),
  message: z.string(),
});

export type NotificationHookInput = z.infer<typeof NotificationHookInputSchema>;

// Claude Code Hook Output Schema
export const HookOutputSchema = z.object({
  hookSpecificOutput: z.object({
    hookEventName: z.literal('PreToolUse'),
    permissionDecision: z.enum(['allow', 'deny', 'ask']).optional(),
    permissionDecisionReason: z.string(),
  }),
});

export type HookOutput = z.infer<typeof HookOutputSchema>;

// Claude CLI Response Schema
export const ClaudeResponseSchema = z.object({
  decision: z.enum(['allow', 'deny', 'ask']),
  reason: z.string(),
});

export type ClaudeResponse = z.infer<typeof ClaudeResponseSchema>;

// Config Schema
export const ConfigSchema = z.object({
  log: z.boolean().default(true),
  generalLog: z.boolean().default(true), // Enable general Pino logging
  logLevel: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'), // Log level for general logging
  apiKey: z.string().optional(), // Anthropic API key (backwards compatibility)
  openaiApiKey: z.string().optional(), // OpenAI API key
  baseUrl: z.string().optional(), // OpenAI base URL (for OpenRouter, etc.)
  model: z.string().default('gpt-5'), // OpenAI model to use
  cache: z.boolean().default(true), // Enable approval caching
});

export type Config = z.infer<typeof ConfigSchema>;

// Safe parsing functions
export function parseHookInput(data: unknown): HookInput {
  return HookInputSchema.parse(data);
}

export function parseNotificationHookInput(
  data: unknown
): NotificationHookInput {
  return NotificationHookInputSchema.parse(data);
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
  decision: z.enum(['allow', 'deny']),
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
