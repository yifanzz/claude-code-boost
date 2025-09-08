# Claude Code Boost

**Hook utilities for Claude Code: auto-approval, test enforcement, and notifications**

A practical toolkit that adds useful automation to Claude Code through its hook system. Includes intelligent auto-approval for safe operations, test enforcement to ensure code quality, and desktop notifications for development events.

## What it provides

Four main hook implementations for Claude Code:

### Auto-Approval Hook
Reduces manual approval overhead by automatically approving common safe operations:
- File operations (reading, writing, basic file management)
- Standard build/test commands (`npm test`, `npm build`, `git commit`)
- Local development requests (`curl localhost:3000`)
- Package management (`npm install`, dependency updates)
- Basic Docker operations

Always blocks destructive system commands (`rm -rf /`, disk formatting, etc.)

### Test Enforcement Hook
Analyzes conversation transcripts to detect when tests should be run before ending a session:
- Parses Claude Code conversation history
- Uses LLM analysis to determine if code changes warrant testing
- Can block session termination until tests are executed

### Notification Hook
Simple desktop notifications for Claude Code events:
- Cross-platform support (macOS, Windows, Linux)
- Useful for long-running operations or important alerts

### Transcript Parser
Utility for processing Claude Code conversation logs:
- Converts JSONL transcript format to structured XML
- Extracts user messages, assistant responses, and commands
- Useful for analysis or integration with other tools

## Installation

**Prerequisites**: Node.js 20+ and Claude Code installed

```bash
# Step 1: Install Claude Code Boost globally
npm install -g claude-code-boost

# Step 2: Run the install command to set up the hook
ccb install
```

The `ccb install` command guides you through:
1. Choose installation location (user, project, or project-local settings)
2. Choose authentication method (API proxy or direct API key)
3. Configure Claude Code settings automatically
4. Verify the setup works

## How it works

Claude Code Boost uses Claude Code's hook system to intercept tool calls before execution:

```
Claude Code Tool Request → CCB Hook → Decision → Execute/Block
```

### Auto-Approval Logic
1. **Fast approval** for obviously safe operations (Read, LS, Glob)
2. **LLM analysis** for complex operations using system prompts
3. **Caching** to avoid redundant API calls for identical requests
4. **Always block** genuinely destructive commands

### Authentication Options
- beyondthehype.dev API proxy (simplest setup)
- OpenAI API (for OpenAI or compatible endpoints)
- Anthropic API (direct Claude access)

## Configuration

### Quick Setup
```bash
# Interactive installation with prompts
ccb install --user

# Non-interactive with API key  
ccb install --user --api-key sk-your-api-key-here

# Use project-level settings
ccb install --project-local
```

### Advanced Configuration

CCB uses a configuration file located at `~/.ccb/config.json` (or `$CCB_CONFIG_DIR/config.json`):

```json
{
  "log": true,        // Enable/disable approval logging
  "cache": true,      // Enable/disable approval caching (default: true)  
  "apiKey": "sk-..."  // Anthropic API key (optional)
}
```

**Configuration Options:**

- **`log`** (boolean, default: `true`): Controls whether approval decisions are logged to `~/.ccb/approval.jsonl`
- **`cache`** (boolean, default: `true`): Controls intelligent caching of approval decisions to avoid redundant AI calls
- **`apiKey`** (string, optional): Anthropic API key for direct API access (overrides `ANTHROPIC_API_KEY` environment variable)

**Caching Behavior:**
- ✅ **Enabled by default** for optimal performance
- 🏠 **Working directory scoped** for safety across different projects
- 🎯 **Caches only definitive decisions** (approve/block, not "unsure")
- 🚀 **Instant responses** for repeated operations
- 🧹 **Easy management** with `ccb debug clear-approval-cache`

```bash
# Disable caching if needed
echo '{"log": true, "cache": false}' > ~/.ccb/config.json

# Clear approval cache
ccb debug clear-approval-cache
```

### What gets auto-approved? ✅
- **File operations**: Reading, writing, editing files
- **Development tools**: `npm test`, `npm build`, `git commit`
- **Localhost requests**: `curl http://localhost:3000`
- **Docker operations**: `docker build`, `docker run`
- **Package management**: `npm install`, `yarn add`

### What gets blocked? ❌  
- **System destruction**: `rm -rf /`, `rm -rf /usr`
- **Disk operations**: `mkfs`, destructive `fdisk`
- **Malicious activity**: DoS attacks, credential theft

## Testing & Verification

### Test Auto-Approval Hook
```bash
# Test safe operation approval
echo '{"session_id":"test","transcript_path":"/tmp/test","tool_name":"Read","tool_input":{"file_path":"/etc/hosts"}}' | ccb auto-approve-tools
# Expected: {"decision":"approve","reason":"Read is a safe read-only operation"}

# Test dangerous operation blocking
echo '{"session_id":"test","transcript_path":"/tmp/test","tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | ccb auto-approve-tools
# Expected: {"decision":"block","reason":"..."}
```

### Test Other Hooks
```bash
# Test notification system
echo '{"session_id":"test","transcript_path":"/tmp/test","cwd":"/tmp","hook_event_name":"Notification","message":"Test notification from CCB"}' | ccb notification

# Test Stop hook (requires transcript file)
echo '{"session_id":"test","transcript_path":"/path/to/transcript.jsonl","cwd":"/tmp","stop_hook_active":false}' | ccb enforce-tests
```

### Debug Commands
```bash
# Clear approval cache
ccb debug clear-approval-cache

# View current config
cat ~/.ccb/config.json

# View approval logs  
tail -f ~/.ccb/approval.jsonl

# View cached decisions
cat ~/.ccb/approval_cache.json
```

## Development Goals

Claude Code Boost aims to make Claude Code more practical for daily development work by reducing friction in common workflows.

### What's Working Today
- 🛡️ Auto-approval for safe operations (reduces manual clicking)
- 🧪 Test enforcement through conversation analysis
- 🔔 Basic desktop notifications
- 📊 Transcript parsing utilities

### Planned Improvements
- Better caching strategies to reduce API costs
- More sophisticated test detection patterns
- Additional hook types based on user feedback
- Performance optimizations

This is an early-stage project that solves real workflow friction. Contributions and feedback are welcome as we figure out what developers actually need from Claude Code automation.

## Community & Support

- **Issues**: [Report bugs or request features](https://github.com/yifanzz/claude-code-boost/issues)
- **Discussions**: [Share usage patterns and suggestions](https://github.com/yifanzz/claude-code-boost/discussions)  
- **Documentation**: [Development setup in CLAUDE.md](./CLAUDE.md)
- **Contributing**: See CLAUDE.md for local development instructions

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

```bash
npm install -g claude-code-boost && ccb install
```