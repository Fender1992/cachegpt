# Provider Selection Bug Analysis

**Date**: October 22, 2025
**Issue**: API layer incorrectly defaults to Anthropic instead of internal/free LLM providers
**Severity**: HIGH - Cost impact and architectural violation

---

## Executive Summary

The current provider selection logic has **two critical bugs**:

### Bug #1: `/v1/messages` endpoint HARDCODED to Anthropic
- **File**: `app/api/v1/messages/route.ts`
- **Line**: 68-76, 90-102
- **Impact**: ALL requests to `/v1/messages` unconditionally use Anthropic API
- **Root Cause**: Endpoint designed exclusively for Anthropic compatibility
- **Severity**: CRITICAL

### Bug #2: `/v2/unified-chat` fails-open to Anthropic
- **File**: `app/api/v2/unified-chat/route.ts`
- **Lines**: 892-917
- **Impact**: When free providers fail, automatically falls back to Anthropic/OpenAI
- **Root Cause**: Emergency fallback logic at lines 898-917
- **Severity**: HIGH

---

## Current Provider Selection Flow

### `/v1/messages` (Anthropic-only endpoint)

```
Request with x-api-key
    ↓
Validate CacheGPT API key
    ↓
Check ANTHROPIC_API_KEY exists  ← BUG: No internal provider option
    ↓
Call Anthropic API (ALWAYS)
```

**Code**:
```typescript
// Line 69-76
const anthropicApiKey = process.env.ANTHROPIC_API_KEY

if (!anthropicApiKey) {
  return NextResponse.json(
    { error: 'Anthropic API key not configured on server' },
    { status: 500 }
  )
}

// Line 90-102
const anthropic = new Anthropic({ apiKey: anthropicApiKey })
const response = await anthropic.messages.create({ ... })
```

### `/v2/unified-chat` (Multi-provider endpoint)

```
Request
    ↓
Auth resolution (API key / Bearer / Cookie)
    ↓
Check user has provider credentials?
    ├─ YES → Use user's premium provider key
    └─ NO  → Use free providers (Groq, OpenRouter, HuggingFace)
              ↓
              Try free providers (shuffled)
              ↓
              ALL FAILED? ← BUG: Fail-open behavior
              ↓
              Check ANTHROPIC_API_KEY || OPENAI_API_KEY
              ↓
              Call Anthropic/OpenAI as "emergency fallback"
```

**Problematic Code**:
```typescript
// Lines 892-917
if (usingFreeProviders) {
  try {
    result = await callFreeProvider(enrichedMessages);
    finalModel = 'free-model';
  } catch (freeProviderError: any) {
    // ⚠️ BUG: Emergency fallback to premium providers
    if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
      console.log('[EMERGENCY-FALLBACK] Free providers failed, using server premium keys');
      const fallbackProvider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
      const fallbackKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
      const fallbackModel = fallbackProvider === 'anthropic'
        ? 'claude-sonnet-4-5-20250929'
        : 'gpt-5';

      result = await callPremiumProvider(enrichedMessages, fallbackProvider, fallbackKey!, fallbackModel, {
        temperature,
        maxTokens,
        systemPrompt
      });
      finalModel = fallbackModel;
    } else {
      throw freeProviderError;
    }
  }
}
```

---

## Issues Identified

### Issue 1: No Internal/Native LLM Support

**Current State**: System only knows about:
1. Free external providers (Groq, OpenRouter, HuggingFace)
2. Premium external providers (Anthropic, OpenAI, Google, Perplexity)

**Missing**: Internal/native LLM provider that should be:
- First priority for all requests
- Zero cost
- Fully controlled
- No external API dependency

### Issue 2: Presence of `ANTHROPIC_API_KEY` Changes Behavior

**Current Logic**:
```typescript
// If free providers fail AND ANTHROPIC_API_KEY exists → use Anthropic
if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
  // Use Anthropic/OpenAI
}
```

**Problem**: Merely having `ANTHROPIC_API_KEY` in environment causes silent fallback.

**Expected**: `ANTHROPIC_API_KEY` should only be used when explicitly requested.

### Issue 3: No Configuration/Precedence System

**Current**: Hard-coded logic in route handlers
**Missing**:
- `LLM_PROVIDER` environment variable (default provider)
- `INTERNAL_LLM_ENABLED` flag
- `INTERNAL_LLM_URL` endpoint
- `LLM_ALLOW_FALLBACK_TO_ANTHROPIC` explicit flag
- `LLM_HARD_FAIL_ON_INTERNAL_DOWN` flag

### Issue 4: No Provider Abstraction

**Current**: Direct calls to provider APIs mixed in route logic
**Missing**: Adapter pattern with consistent interface

### Issue 5: No Observability

**Missing**:
- Response headers showing which provider was used
- Response headers showing provider selection intent
- Structured logging of provider decisions
- Request ID correlation

---

## Call Sites Using Anthropic

