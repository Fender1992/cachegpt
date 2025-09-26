#!/usr/bin/env node

// E2E Test: Use existing authentication system
// Test with the anonymous chat functionality that doesn't require user creation

const fetch = require('node-fetch');

const SERVER_URL = 'http://localhost:3006';

async function testExistingUserChat() {
  console.log('🧪 E2E Test: Anonymous Chat (Phase 1 Alternative)');
  console.log('====================================================\n');

  try {
    // Test anonymous chat functionality
    console.log('🔄 Testing anonymous chat endpoint...');

    const chatResponse = await fetch(`${SERVER_URL}/api/v2/unified-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'E2E: hello from anonymous user test' }
        ],
        provider: 'mixed',
        model: 'free-model'
      })
    });

    if (!chatResponse.ok) {
      throw new Error(`Chat API returned ${chatResponse.status}: ${await chatResponse.text()}`);
    }

    const chatData = await chatResponse.json();
    console.log('✅ Anonymous chat successful!');
    console.log(`📝 Response: ${chatData.response?.substring(0, 100)}...`);
    console.log(`💾 Cached: ${chatData.metadata?.cached}`);
    console.log(`🏷️  Provider: ${chatData.metadata?.provider}`);

    // Store test results
    const fs = require('fs');
    const path = require('path');
    const artifactsDir = path.join(__dirname, 'e2e_artifacts');

    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    const testData = {
      testType: 'anonymous_chat',
      timestamp: new Date().toISOString(),
      request: {
        message: 'E2E: hello from anonymous user test',
        provider: 'mixed',
        model: 'free-model'
      },
      response: chatData,
      status: 'success'
    };

    fs.writeFileSync(
      path.join(artifactsDir, 'phase1_anonymous_test.json'),
      JSON.stringify(testData, null, 2)
    );

    console.log('\n💾 Test results saved to e2e_artifacts/phase1_anonymous_test.json');
    return testData;

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    // Save error details
    const fs = require('fs');
    const path = require('path');
    const artifactsDir = path.join(__dirname, 'e2e_artifacts');

    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    const errorData = {
      testType: 'anonymous_chat',
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: error.message
    };

    fs.writeFileSync(
      path.join(artifactsDir, 'phase1_error.json'),
      JSON.stringify(errorData, null, 2)
    );

    throw error;
  }
}

// Run test if called directly
if (require.main === module) {
  testExistingUserChat()
    .then((testData) => {
      console.log('\n🎉 Phase 1 Alternative Test: PASS');
      console.log('Anonymous chat functionality verified');
    })
    .catch((error) => {
      console.error('\n💥 Phase 1 Alternative Test: FAIL');
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = { testExistingUserChat };