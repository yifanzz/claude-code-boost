# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code YOLO is a TypeScript-based CLI tool that provides intelligent auto-approval hooks for Claude Code. It enhances developer productivity by automatically approving safe development operations while blocking genuinely destructive commands.

## Architecture

The project follows a simple CLI architecture:

- **Entry Point**: `src/index.ts` - Uses Commander.js for CLI structure
- **Main Command**: `src/commands/auto-approve-tools.ts` - Core logic for tool approval decisions
- **Hook Integration**: Processes Claude Code PreToolUse hooks via stdin/stdout JSON communication  
- **AI-Powered Decisions**: Falls back to Claude API for complex approval decisions
- **Type Safety**: `src/types/hook-schemas.ts` - Zod schemas for input/output validation
- **Security Model**: Two-tier approval system:
  - Fast approval for unambiguously safe tools (Read, LS, Glob, etc.)
  - AI-powered analysis for complex operations using `prompts/auto-approve-tools.md`

## Development Commands

### Build and Test
```bash
npm run build          # TypeScript compilation to dist/
npm run type-check     # Type checking without compilation
npm run test           # Run test suite with Vitest
npm run test:watch     # Watch mode for tests
npm run test:env       # Run tests with .env.local file
```

### Linting
```bash
npm run lint           # ESLint checking
npm run lint:fix       # Auto-fix linting issues
```

### Development
```bash
npm run dev            # Run CLI with tsx (development mode)
npm run prepublishOnly # Full build + test + lint pipeline
```

### CLI Testing
```bash
# Test the CLI locally
echo '{"session_id":"test","transcript_path":"/tmp/test","tool_name":"Read","tool_input":{"file_path":"/test"}}' | npm run dev auto-approve-tools
```

## Key Implementation Details

### Hook Processing Flow
1. Reads JSON input from stdin (Claude Code hook format)
2. Parses with Zod schema validation
3. Checks fast approval list first (read-only operations)
4. Falls back to AI analysis via Claude CLI spawn
5. Returns JSON decision: `{"decision": "approve|block|undefined", "reason": "..."}`

### Security Philosophy
- **Permissive by default** - Approves standard development operations
- **Context-aware** - Uses project knowledge to inform decisions
- **Destructive-only blocking** - Only blocks genuinely harmful operations (rm -rf /, system wipes)
- **Developer trust** - Assumes most operations are legitimate development work

### Testing Strategy
- Unit tests for approval logic
- Integration tests with actual Claude API calls
- Mock scenarios for edge cases
- Environment variable support for API testing

## Configuration

### Environment Variables

- `CCY_CONFIG_DIR` - Configuration directory for CCY (defaults to `$HOME/.ccy`)
- `ANTHROPIC_API_KEY` - API key for Claude Code CLI integration

### Approval Logic

The approval logic is customizable via `prompts/auto-approve-tools.md` which contains the Claude prompt template for decision-making. The template uses placeholders:
- `{{toolName}}` - Name of the tool being executed
- `{{toolInput}}` - JSON input parameters for the tool

### Approval Logging

CCY automatically logs all approval decisions to `${CCY_CONFIG_DIR}/approval.jsonl` in JSONL format. Each log entry contains:
- `datetime` - ISO timestamp of the decision
- `tool` - Name of the tool that was evaluated
- `inputs` - JSON object of tool input parameters
- `reason` - Human-readable reason for the decision
- `decision` - One of: "approve", "block", or "undefined"
- `cwd` - Current working directory when the decision was made
- `session_id` - Claude Code session identifier

The logging system is thread-safe and handles concurrent access gracefully. Log entries are atomic writes to prevent corruption.