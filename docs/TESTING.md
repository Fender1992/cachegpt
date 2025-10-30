# Testing Guide for CacheGPT

## Overview

CacheGPT uses a comprehensive testing strategy with both unit tests (Vitest) and end-to-end tests (Playwright).

## Test Infrastructure

### Unit Tests (Vitest)
- **Framework**: Vitest v4.0.5
- **Runner**: Fast, modern test runner with TypeScript support
- **Coverage**: V8 coverage reporting
- **Location**: `__tests__/**/*.test.ts`

### E2E Tests (Playwright)
- **Framework**: Playwright
- **Browser**: Chromium (Chrome)
- **Location**: `__tests__/e2e/**/*.spec.ts`

### CI/CD
- **Platform**: GitHub Actions
- **Workflow**: `.github/workflows/test.yml`
- **Triggers**: Push to main/develop, Pull Requests

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### E2E Tests

```bash
# Run E2E tests
npm run test:e2e

# Run with UI (interactive)
npm run test:e2e:ui

# Run in debug mode
npm run test:e2e:debug
```

### All Tests

```bash
# Run unit tests
npm test -- --run

# Run E2E tests
npm run test:e2e

# Build check
npm run build
```

## Test Structure

### Unit Tests

```
__tests__/
├── api/
│   └── upload.test.ts        # File upload API tests
├── lib/
│   ├── cache-lifecycle.test.ts     # Cache management tests (needs mocking)
│   └── response-validator.test.ts  # Response quality tests (needs mocking)
└── sdk/
    └── javascript.test.ts     # SDK tests (needs conversion)
```

### E2E Tests

```
__tests__/
└── e2e/
    └── chat.spec.ts          # Chat functionality tests
```

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('MyFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should do something', () => {
    expect(true).toBe(true)
  })

  it('should handle errors', () => {
    expect(() => {
      throw new Error('test')
    }).toThrow('test')
  })
})
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature', () => {
  test('should work correctly', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/CacheGPT/)
  })
})
```

## Mocking

### Supabase Mocking

```typescript
vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
    auth: { getSession: vi.fn() },
    storage: { from: vi.fn() }
  }))
}))
```

### Environment Variables

Test environment variables are set in `vitest.setup.ts`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`

## Coverage

### Viewing Coverage

```bash
npm run test:coverage
```

Coverage reports are generated in:
- `coverage/` directory
- HTML report: `coverage/index.html`

### Coverage Goals

| Category | Target |
|----------|--------|
| Critical Paths | 80%+ |
| API Routes | 70%+ |
| Utilities | 60%+ |
| Overall | 60%+ |

## CI/CD Pipeline

### GitHub Actions Workflow

The test pipeline runs on:
- Push to `main` or `develop`
- Pull Requests to `main` or `develop`

### Pipeline Steps

1. **Unit Tests**
   - Install dependencies
   - Run Vitest
   - Upload coverage to Codecov

2. **E2E Tests**
   - Install Playwright browsers
   - Run E2E test suite
   - Upload Playwright report

3. **Build Check**
   - Verify application builds successfully
   - Catch TypeScript errors

### Viewing CI Results

- GitHub Actions tab in repository
- Pull Request checks
- Coverage reports in Codecov

## Test Status

### ✅ Working Tests

- `__tests__/api/upload.test.ts` - File upload validation (9 tests)

### ⚠️ Needs Conversion

- `__tests__/api/chat.test.ts` - Old Jest format
- `__tests__/sdk/javascript.test.ts` - Old Jest format

### 🔍 Needs Mocking

- `__tests__/lib/cache-lifecycle.test.ts` - Requires Supabase mocks
- `__tests__/lib/response-validator.test.ts` - Requires implementation

### 📝 Pending E2E Tests

- Authentication flow
- File upload workflow
- Conversation history
- Chat message sending

## Troubleshooting

### Common Issues

#### 1. `supabaseKey is required` Error

**Solution**: Ensure environment variables are set in `vitest.setup.ts`

#### 2. `jest is not defined`

**Solution**: Convert Jest tests to Vitest syntax:
- `jest.fn()` → `vi.fn()`
- `jest.mock()` → `vi.mock()`

#### 3. Playwright browser not installed

**Solution**: Run `npx playwright install chromium`

#### 4. Tests timing out

**Solution**: Increase timeout in test config or use `test.slow()`

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Services**: Don't hit real APIs in tests
3. **Clear Test Names**: Describe what's being tested
4. **Arrange-Act-Assert**: Structure tests clearly
5. **Test Edge Cases**: Not just happy paths
6. **Fast Tests**: Keep unit tests under 100ms
7. **E2E Sparingly**: Only for critical user flows

## Future Improvements

1. **Visual Regression Testing**: Add Percy or similar
2. **Performance Testing**: Add Lighthouse CI
3. **API Contract Testing**: Add Pact or similar
4. **Load Testing**: Add k6 or Artillery
5. **Accessibility Testing**: Add axe-core
6. **Security Testing**: Add OWASP ZAP

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- [GitHub Actions](https://docs.github.com/en/actions)

---

**Last Updated**: October 30, 2025
**Coverage**: 9 passing unit tests
**Status**: ✅ Infrastructure Complete
