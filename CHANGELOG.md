# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Fixed npm global installation issue where CLI was looking for package 'ccb' instead of 'claude-code-boost'

## [0.3.0] - 2025-01-21

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
- Installation conflict detection to prevent overwriting existing hooks
- Git ignore configuration for project-local settings

## [0.2.0] - 2024-XX-XX

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

[Unreleased]: https://github.com/yifanzz/claude-code-boost/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/yifanzz/claude-code-boost/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yifanzz/claude-code-boost/releases/tag/v0.2.0