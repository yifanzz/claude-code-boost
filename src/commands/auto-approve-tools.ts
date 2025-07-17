import { readFileSync } from 'fs';

interface HookInput {
  session_id: string;
  transcript_path: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

interface HookOutput {
  decision: 'approve' | 'block';
  reason?: string;
  continue?: boolean;
  suppressOutput?: boolean;
}

const APPROVED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Bash',
  'Glob',
  'Grep',
  'LS',
  'Task',
  'TodoWrite',
  'NotebookRead',
  'NotebookEdit',
  'WebFetch',
  'WebSearch'
];

export function autoApproveTools(): void {
  try {
    const input = readFileSync(0, 'utf8');
    const hookData: HookInput = JSON.parse(input);
    
    const output: HookOutput = {
      decision: APPROVED_TOOLS.includes(hookData.tool_name) ? 'approve' : 'block',
      reason: APPROVED_TOOLS.includes(hookData.tool_name) 
        ? `Auto-approved ${hookData.tool_name} tool`
        : `Tool ${hookData.tool_name} not in approved list`,
      continue: true,
      suppressOutput: true
    };
    
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (error) {
    process.stderr.write(`Error processing hook input: ${error}\n`);
    process.exit(1);
  }
}