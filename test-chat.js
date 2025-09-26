#!/usr/bin/env node

const readline = require('readline');

// Test configuration
const API_URL = process.env.CACHEGPT_API_URL || 'http://localhost:3005';
const TEST_TOKEN = 'test-bearer-token-123';
const TEST_USER_ID = 'b5d6e8a0-1234-5678-9abc-def012345678'; // Valid UUID for testing

console.log('🧪 Testing CacheGPT Chat System');
console.log(`📍 API URL: ${API_URL}`);
console.log('');

// Simulate CLI chat session
async function testChat() {
  const messages = [];

  // Test questions
  const testQuestions = [
    'What is the capital of France?',
    'What is the capital of France?', // Same question to test cache
    'What is 2 + 2?',
    'exit'
  ];

  let questionIndex = 0;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = () => {
    if (questionIndex >= testQuestions.length) {
      console.log('✅ Test completed');
      process.exit(0);
    }

    const question = testQuestions[questionIndex++];

    // Simulate user typing
    setTimeout(() => {
      console.log(`Test User: ${question}`);

      if (question === 'exit') {
        console.log('👋 Exiting test...');
        rl.close();
        process.exit(0);
      }

      // Add to messages
      messages.push({ role: 'user', content: question });

      // Call API
      callAPI(messages).then(response => {
        if (response) {
          messages.push({ role: 'assistant', content: response.response });

          console.log(`Assistant: ${response.response}`);
          if (response.metadata?.cacheHit) {
            console.log(`   ⚡ From cache (saved ${response.metadata.timeSavedMs}ms)`);
          } else {
            console.log(`   🤖 From ${response.metadata?.provider || 'provider'}`);
            console.log(`   📝 Response should be cached now`);
          }
          console.log('');

          // Ask next question
          askQuestion();
        } else {
          console.error('❌ No response received');
          process.exit(1);
        }
      }).catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
    }, 1000);
  };

  // Start the test
  console.log('Starting automated test...\n');
  askQuestion();
}

async function callAPI(messages) {
  try {
    const response = await fetch(`${API_URL}/api/v2/unified-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        provider: 'auto',
        messages,
        authMethod: 'oauth',
        // Simulate a valid user ID for cache storage
        userId: TEST_USER_ID
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Run the test
testChat();