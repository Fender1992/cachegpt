# Changelog

## [2.0.0] - 2025-09-24

### 🚀 Breaking Changes
- Complete overhaul of authentication system - removed all API key entry for individual users
- Users no longer need to provide API keys - all handled server-side
- New auth flow: OAuth → Provider Selection → Chat

### ✨ Features
- **Keyless Authentication**: Users authenticate via OAuth and select provider, no API keys required
- **Latest AI Models**: Updated to cutting-edge September 2025 models
- **Auto-updating Models**: System automatically checks for and uses latest model versions
- **Enterprise Mode**: Optional feature flag for organizations needing user-provided keys
- **Provider Selection UI**: Clean, intuitive interface for choosing AI provider

### 🤖 Model Updates
- **ChatGPT**: Updated to GPT-5 (256k context)
  - Secondary: GPT-4 Turbo (128k context)
- **Claude**: Updated to Opus 4.1 (500k context)
  - Secondary: Sonnet 4 (300k context)
- **Gemini**: Updated to Gemini 2.0 Ultra (5M context)
  - Secondary: Gemini 2.0 Pro (2M context)
- **Perplexity**: Updated to Perplexity Pro (32k context)
  - Includes real-time search capabilities
- **Llama**: Added Llama 3 405B support (32k context)

### 🔧 Technical Changes
- Server-side API key management via environment variables
- Added `selected_provider` and `selected_model` to user profiles
- Implemented dynamic model configuration system
- Updated API endpoints to use latest provider APIs
- Enhanced security with server-managed credentials

### 📝 Documentation
- Added comprehensive STATUS tracking file
- Created KEYLESS_AUTH documentation
- Updated CLAUDE.md with critical instructions
- Added this CHANGELOG

### 🐛 Bug Fixes
- Fixed 429 rate limiting from API key polling
- Resolved callback_port parameter loss during OAuth
- Fixed text contrast issues in auth pages
- Corrected command prefix from `llm-cache` to `cachegpt`

### 🔐 Security
- No user API keys stored in database
- All provider calls use server credentials
- Row Level Security (RLS) on all tables
- Session-based authentication

## [1.0.0] - 2025-01-15

### Initial Release
- Basic chat functionality
- User API key management
- Support for multiple LLM providers
- CLI tool for terminal usage