### Direct Anthropic Usage

1. **`app/api/v1/messages/route.ts`**
   - Lines: 8 (import), 69-76 (key check), 90-102 (API call)
   - **100% Anthropic-only endpoint**

2. **`app/api/v2/unified-chat/route.ts`**
   - Lines: 591-592 (env check), 899-912 (emergency fallback)
   - **Conditional Anthropic usage (fail-open)**

3. **`app/api/v2/unified-chat/route.ts` - `callPremiumProvider()`**
   - Lines: 399-420 (Anthropic adapter logic)
   - **Used when user has Anthropic key stored**

### Environment Variable Checks

Search results for `ANTHROPIC_API_KEY`:
```bash
app/api/v1/messages/route.ts:69
app/api/v2/unified-chat/route.ts:592
app/api/v2/unified-chat/route.ts:901
app/api/v2/unified-chat/route.ts:902
```

---

## Required Changes

### 1. Create LLM Configuration (`config/llmConfig.ts`)

```typescript
export const LLM_CONFIG = {
  // Default provider: internal → free → (premium only if explicitly allowed)
  defaultProvider: (process.env.LLM_PROVIDER ?? 'internal') as 'internal' | 'free' | 'anthropic' | 'openai',

  // Internal/native LLM
  internal: {
    enabled: (process.env.INTERNAL_LLM_ENABLED ?? 'true') === 'true',
    baseUrl: process.env.INTERNAL_LLM_URL || 'http://localhost:8080',
    apiKey: process.env.INTERNAL_LLM_API_KEY ?? '', // optional
    model: process.env.INTERNAL_LLM_MODEL ?? 'default',
    healthCheckUrl: process.env.INTERNAL_LLM_HEALTH_URL || 'http://localhost:8080/health',
    healthCheckIntervalMs: 30000, // 30 seconds
  },

  // Free external providers (current)
  free: {
    groq: {
      enabled: !!process.env.GROQ_API_KEY,
      apiKey: process.env.GROQ_API_KEY ?? '',
    },
    openrouter: {
      enabled: !!process.env.OPENROUTER_API_KEY,
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
    },
    huggingface: {
      enabled: !!process.env.HUGGINGFACE_API_KEY,
      apiKey: process.env.HUGGINGFACE_API_KEY ?? '',
    },
  },

  // Premium providers (only use if explicitly requested)
  premium: {
    anthropic: {
      enabled: !!process.env.ANTHROPIC_API_KEY,
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    },
    openai: {
      enabled: !!process.env.OPENAI_API_KEY,
      apiKey: process.env.OPENAI_API_KEY ?? '',
    },
  },

  // Fallback behavior
  allowFallbackToFree: (process.env.LLM_ALLOW_FALLBACK_TO_FREE ?? 'true') === 'true',
  allowFallbackToPremium: (process.env.LLM_ALLOW_FALLBACK_TO_PREMIUM ?? 'false') === 'true',
  hardFailOnInternalDown: (process.env.LLM_HARD_FAIL_ON_INTERNAL_DOWN ?? 'true') === 'true',

  // Per-request override
  allowPerRequestOverride: (process.env.LLM_ALLOW_OVERRIDE ?? 'true') === 'true',
} as const;
```

### 2. Create Provider Resolver (`services/llm/providerResolver.ts`)

**Priority Order**:
1. If `x-llm-provider` header set AND allowed → Use that provider
2. Else if internal enabled AND healthy → Use internal
3. Else if free providers available AND fallback allowed → Use free
4. Else if premium fallback allowed → Use premium
5. Else → 503 Service Unavailable

### 3. Create Adapters

**`services/llm/adapters/InternalAdapter.ts`**: Native internal LLM
**`services/llm/adapters/FreeProvidersAdapter.ts`**: Groq/OpenRouter/HuggingFace
**`services/llm/adapters/AnthropicAdapter.ts`**: Anthropic (explicit only)
**`services/llm/adapters/OpenAIAdapter.ts`**: OpenAI (explicit only)

### 4. Update `/v1/messages` Route

**Current**: Hardcoded Anthropic
**New**: Use provider resolver with header override support

### 5. Update `/v2/unified-chat` Route

**Current**: Emergency fallback to Anthropic
**New**: Use provider resolver, respect hard-fail flag

### 6. Add Response Headers

```typescript
{
  'x-llm-provider-intent': 'internal', // What was requested
  'x-llm-provider-used': 'internal',   // What was actually used
  'x-request-id': generateRequestId(),
}
```

### 7. Add Tests

- Unit tests for provider resolver priority
- Integration tests with mock internal server
- Contract tests for adapter interfaces
- Repro scripts in `tools/repro/`

---

## Migration Path

### Phase 1: Add Configuration (Non-breaking)
- Create `config/llmConfig.ts`
- Add new environment variables to `.env.example`
- **Deploy**: No behavior change yet

