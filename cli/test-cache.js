#!/usr/bin/env node

const chalk = require('chalk');

async function testCache() {
  console.log(chalk.cyan('\n🧪 Testing Cache System\n'));

  // Test with a repeated question
  const testMessage = 'What is the capital of France?';
  const apiUrl = process.env.CACHEGPT_API_URL || 'https://cachegpt.app';

  // You need a valid auth token - get it from ~/.cachegpt/auth.json
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const authPath = path.join(os.homedir(), '.cachegpt', 'auth.json');

  if (!fs.existsSync(authPath)) {
    console.error(chalk.red('❌ Not authenticated. Run: cachegpt login'));
    process.exit(1);
  }

  const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  const token = authData.cachegpt_auth?.value;

  if (!token) {
    console.error(chalk.red('❌ No auth token found. Run: cachegpt login'));
    process.exit(1);
  }

  console.log(chalk.green('✅ Found auth token'));

  // Function to call the API
  async function callAPI(message, attempt) {
    console.log(chalk.yellow(`\n📤 Attempt ${attempt}: "${message}"`));
    const startTime = Date.now();

    try {
      const response = await fetch(`${apiUrl}/api/v2/unified-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'auto',
          messages: [{ role: 'user', content: message }],
          authMethod: 'oauth'
        })
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Request failed: ${response.status}`);
      }

      const data = await response.json();

      console.log(chalk.blue(`📥 Response in ${elapsed}ms:`), data.response.substring(0, 100) + '...');

      if (data.metadata) {
        const meta = data.metadata;
        if (meta.cacheHit) {
          console.log(chalk.green(`⚡ CACHE HIT! Time saved: ${meta.timeSavedMs}ms, Cost saved: $${meta.costSaved}`));
          console.log(chalk.green(`   From tier: ${meta.tier || 'unknown'}, Provider: ${meta.provider}`));
        } else {
          console.log(chalk.gray(`🤖 Fresh response from: ${meta.provider || 'unknown'}`));
          console.log(chalk.gray(`   Response has been cached for future use`));
        }
      } else {
        console.log(chalk.yellow('⚠️  No metadata in response'));
      }

      return { elapsed, cached: data.metadata?.cacheHit || false };
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      return { elapsed: 0, cached: false, error: true };
    }
  }

  // Test the same question 3 times
  console.log(chalk.cyan('\n🔄 Testing cache with repeated question...'));

  const results = [];
  for (let i = 1; i <= 3; i++) {
    const result = await callAPI(testMessage, i);
    results.push(result);

    // Wait a bit between calls
    if (i < 3) {
      console.log(chalk.gray('\n⏳ Waiting 2 seconds...'));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log(chalk.cyan('\n📊 Summary:'));
  results.forEach((result, index) => {
    if (result.error) {
      console.log(chalk.red(`  Attempt ${index + 1}: Failed`));
    } else {
      const status = result.cached ? chalk.green('✅ CACHED') : chalk.yellow('🔸 FRESH');
      console.log(`  Attempt ${index + 1}: ${status} - ${result.elapsed}ms`);
    }
  });

  // Check if cache is working
  const cacheHits = results.filter(r => r.cached).length;
  if (cacheHits >= 1) {
    console.log(chalk.green(`\n✅ Cache is working! ${cacheHits} cache hits out of 3 attempts`));
  } else {
    console.log(chalk.red('\n❌ Cache might not be working properly - no cache hits detected'));
    console.log(chalk.yellow('   Note: First call is always fresh, subsequent calls should hit cache'));
  }
}

// Run the test
testCache().catch(console.error);