#!/usr/bin/env -S npx ts-node

/**
 * Provider Selection Test Suite
 *
 * Tests that internal LLM is the default and Anthropic is NOT used unless explicitly requested.
 *
 * Usage:
 *   export CACHEGPT_URL="http://localhost:3000"
 *   export CACHEGPT_API_KEY="cgpt_sk_..."
 *   npx ts-node test-provider-selection.ts
 */

const BASE_URL = process.env.CACHEGPT_URL || 'http://localhost:3000';
const API_KEY = process.env.CACHEGPT_API_KEY;

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  expectedProvider: string;
  actualProvider: string;
  statusCode: number;
}

const results: TestResult[] = [];

/**
 * Make request and extract provider info
 */
async function testProviderSelection(
  testName: string,
  headers: Record<string, string>,
  expectedProvider: string,
  expectedStatus: number = 200
): Promise<TestResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test: ${testName}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const response = await fetch(`${BASE_URL}/api/v2/unified-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: 'Say "test response" and nothing else.',
          },
        ],
      }),
    });

    const requestId = response.headers.get('x-request-id') || 'unknown';
    const providerIntent = response.headers.get('x-llm-provider-intent') || 'unknown';
    const providerUsed = response.headers.get('x-llm-provider-used') || 'unknown';

    console.log('Status:', response.status);
    console.log('Request ID:', requestId);
    console.log('Provider Intent:', providerIntent);
    console.log('Provider Used:', providerUsed);

    const statusMatch = response.status === expectedStatus;
    const providerMatch = providerUsed === expectedProvider || providerIntent === expectedProvider;

    const passed = statusMatch && (expectedStatus !== 200 || providerMatch);

    const result: TestResult = {
      name: testName,
      passed,
      details: `Status: ${response.status}, Provider: ${providerUsed}`,
      expectedProvider,
      actualProvider: providerUsed,
      statusCode: response.status,
    };

    if (passed) {
      console.log(`✅ PASS: ${testName}`);
    } else {
      console.log(`❌ FAIL: ${testName}`);
      console.log(`   Expected: status=${expectedStatus}, provider=${expectedProvider}`);
      console.log(`   Actual: status=${response.status}, provider=${providerUsed}`);
    }

    return result;
  } catch (error: any) {
    console.error(`❌ ERROR: ${testName}`, error.message);
    return {
      name: testName,
      passed: false,
      details: `Error: ${error.message}`,
      expectedProvider,
      actualProvider: 'error',
      statusCode: 0,
    };
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('Provider Selection Test Suite');
  console.log('==============================');
  console.log('Base URL:', BASE_URL);
  console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 20)}...` : 'NOT SET');
  console.log('');

  // Test 1: Default should be internal (not Anthropic)
  results.push(
    await testProviderSelection(
      'Test 1: Default provider is internal (not Anthropic)',
      API_KEY ? { 'x-api-key': API_KEY } : {},
      'internal'
    )
  );

  // Test 2: Explicit override to Anthropic
  results.push(
    await testProviderSelection(
      'Test 2: Override to Anthropic via header',
      {
        ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        'x-llm-provider': 'anthropic',
      },
      'anthropic'
    )
  );

  // Test 3: Override to free providers
  results.push(
    await testProviderSelection(
      'Test 3: Override to free providers via header',
      {
        ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        'x-llm-provider': 'free',
      },
      'free'
    )
  );

  // Test 4: Invalid provider override should fail
  results.push(
    await testProviderSelection(
      'Test 4: Invalid provider override returns error',
      {
        ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        'x-llm-provider': 'invalid',
      },
      'none',
      503
    )
  );

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
    if (!r.passed) {
      console.log(`   ${r.details}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));

  // Critical assertion
  const defaultTest = results[0];
  if (!defaultTest.passed || defaultTest.actualProvider === 'anthropic') {
    console.log('\n❌ CRITICAL: Default provider is NOT internal!');
    console.log('   This means Anthropic is being used by default, which is the bug.');
    console.log('   Expected: internal');
    console.log('   Actual:', defaultTest.actualProvider);
    process.exit(1);
  }

  if (failed > 0) {
    console.log('\n❌ Some tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Internal LLM is correctly prioritized.');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
