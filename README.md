# Claude Code Boost 🚀

**Hook utilities for Claude Code with intelligent auto-approval**

Claude Code Boost enhances your Claude Code experience by providing intelligent tool auto-approval hooks that maximize developer productivity while maintaining security. The tool uses context-aware decision making to approve safe development operations while blocking only truly destructive commands.

## Features

- 🧠 **Context-aware decision making** - Considers project context and development workflow
- 🔒 **Security-focused** - Only blocks truly destructive operations (rm -rf /, system wipes)
- 🚀 **Developer-friendly** - Approves standard development operations (localhost, build, test)
- 📝 **Customizable prompts** - Easy-to-modify markdown-based approval prompts
- 🔧 **TypeScript support** - Full TypeScript implementation with type safety
- ✅ **Well-tested** - Comprehensive test suite with real API integration

## Installation

```bash
npm install -g claude-code-boost
```

## Quick Start

> **⚠️ Security Notice:** While auto-granting permissions can be convenient for development, use with caution. Review the approval logic and ensure it aligns with your security requirements.

### 1. Configure Claude Code Hooks

Add to your Claude Code settings file:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "ccb auto-approve-tools"
          }
        ]
      }
    ]
  }
}
```

### 2. Start using Claude Code

The hook will automatically:
- ✅ **Approve** safe operations (reading files, localhost requests, build/test commands)
- ✅ **Approve** standard development operations (npm install, docker commands, git operations)
- ❌ **Block** destructive operations (rm -rf /, system wipes, malicious commands)
- ❓ **Ask user** for ambiguous operations

## Commands

### `ccb auto-approve-tools`

The main command that processes Claude Code PreToolUse hooks.

**Input:** JSON via stdin with hook data:
```json
{
  "session_id": "string",
  "transcript_path": "string", 
  "tool_name": "string",
  "tool_input": {...}
}
```

**Output:** JSON decision:
```json
{
  "decision": "approve|block|undefined",
  "reason": "Human-readable explanation"
}
```

## Configuration

### Customizing Approval Logic

The approval logic is defined in `prompts/auto-approve-tools.md`. You can customize this file to match your specific needs:

```markdown
# Tool Approval Security Filter

You are a security filter for Claude Code tool execution...

## Decision Criteria

- **"approve"** - for safe development operations
- **"block"** - ONLY for destructive operations  
- **"unsure"** - for ambiguous cases
```

### Examples of Approved Operations

- File operations: `Read`, `Write`, `Edit`, `Glob`, `Grep`
- Development commands: `npm test`, `npm build`, `npm install`
- Localhost operations: `curl http://localhost:3000`, `WebFetch localhost`
- Docker operations: `docker build`, `docker run`, `docker system prune`
- Git operations: `git commit`, `git push`, `git reset --hard`
- System administration: `sudo apt install`, `chmod`, `chown`

### Examples of Blocked Operations

- System destruction: `rm -rf /`, `rm -rf /usr`, `rm -rf /etc`
- System wipes: `mkfs`, destructive `fdisk` operations
- Malicious network operations: DoS attacks, system intrusion attempts
- Credential theft: Commands designed to steal sensitive data

## Development

### Prerequisites

- Node.js 18+ 
- Claude Code CLI installed and configured
- TypeScript knowledge (optional, for contributions)

### Local Development

```bash
# Clone the repository
git clone https://github.com/yifanzz/claude-code-boost.git
cd claude-code-boost

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests with environment variables
npm run test:env

# Test the CLI locally
echo '{"session_id":"test","transcript_path":"/tmp/test","tool_name":"Read","tool_input":{"file_path":"/test"}}' | npm run dev auto-approve-tools
```

### Testing

The project includes comprehensive tests:

```bash
# Run all tests
npm test

# Run tests with watch mode
npm run test:watch

# Run tests with .env.local file
npm run test:env

# Run specific test
npm test -- -t "should approve localhost operations"
```

## How It Works

1. **Hook Integration**: Claude Code calls the hook before executing any tool
2. **Context Analysis**: The tool analyzes the operation using project context
3. **Decision Making**: Uses Claude's intelligence to make approve/block/unsure decisions
4. **Response**: Returns JSON decision back to Claude Code
5. **Execution**: Claude Code proceeds based on the decision

## Security Model

The security model is designed to be **permissive by default** while blocking only **genuinely dangerous operations**:

- **Trust developers** - Most operations are legitimate development work
- **Context matters** - Operations are evaluated within project context
- **Minimize friction** - Avoid blocking common development operations
- **Prevent disasters** - Block only operations that could cause real harm

## Troubleshooting

### Common Issues

**Hook not working?**
- Ensure Claude Code CLI is installed and configured
- Check that the hook command path is correct
- Verify the JSON input format matches the expected schema

**Tests failing?**
- Check that you have proper internet connection for API calls
- Ensure Claude Code CLI is properly configured
- Some tests may timeout due to API rate limiting (this is normal)

**Commands being blocked unexpectedly?**
- Review the `prompts/auto-approve-tools.md` file
- Consider the project context - some operations may need additional context
- Check the decision reasoning in the output

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `npm run lint` and `npm test`
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📝 [Issues](https://github.com/yifanzz/claude-code-boost/issues)
- 💬 [Discussions](https://github.com/yifanzz/claude-code-boost/discussions)
- 📚 [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)

---

**Made with ❤️ for the Claude Code community**