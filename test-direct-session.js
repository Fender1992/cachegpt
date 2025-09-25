#!/usr/bin/env node

const fetch = require('node-fetch');

async function testDirectSession() {
  const url = 'http://localhost:3004/api/v2/unified-chat';

  const requestBody = {
    provider: 'claude',
    model: 'claude-opus-4-1-20250805',
    messages: [{ role: 'user', content: 'Test' }],
    authMethod: 'web-session',
    credential: 'sk-ant-sid01-Ck900Bwj5ZCjYrsCG-test-credential',
    directSession: true
  };

  console.log('Sending request to:', url);
  console.log('Request body:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('\nResponse status:', response.status, response.statusText);

    const data = await response.json();
    console.log('Response body:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testDirectSession();