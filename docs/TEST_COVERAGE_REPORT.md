# Test Coverage Report

*Version: 12.17.1 | Updated: 2025-12-20*

## Executive Summary

This report documents the testing strategy implemented for CacheGPT, including unit tests, integration tests, and E2E tests with a focus on mobile viewports.

## Current Test Infrastructure

### Frameworks & Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | 4.0.5 | Unit testing |
| Playwright | 1.56.1 | E2E testing |
| @testing-library/react | 16.3.0 | Component testing |
| v8 | - | Coverage reporting |

### Test Directory Structure

```
__tests__/
├── utils/                      # Mock utilities
│   ├── supabase-mock.ts        # Supabase client mocks
│   ├── auth-mock.ts            # Auth session mocks
│   ├── cache-fixtures.ts       # Cache test data
│   └── llm-mock.ts             # LLM provider mocks
├── lib/                        # Unit tests
│   ├── unified-auth-resolver.test.ts
│   └── cache-lifecycle.test.ts
├── api/                        # API tests
│   └── v2/
│       └── unified-chat.test.ts
├── services/                   # Service tests
│   └── llm/
│       └── providerResolver.test.ts
└── e2e/                        # E2E tests
    ├── chat.spec.ts            # Desktop E2E
    └── mobile-chat.spec.ts     # Mobile viewports
```

## Coverage by Module

### Critical Paths (Target: 80%)

| Module | File | Lines | Target | Status |
|--------|------|-------|--------|--------|
| Auth | `lib/unified-auth-resolver.ts` | 421 | 85% | Implemented |
| Cache | `lib/cache-lifecycle.ts` | 413 | 85% | Implemented |
| Cache | `lib/tier-based-cache.ts` | 493 | 80% | Partial |
| API | `app/api/v2/unified-chat/route.ts` | 1310 | 75% | Pending |
| Provider | `services/llm/providerResolver.ts` | 282 | 85% | Pending |

### Test Categories

#### Unit Tests

**Authentication Tests** (`unified-auth-resolver.test.ts`)
- API key extraction and validation
- Bearer token authentication
- Cookie session handling
- Session expiry detection
- Auth priority order
- Error handling

**Cache Tests** (`cache-lifecycle.test.ts`)
- Query type classification
- Context hash generation
- Tier transitions (HOT → WARM → COOL → COLD)
- User feedback recording
- Similarity threshold filtering
- Time-sensitive query detection

#### E2E Tests

**Mobile Chat Tests** (`mobile-chat.spec.ts`)
- Chat trigger visibility
- Modal open/close
- Swipe indicator
- Input touch targets
- Font size (zoom prevention)
- Message input
- Send button
- Viewport rendering
- Dark mode
- Landscape orientation

**Viewport Coverage:**
- iPhone SE (375x667)
- iPhone 13 (390x844)
- Pixel 5 (393x851)
- iPad (768x1024)

## Test Utilities

### Supabase Mock (`supabase-mock.ts`)

```typescript
createMockSupabaseClient()    // Full client mock
mockDatabaseQuery()           // Set up query responses
mockAuthState()               // Configure auth state
```

### Auth Mock (`auth-mock.ts`)

```typescript
createMockSession()           // Standard session
createExpiringSession()       // Session about to expire
createExpiredSession()        // Already expired
createApiKeySession()         // API key auth
createBearerSession()         // JWT auth
generateMockApiKey()          // cgpt_sk_* format
generateMockJwt()             // JWT token
```

### Cache Fixtures (`cache-fixtures.ts`)

```typescript
createMockCachedResponse()    // Standard cache entry
createHotCacheEntry()         // High-access entry
createColdCacheEntry()        // Low-access entry
createStaleCacheEntry()       // Marked for expiration
createMockEmbedding()         // 384-dim vector
```

### LLM Mock (`llm-mock.ts`)

```typescript
createMockLLMResponse()       // Standard response
createMockStreamingResponse() // Chunked stream
createMockAdapter()           // Provider adapter
createMockProviderResolver()  // Resolution logic
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Tests
on: [push, pull_request]

jobs:
  unit-tests:
    - yarn test:coverage
    - Check coverage thresholds

  e2e-tests:
    - Install Playwright
    - yarn test:e2e

  mobile-e2e:
    - Run on Mobile Chrome, Mobile Safari, iPad
```

### Playwright Configuration

```typescript
projects: [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'Mobile Chrome', use: devices['Pixel 5'] },
  { name: 'Mobile Safari', use: devices['iPhone 13'] },
  { name: 'iPad', use: devices['iPad (gen 7)'] },
]
```

## Coverage Thresholds

### Vitest Configuration

```typescript
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 70,
    statements: 80
  }
}
```

## Running Tests

### Unit Tests
```bash
yarn test              # Run all tests
yarn test:coverage     # With coverage report
yarn test:watch        # Watch mode
yarn test:ui           # UI runner
```

### E2E Tests
```bash
yarn test:e2e              # All browsers
yarn test:e2e:ui           # UI mode
npx playwright test --project="Mobile Chrome"
```

## Test Patterns

### Mocking External Services

```typescript
vi.mock('@/lib/supabase-client', () => ({
  supabase: createMockSupabaseClient(),
}))
```

### Testing Auth Flows

```typescript
const request = createBearerRequest(generateMockJwt())
const result = await resolveAuthentication(request)
expect(result).not.toHaveProperty('error')
```

### Testing Cache Operations

```typescript
const entry = createHotCacheEntry()
const tier = determineTier(entry, daysSinceAccess)
expect(tier).toBe('warm')
```

## Next Steps

1. **Complete API Tests** - Chat endpoint coverage
2. **Integration Tests** - Auth + Database flow
3. **Performance Tests** - Response time benchmarks
4. **Visual Regression** - Screenshot comparison
5. **Accessibility Tests** - WCAG compliance
