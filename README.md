# Claude Code Boost 🚀

**The intelligent auto-approval system for Claude Code**

Stop manually approving every safe development operation! Claude Code Boost intelligently auto-approves common development tasks while keeping you protected from dangerous commands.

## ✨ What it does

Claude Code Boost acts as your intelligent assistant by leveraging Claude Code's PreToolUse hook, automatically approving safe operations like:
- 📖 **Reading files** and exploring your codebase  
- 🔨 **Building and testing** your applications
- 🌐 **Making localhost requests** for development
- 📦 **Installing packages** and managing dependencies
- 🐳 **Running Docker commands** and managing containers

While **always blocking** truly dangerous operations like `rm -rf /` or system wipes.

## 📦 Installation

**Prerequisites**: Node.js 20+ and Claude Code installed

```bash
# Step 1: Install Claude Code Boost globally
npm install -g claude-code-boost

# Step 2: Run the install command to set up the hook
ccb install
```

The `ccb install` command will interactively guide you through:
1. **Choose installation location**: User settings (recommended), project settings, or project-local settings
2. **Choose authentication method**: Claude CLI (recommended) or direct API key access  
3. **Install the hook**: Automatically configures Claude Code settings
4. **Verify setup**: Ensures everything is working properly

## 🏗️ How it works

Claude Code Boost uses a **two-tier approval system**:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude Code   │ ──▶│  CCB Hook       │ ──▶│   Your Command  │
│   Tool Request  │    │  Pre-approval   │    │   Executes      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                               ▼
                       ┌───────────────────────┐
                       │  🚀 Fast Approval     │
                       │  (Read, LS, Glob...)  │
                       │                       │
                       │  🤖 AI Analysis       │  
                       │  (Bash, complex ops)  │
                       └───────────────────────┘
```

**Fast Track**: Instantly approves obviously safe operations (reading files, listing directories)

**AI Analysis**: For complex operations, uses Claude's intelligence to make context-aware decisions

**Authentication**: Works with either Claude CLI or direct Anthropic API access

## ⚙️ Configuration

### Quick Setup
```bash
# Interactive installation with prompts
ccb install --user

# Non-interactive with API key  
ccb install --user --api-key sk-your-api-key-here

# Use project-level settings
ccb install --project-local
```

### What gets approved? ✅
- **File operations**: Reading, writing, editing files
- **Development tools**: `npm test`, `npm build`, `git commit`
- **Localhost requests**: `curl http://localhost:3000`
- **Docker operations**: `docker build`, `docker run`
- **Package management**: `npm install`, `yarn add`

### What gets blocked? ❌  
- **System destruction**: `rm -rf /`, `rm -rf /usr`
- **Disk operations**: `mkfs`, destructive `fdisk`
- **Malicious activity**: DoS attacks, credential theft

## 🔍 Verification

Test that CCB is working:

```bash
# This should show auto-approval in action
echo '{"session_id":"test","transcript_path":"/tmp/test","tool_name":"Read","tool_input":{"file_path":"/etc/hosts"}}' | ccb auto-approve-tools
# Expected: {"decision":"approve","reason":"Read is a safe read-only operation"}
```

## 🚀 Future: The Claude Code Hook Ecosystem

Claude Code Boost's auto-approval tool is just the **beginning**. We're building a comprehensive hook ecosystem for Claude Code:

**Coming Soon:**
- 📊 **Analytics hooks** - Track your Claude Code usage and productivity  
- 🔍 **Code quality hooks** - Automatically run linters and formatters
- 🧪 **Testing hooks** - Auto-run tests when code changes
- 📝 **Documentation hooks** - Auto-generate docs for new functions
- 🔄 **CI/CD hooks** - Integrate with your deployment pipeline

**Vision**: Transform Claude Code into a fully integrated development environment with intelligent automation at every step.

## 🤝 Community & Support

- 🐛 **Issues**: [Report bugs or request features](https://github.com/yifanzz/claude-code-boost/issues)
- 💬 **Discussions**: [Join the community](https://github.com/yifanzz/claude-code-boost/discussions)  
- 📚 **Documentation**: [Detailed docs in CLAUDE.md](./CLAUDE.md)
- 🔧 **Development**: See [CLAUDE.md](./CLAUDE.md) for development setup

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Ready to boost your Claude Code productivity?** 
```bash
npm install -g claude-code-boost && ccb install
```

*Made with ❤️ for the Claude Code community*