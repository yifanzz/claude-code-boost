# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Doctor command for comprehensive environment diagnostics (`ccb doctor`).
- Uninstall command to remove CCB hooks from Claude Code settings.
- Multi‑provider LLM client using a unified OpenAI SDK interface.

### Fixed
- Resolve dependency issue affecting local development/setup.

## [0.5.0] - 2025-09-08

### Added
- Conversation transcript parser utility for Claude Code logs.
- Enhanced Stop hook behavior and transcript analysis capabilities.

### Changed
- Removed Claude CLI dependency; switched to API‑only authentication flow.
- Updated Stop hook output schema to match current Claude Code format.
- Updated README with comprehensive feature overview.

### Fixed
- Resolved test failures and improved reliability across suites.

## [0.4.0] - 2025-09-04

### Added
- Mandatory user feedback for ExitPlanMode tool
- Setup to support OpenAI-compatible endpoints
- --no-cache flag for testing API integrations
- Unified ToolDecisionSchema with OpenAI structured output
- PreToolUse hook API to new format and fix OpenAI integration
- Pino general logging system for enhanced debugging
- Git safety rules to prevent destructive force-pushes to protected branches
- Notification system to use node-notifier for cross-platform support
- OpenAI API support and notification system with backwards compatibility
- Automated release scripts and changelog generation
- Option to use existing API key during installation

### Fixed
- Release script from CommonJS to ES module syntax
- Error handling in notification command for JSON parsing issues

## [0.3.0] - 2025-07-21

### Added
- Intelligent approval caching with configurable toggle for improved performance
- Interactive installation prompts for better user experience
- Enhanced authentication setup with multiple options (CLI vs API key)
- Direct Anthropic API integration with configuration support
- Comprehensive logging system with JSONL format approval logs
- Prompt caching for tool approval system to reduce API calls

### Changed
- Simplified authentication flow with better user guidance
- Improved installation documentation with clear location selection
- Enhanced configuration system with validation and fallback defaults

### Fixed
- Fixed npm global installation issue where CLI was looking for package 'ccb' instead of 'claude-code-boost'
- Installation conflict detection to prevent overwriting existing hooks
- Git ignore configuration for project-local settings

## [0.2.0] - 2025-07-21

### Added
- Initial release of Claude Code Boost
- Core auto-approval functionality for Claude Code hooks
- Two-tier approval system (fast approval + AI-powered analysis)
- TypeScript-based CLI tool with Commander.js
- Zod schema validation for input/output
- Support for both Claude CLI and Anthropic API backends
- Basic installation and configuration commands

### Security
- Security-focused approval logic that blocks genuinely destructive operations
- Permissive-by-default approach for standard development operations

[Unreleased]: https://github.com/yifanzz/claude-code-boost/compare/e707875...HEAD
[0.5.0]: https://github.com/yifanzz/claude-code-boost/compare/v0.4.0...e707875
[0.3.0]: https://github.com/yifanzz/claude-code-boost/compare/v0.2.0...v0.3.0
[0.4.0]: https://github.com/yifanzz/claude-code-boost/compare/v0.3.0...v0.4.0
[0.2.0]: https://github.com/yifanzz/claude-code-boost/releases/tag/v0.2.0
