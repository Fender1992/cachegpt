#!/usr/bin/env node

/**
 * CacheGPT API Key Authentication Test Suite
 *
 * Tests all authentication scenarios for /v1/messages endpoint:
 * - Valid API key
 * - Missing header
 * - Wrong header name
 * - Invalid key format
 * - Expired key (if test key exists)
 */

const BASE_URL = process.env.CACHEGPT_URL || 'http://localhost:3000';
const API_KEY = process.env.CACHEGPT_API_KEY;

// Test request body (Anthropic Messages API format)
const testBody = {
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 100,
  messages: [
    {
      role: 'user',
      content: 'Say "Hello, CacheGPT API test!" and nothing else.'
    }
  ]
};

/**
 * Make HTTP request with detailed logging
 */
async function makeRequest(testName, headers, body = testBody, method = 'POST') {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test: ${testName}`);
  console.log(`${'='.repeat(60)}`);
  console.log('Method:', method);
  console.log('URL:', `${BASE_URL}/api/v1/messages`);
  console.log('Headers:', JSON.stringify(headers, null, 2));

  try {
    const response = await fetch(`${BASE_URL}/api/v1/messages`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    console.log('Status:', response.status, response.statusText);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response Body:', JSON.stringify(data, null, 2));

    return { response, data };
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    throw error;
  }
}

/**
 * Test 1: Valid API Key
 */
async function testValidKey() {
  if (!API_KEY) {
    console.log('\n❌ Skipped: CACHEGPT_API_KEY not set');
    return;
  }

  const { response, data } = await makeRequest(
    '✅ Valid API Key',
    { 'x-api-key': API_KEY }
  );

  if (response.status === 200) {
    console.log('\n✅ PASS: Valid key accepted');
    console.log('   Response preview:', data.content?.[0]?.text?.substring(0, 50) || 'N/A');
    return true;
  } else {
    console.log('\n❌ FAIL: Expected 200, got', response.status);
    console.log('   Error:', data.error || data);
    return false;
  }
}

/**
 * Test 2: Missing Header
 */
async function testMissingHeader() {
  const { response, data } = await makeRequest(
    '❌ Missing x-api-key Header',
    {} // No auth header
  );

  if (response.status === 401) {
    console.log('\n✅ PASS: Correctly rejected missing header');
    console.log('   Error message:', data.error);
    return true;
  } else {
    console.log('\n❌ FAIL: Expected 401, got', response.status);
    return false;
  }
}

/**
 * Test 3: Wrong Header Name (Authorization instead of x-api-key)
 */
async function testWrongHeaderName() {
  if (!API_KEY) {
    console.log('\n❌ Skipped: CACHEGPT_API_KEY not set');
    return;
  }

  const { response, data } = await makeRequest(
    '❌ Wrong Header Name (Authorization instead of x-api-key)',
    { 'Authorization': `Bearer ${API_KEY}` } // Wrong header name
  );

  if (response.status === 401) {
    console.log('\n✅ PASS: Correctly rejected wrong header name');
    console.log('   Error message:', data.error);
    return true;
  } else {
    console.log('\n❌ FAIL: Expected 401, got', response.status);
    return false;
  }
}

/**
 * Test 4: Invalid Key Format
 */
async function testInvalidFormat() {
  const { response, data } = await makeRequest(
    '❌ Invalid Key Format (missing cgpt_sk_ prefix)',
    { 'x-api-key': 'sk-invalid-key-format' }
  );

  if (response.status === 401) {
    console.log('\n✅ PASS: Correctly rejected invalid format');
    console.log('   Error message:', data.error);
    return true;
  } else {
    console.log('\n❌ FAIL: Expected 401, got', response.status);
    return false;
  }
}

/**
 * Test 5: Non-existent Key
 */
async function testNonExistentKey() {
  // Generate a valid-format but non-existent key
  const fakeKey = 'cgpt_sk_' + '0'.repeat(64);

  const { response, data } = await makeRequest(
    '❌ Non-existent Key (valid format but not in database)',
    { 'x-api-key': fakeKey }
  );

  if (response.status === 401) {
    console.log('\n✅ PASS: Correctly rejected non-existent key');
    console.log('   Error message:', data.error);
    return true;
  } else {
    console.log('\n❌ FAIL: Expected 401, got', response.status);
    return false;
  }
}

/**
 * Test 6: CORS Preflight
 */
async function testCORSPreflight() {
  const { response } = await makeRequest(
    '✅ CORS Preflight (OPTIONS)',
    {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-api-key'
    },
    undefined,
    'OPTIONS'
  );

  const allowOrigin = response.headers.get('access-control-allow-origin');
  const allowMethods = response.headers.get('access-control-allow-methods');
  const allowHeaders = response.headers.get('access-control-allow-headers');

  if (response.status === 200 && allowOrigin && allowMethods && allowHeaders) {
    console.log('\n✅ PASS: CORS preflight successful');
    console.log('   Allow-Origin:', allowOrigin);
    console.log('   Allow-Methods:', allowMethods);
    console.log('   Allow-Headers:', allowHeaders);

    // Check if x-api-key is in allowed headers
    if (allowHeaders.toLowerCase().includes('x-api-key')) {
      console.log('   ✅ x-api-key is in allowed headers');
      return true;
    } else {
      console.log('   ❌ x-api-key is NOT in allowed headers');
      return false;
    }
  } else {
    console.log('\n❌ FAIL: CORS preflight failed');
    console.log('   Status:', response.status);
    return false;
  }
}

/**
 * Test 7: Request ID Correlation
 */
async function testRequestIDCorrelation() {
  if (!API_KEY) {
    console.log('\n❌ Skipped: CACHEGPT_API_KEY not set');
    return;
  }

  const customRequestId = `test-${Date.now()}`;
  const { response } = await makeRequest(
    '✅ Request ID Correlation',
    {
      'x-api-key': API_KEY,
      'x-request-id': customRequestId
    }
  );

  const returnedRequestId = response.headers.get('x-request-id');

  if (returnedRequestId) {
    console.log('\n✅ PASS: Request ID correlation supported');
    console.log('   Sent:', customRequestId);
    console.log('   Returned:', returnedRequestId);
    return true;
  } else {
    console.log('\n⚠️  WARN: Request ID not returned (optional feature)');
    return true; // Not a failure
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('CacheGPT API Key Authentication Test Suite');
  console.log('==========================================');
  console.log('Base URL:', BASE_URL);
  console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 20)}...` : 'NOT SET');

  const results = [];

  // Run tests sequentially
  results.push({ name: 'Missing Header', passed: await testMissingHeader() });
  results.push({ name: 'Invalid Format', passed: await testInvalidFormat() });
  results.push({ name: 'Non-existent Key', passed: await testNonExistentKey() });
  results.push({ name: 'Wrong Header Name', passed: await testWrongHeaderName() });
  results.push({ name: 'Valid API Key', passed: await testValidKey() });
  results.push({ name: 'CORS Preflight', passed: await testCORSPreflight() });
  results.push({ name: 'Request ID', passed: await testRequestIDCorrelation() });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\n❌ Some tests failed. Review the output above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
