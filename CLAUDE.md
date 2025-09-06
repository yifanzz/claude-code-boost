# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Boost is a TypeScript-based CLI tool that provides intelligent auto-approval hooks for Claude Code. It enhances developer productivity by automatically approving safe development operations while blocking genuinely destructive commands.

## Architecture

The project follows a simple CLI architecture:

- **Entry Point**: `src/index.ts` - Uses Commander.js for CLI structure
- **Main Command**: `src/commands/auto-approve-tools.ts` - Core logic for tool approval decisions
- **Hook Integration**: Processes Claude Code PreToolUse hooks via stdin/stdout JSON communication  
- **AI-Powered Decisions**: Falls back to Claude API for complex approval decisions
- **Type Safety**: `src/types/hook-schemas.ts` - Zod schemas for input/output validation
- **Security Model**: Two-tier approval system:
  - Fast approval for unambiguously safe tools (Read, LS, Glob, etc.)
  - AI-powered analysis for complex operations using `prompts/system-prompt.md`

## Development Commands

### Build and Test
```bash
npm run build          # TypeScript compilation to dist/
npm run type-check     # Type checking without compilation
npm run test           # Run test suite with Vitest
npm run test:watch     # Watch mode for tests
npm run test:env       # Run tests with .env.local file
```

### Linting and Formatting
```bash
npm run lint           # ESLint checking
npm run lint:fix       # Auto-fix linting issues
npm run prettier       # Format code with Prettier
npm run prettier:check # Check code formatting
```

### Development
```bash
npm run dev            # Run CLI with tsx (development mode)
npm run prepublishOnly # Full build + test + lint pipeline
```

### CLI Testing
```bash
# Test the CLI locally (requires ANTHROPIC_API_KEY env var or config.json)
echo '{"session_id":"test","transcript_path":"/tmp/test","tool_name":"Read","tool_input":{"file_path":"/test"}}' | ANTHROPIC_API_KEY=your_key npm run dev auto-approve-tools

# Test with API authentication
echo '{"session_id":"test","transcript_path":"/tmp/test","tool_name":"Read","tool_input":{"file_path":"/test"}}' | npm run dev auto-approve-tools

# Install CCB hook to Claude Code settings
npm run build && node dist/index.js install --user        # Install to user settings
npm run build && node dist/index.js install --project     # Install to project settings
npm run build && node dist/index.js install --project-local # Install to project local settings
```

### Release Process

The project includes automated release scripts for consistent versioning and changelog management:

```bash
# Generate changelog entry for current version
npm run changelog

# Full release process (interactive)
npm run release patch    # Patch version (0.3.0 -> 0.3.1)
npm run release minor    # Minor version (0.3.0 -> 0.4.0) 
npm run release major    # Major version (0.3.0 -> 1.0.0)
npm run release 1.0.0    # Specific version

# Manual changelog generation
tsx scripts/generate-changelog-entry.ts [version]
```

The release script will:
1. Run tests, linting, and build
2. Update package.json version
3. Generate changelog entry from git commits
4. Create git commit and tag
5. Optionally push to remote and publish to npm

## Key Implementation Details

### Hook Processing Flow
1. Reads JSON input from stdin (Claude Code hook format)
2. Parses with Zod schema validation
3. Checks fast approval list first (read-only operations)
4. Falls back to AI analysis via:
   - beyondthehype.dev API proxy (default)
   - OpenAI-compatible endpoints (when API key is available in config or environment)
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

- `CCB_CONFIG_DIR` - Configuration directory for CCB (defaults to `$HOME/.ccb`)
- `ANTHROPIC_API_KEY` - API key for Anthropic Claude API integration (can also be set in config.json)

### Configuration

CCB uses a `config.json` file located in the CCB configuration directory (`$CCB_CONFIG_DIR` or `$HOME/.ccb`). The config schema includes:

