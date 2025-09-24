# CacheGPT Keyless Authentication Flow

## Overview
CacheGPT now features a completely keyless authentication flow for individual users. After signing in with OAuth (Google/GitHub), users simply select their preferred LLM provider and immediately access the chat console. No API keys are ever requested or stored from individual users.

## User Flow

### New Users
1. **OAuth Login** → Sign in with Google or GitHub
2. **Provider Selection** → Choose from ChatGPT, Claude, Gemini, or Perplexity
3. **Chat Console** → Start chatting immediately

### Returning Users
1. **OAuth Login** → Sign in with existing account
2. **Chat Console** → Directly routed to chat (provider already selected)

## Architecture

### Server-Side Credentials
All LLM provider API keys are managed server-side through environment variables:
- `OPENAI_API_KEY` - For ChatGPT
- `ANTHROPIC_API_KEY` - For Claude
- `GOOGLE_AI_API_KEY` - For Gemini
- `PERPLEXITY_API_KEY` - For Perplexity

### Database Schema
User profiles store only the provider selection:
```sql
user_profiles {
  id: uuid
  selected_provider: text  -- 'chatgpt', 'claude', 'gemini', 'perplexity'
  selected_model: text     -- Specific model version
  enterprise_mode: boolean -- Default: false
}
```

### API Flow
1. User sends message to `/api/chat`
2. Server authenticates user session
3. Server retrieves user's selected provider from profile
4. Server uses its own API key for the provider
5. Server forwards response to user

## Model Management

### Automatic Updates
The system automatically uses the latest models for each provider:
- Models are configured in `/config/llm-models.json`
- Daily checks for updates from `/api/model-updates`
- Fallback to local configuration if update service is unavailable

### Current Models (Auto-Updated)
- **ChatGPT**: GPT-4 Turbo (128k context)
- **Claude**: Claude 3 Opus (200k context)
- **Gemini**: Gemini 1.5 Pro (2M context)
- **Perplexity**: Sonar Medium Online (real-time search)

## CLI Integration

### Setup Flow
```bash
cachegpt chat
```
1. Opens browser for OAuth authentication
2. User selects provider in browser
3. Browser redirects back to CLI
4. CLI saves configuration locally
5. Ready to chat

### No API Keys in CLI
The CLI never stores or transmits API keys. All requests go through the authenticated API endpoint using session tokens.

## Enterprise Mode

For organizations that need users to provide their own API keys:

### Enable Enterprise Mode
```env
FEATURE_ENTERPRISE_USER_KEYS=true
```

### Enterprise Flow
1. OAuth login
2. Provider selection
3. API key entry form (only in enterprise mode)
4. Keys stored encrypted in `user_provider_credentials` table
5. Chat uses user's keys instead of server keys

## Security

### No User Keys
- Individual users never see API key screens
- No user API keys are stored in the database
- All LLM calls use server-managed credentials

### Session Security
- All API calls require authenticated session
- Row Level Security (RLS) on all database tables
- Sessions expire after inactivity

### Enterprise Security
- User-provided keys are base64 encoded in database
- Keys are never logged or exposed in responses
- Keys are isolated per user with RLS

## Migration Guide

### From Old Key-Based System
1. Update environment variables with server API keys
2. Run database migration: `supabase migration up`
3. Set `FEATURE_ENTERPRISE_USER_KEYS=false`
4. Deploy new code
5. Users will be prompted to select provider on next login

### Removing Legacy Components
The following components are deprecated and can be removed:
- `/app/auth/provider-setup` - API key entry page
- `/app/auth/key-capture` - Browser extension key capture
- `/api/auth/capture-key` - Key capture API
- `/api/auth/provider-token` - Token storage API

## Configuration

### Environment Variables
```env
# Required: Server-side API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
PERPLEXITY_API_KEY=pplx-...

# Optional: Enterprise mode
FEATURE_ENTERPRISE_USER_KEYS=false  # Set to true for enterprise

# Required: Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
```

### Provider Configuration
Edit `/config/llm-models.json` to customize available models and defaults.

## Troubleshooting

### User stuck on provider selection
- Check if `selected_provider` is null in `user_profiles` table
- Manually update or have user re-select provider

### "No API key configured" error
- Ensure server environment variables are set
- Check logs for which provider is missing keys
- Verify keys are valid and have sufficient quota

### CLI not receiving provider selection
- Ensure `callback_port` parameter is preserved through OAuth flow
- Check browser console for redirect errors
- Verify localhost callback server is running

## Benefits

### For Users
- ✅ No API key management
- ✅ Instant access after OAuth
- ✅ Switch providers without re-entering keys
- ✅ No risk of exposing personal API keys

### For Operators
- ✅ Centralized key management
- ✅ Better cost control and monitoring
- ✅ Simplified user onboarding
- ✅ Reduced support burden

### For Security
- ✅ No user keys to leak
- ✅ Server-side rate limiting
- ✅ Audit trail of all API usage
- ✅ Easy key rotation without user impact