### Phase 2: Create Adapters (Non-breaking)
- Implement all adapter classes
- Add unit tests
- **Deploy**: Adapters exist but not used yet

### Phase 3: Update Routes (BREAKING if internal not ready)
- Update `/v2/unified-chat` to use resolver
- Add response headers
- **Deploy**: Requires internal LLM to be running OR set `INTERNAL_LLM_ENABLED=false`

### Phase 4: Fix `/v1/messages` (BREAKING)
- Change from Anthropic-only to resolver-based
- Update documentation
- **Deploy**: Requires coordination with API users

---

## Environment Variables Matrix

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_PROVIDER` | `internal` | Default provider when no override |
| `INTERNAL_LLM_ENABLED` | `true` | Enable/disable internal provider |
| `INTERNAL_LLM_URL` | `http://localhost:8080` | Internal LLM endpoint |
| `INTERNAL_LLM_API_KEY` | (empty) | Optional auth for internal |
| `INTERNAL_LLM_MODEL` | `default` | Model name for internal |
| `INTERNAL_LLM_HEALTH_URL` | `/health` | Health check endpoint |
| `LLM_ALLOW_FALLBACK_TO_FREE` | `true` | Allow fallback to Groq/OpenRouter |
| `LLM_ALLOW_FALLBACK_TO_PREMIUM` | `false` | Allow fallback to Anthropic/OpenAI |
| `LLM_HARD_FAIL_ON_INTERNAL_DOWN` | `true` | Return 503 if internal down (no fallback) |
| `LLM_ALLOW_OVERRIDE` | `true` | Allow `x-llm-provider` header |

### Example Configurations

**Production (internal-first)**:
```bash
LLM_PROVIDER=internal
INTERNAL_LLM_ENABLED=true
INTERNAL_LLM_URL=http://internal-llm:8080
LLM_HARD_FAIL_ON_INTERNAL_DOWN=true
LLM_ALLOW_FALLBACK_TO_PREMIUM=false
```

**Development (free providers)**:
```bash
LLM_PROVIDER=free
INTERNAL_LLM_ENABLED=false
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
LLM_ALLOW_FALLBACK_TO_PREMIUM=false
```

**Anthropic-compatible mode** (for `/v1/messages` users):
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
LLM_ALLOW_OVERRIDE=true
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('ProviderResolver', () => {
  it('selects internal when enabled and healthy', async () => {
    const resolver = new ProviderResolver({ ...config, internal: { enabled: true, healthy: true } });
    const provider = await resolver.resolve({});
    expect(provider.name).toBe('internal');
  });

  it('returns 503 when internal down and hard-fail enabled', async () => {
    const resolver = new ProviderResolver({
      ...config,
      internal: { enabled: true, healthy: false },
      hardFailOnInternalDown: true,
    });
    await expect(resolver.resolve({})).rejects.toThrow('503');
  });

  it('falls back to free when internal down and fallback allowed', async () => {
    const resolver = new ProviderResolver({
      ...config,
      internal: { enabled: true, healthy: false },
      hardFailOnInternalDown: false,
      allowFallbackToFree: true,
    });
    const provider = await resolver.resolve({});
    expect(provider.name).toBe('free');
  });

  it('does NOT use Anthropic when ANTHROPIC_API_KEY present but not requested', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const resolver = new ProviderResolver(config);
    const provider = await resolver.resolve({});
    expect(provider.name).not.toBe('anthropic');
  });

  it('uses Anthropic when x-llm-provider=anthropic header present', async () => {
    const resolver = new ProviderResolver(config);
    const provider = await resolver.resolve({ headers: { 'x-llm-provider': 'anthropic' } });
    expect(provider.name).toBe('anthropic');
  });
});
```

### Integration Tests

```typescript
describe('Internal LLM Integration', () => {
  let mockServer: MockLLMServer;

  beforeEach(() => {
    mockServer = new MockLLMServer({ port: 8080 });
    mockServer.start();
  });

  afterEach(() => {
    mockServer.stop();
  });

  it('routes to internal when healthy', async () => {
    mockServer.setHealthy(true);
    const response = await fetch('http://localhost:3000/api/v2/unified-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
    });
    expect(response.headers.get('x-llm-provider-used')).toBe('internal');
  });

  it('returns 503 when internal down and hard-fail enabled', async () => {
    mockServer.stop();
    const response = await fetch('http://localhost:3000/api/v2/unified-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
    });
    expect(response.status).toBe(503);
  });
});
```

---

## Next Steps

1. ✅ **Analysis Complete** (this document)
2. ⏳ Create `config/llmConfig.ts`
3. ⏳ Create `services/llm/providerResolver.ts`
4. ⏳ Create adapter classes
5. ⏳ Update `/v2/unified-chat` route
6. ⏳ Update `/v1/messages` route
7. ⏳ Add tests
8. ⏳ Add documentation
9. ⏳ Create repro scripts

---

**Document Version**: 1.0
**Last Updated**: October 22, 2025