```json
{
  "log": boolean,     // Enable/disable approval logging (default: true)
  "apiKey": string    // Anthropic API key (optional, overrides ANTHROPIC_API_KEY env var)
}
```

The configuration is validated using Zod schemas and will show warnings for invalid configurations while falling back to defaults.

#### Authentication Configuration

You can configure authentication for CCB in two ways:

1. **Config file** (recommended for persistent setup):
   ```bash
   mkdir -p ~/.ccb
   echo '{"log": true, "apiKey": "sk-your-api-key-here"}' > ~/.ccb/config.json
   ```

2. **Environment variable** (good for temporary use):
   ```bash
   export ANTHROPIC_API_KEY=sk-your-api-key-here
   ```

**Priority order:** beyondthehypeApiKey in config > openaiApiKey/OPENAI_API_KEY or apiKey/ANTHROPIC_API_KEY in config or environment

### Installation

Use the `install` command to automatically configure CCB as a PreToolUse hook in Claude Code settings:

```bash
ccb install [options]
```

#### Installation Options

**Location options:**
- `--user`: Install to user settings (`~/.claude/settings.json`)
- `--project`: Install to project settings (`.claude/settings.json`)
- `--project-local`: Install to project local settings (`.claude/settings.local.json`)

**Authentication options:**
- `--api-key <key>`: Set Anthropic API key (non-interactive)
- `--non-interactive`: Skip interactive prompts (for testing/automation)

#### Interactive Installation

When run without location or authentication flags, CCB will guide you through an interactive setup:

1. **Choose Installation Location:**
   - User settings (recommended) - `~/.claude/settings.json`
   - Project settings - `.claude/settings.json`  
   - Project local settings - `.claude/settings.local.json`

2. **Choose Authentication Method:**
   - Use beyondthehype.dev API proxy (recommended)
   - Use Anthropic API key for direct API access
   - Use OpenAI-compatible endpoint

3. **If Using API Key:**
   - Get your API key from https://console.anthropic.com/
   - API keys should start with "sk-"

#### Non-Interactive Installation Examples

```bash
# Install with Anthropic API key
ccb install --user --api-key sk-your-api-key-here

# Install for automation (uses beyondthehype.dev by default)
ccb install --project-local --non-interactive
```

The installer includes conflict detection and will not overwrite existing PreToolUse hooks. When using `--project-local`, it automatically configures git to ignore the settings file.

### Approval Logic

The approval logic is customizable via `prompts/system-prompt.md` and `prompts/user-prompt.md` which contain the Claude prompt templates for decision-making. The templates use placeholders:
- `{{toolName}}` - Name of the tool being executed
- `{{toolInput}}` - JSON input parameters for the tool

### Approval Logging

CCB automatically logs all approval decisions to `${CCB_CONFIG_DIR}/approval.jsonl` in JSONL format. Each log entry contains:
- `datetime` - ISO timestamp of the decision
- `tool` - Name of the tool that was evaluated
- `inputs` - JSON object of tool input parameters
- `reason` - Human-readable reason for the decision
- `decision` - One of: "approve", "block", or "undefined"
- `cwd` - Current working directory when the decision was made
- `session_id` - Claude Code session identifier

The logging system is thread-safe and handles concurrent access gracefully. Log entries are atomic writes to prevent corruption.

## Development Guidelines

### Testing Requirements
- **Write tests for all new features** unless explicitly told not to
- **Run tests before committing** to ensure code quality and functionality
- Use `npm run test` to verify all tests pass before making commits
- Tests should cover both happy path and edge cases for new functionality

### Logging Guidelines
- **Use util logger for all logging** - MUST avoid directly using console.log lines
- Use the project's logging utility instead of direct console output for consistent logging behavior

### Pre-Commit Checklist
Before committing any changes, ensure:
1. All tests pass (`npm run test`)
2. Code passes type checking (`npm run type-check`) 
3. Code passes linting (`npm run lint`)
4. New features have corresponding tests written