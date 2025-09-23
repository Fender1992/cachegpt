# Changelog

## v8.0.0 (2025-09-23)

### Major Features
- **Browser-based Authentication**: Seamless OAuth login with automatic window closing
- **Username Display**: Shows actual username instead of generic "you" after login
- **LLM Provider Selection**: Visual interface to select ChatGPT, Claude, Gemini, or Perplexity after authentication
- **Automated Token Capture**: Browser automation for ChatGPT and Claude session capture
- **Multi-Provider Support**: Unified authentication flow for all major LLM providers

### Authentication Flow
1. User runs `llm-cache login` in terminal
2. Browser opens with CacheGPT login page
3. After OAuth authentication, username is displayed
4. Provider selection grid appears
5. Upon selection, browser closes automatically
6. Terminal continues with provider-specific authentication
7. Tokens/API keys are captured and stored securely

### Improvements
- Enhanced user experience with personalized greetings
- Automatic browser window management for CLI users
- Secure token storage with encryption
- Support for both browser sessions and API keys
- Improved error handling and user feedback

### Technical Changes
- Added `auth-provider.ts` command for provider-specific authentication
- Updated success page to detect terminal-initiated requests
- Implemented cross-window communication for provider selection
- Added Playwright integration for browser automation
- Version bump to 8.0.0 to reflect major feature additions

### Dependencies
- playwright: ^1.40.0 (for browser automation)
- express: ^4.18.0 (for local server communication)
- All existing dependencies maintained