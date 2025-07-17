import { z } from 'zod';

// Claude Code Hook Input Schema
export const HookInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown())
});

export type HookInput = z.infer<typeof HookInputSchema>;

// Claude Code Hook Output Schema
export const HookOutputSchema = z.object({
  decision: z.enum(['approve', 'block']).optional(),
  reason: z.string()
});

export type HookOutput = z.infer<typeof HookOutputSchema>;

// Claude CLI Response Schema
export const ClaudeResponseSchema = z.object({
  decision: z.enum(['approve', 'block', 'unsure']),
  reason: z.string()
});

export type ClaudeResponse = z.infer<typeof ClaudeResponseSchema>;

// Safe parsing functions
export function parseHookInput(data: unknown): HookInput {
  return HookInputSchema.parse(data);
}

export function parseClaudeResponse(data: unknown): ClaudeResponse {
  return ClaudeResponseSchema.parse(data);
}