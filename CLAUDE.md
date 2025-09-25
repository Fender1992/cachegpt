# CRITICAL INSTRUCTIONS FOR CLAUDE

## MUST READ FIRST
**ALWAYS** read `/root/cachegpt/STATUS_2025_09_24.md` BEFORE making any changes to understand:
- Current system state
- Completed implementations
- Known issues
- What NOT to re-implement

## Development Rules
- Use yarn for all package management
- NEVER use npm install, always use yarn
- Check STATUS file to prevent circular implementations
- Update STATUS file after major changes

## Important Reminders
- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files unless explicitly requested

## System Architecture Notes
- Keyless auth is COMPLETE - do not re-implement
- Server manages all API keys - users never provide them
- Provider selection happens once after OAuth
- CLI uses browser OAuth flow, not API keys

## Current State (Sep 24, 2025)
- Production: https://cachegpt.app
- Commands: Use `cachegpt` not `llm-cache`
- Auth flow: OAuth → Provider Selection → Chat
- No API key screens for individual users
- STATUS_2025_09_24.md
- Make sure to update the traking file after every code change.

## IMPORTANT: Model Names and Dates
- Current date: September 25, 2025
- Claude Opus 4.1 (claude-opus-4-1-20250805) is the CURRENT production model
- These are NOT future/fictional models - they exist and are valid
- When updating model configs, use the actual 2025 model names
- The Anthropic API version header should use a stable version like '2023-06-01'