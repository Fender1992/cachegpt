import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, validateConfig } from '../lib/config';
import { createApiClient } from '../lib/api';
import { logError, logSuccess, logInfo, formatTime, formatPercent, truncateString } from '../lib/utils';
import { ChatCompletionRequest, ApiError } from '../types';

interface TestOptions {
  model: string;
  query: string;
}

export async function testCommand(options: TestOptions): Promise<void> {
  const config = loadConfig();

  // Validate configuration
  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    logError('Configuration is invalid. Run `cachegpt init` first.');
    validationErrors.forEach(error => console.log(chalk.red('  - ' + error)));
    return;
  }

  const apiClient = createApiClient(config as any);
  const spinner = ora('Testing LLM Cache API...').start();

  try {
    // Test 1: Health check
    spinner.text = 'Checking API health...';
    const health = await apiClient.healthCheck();

    if (health.status !== 'healthy') {
      spinner.fail('API health check failed');
      logError('API is not healthy:', health);
      return;
    }

    spinner.succeed('API health check passed');
    logInfo(`Environment: ${health.environment || 'unknown'}`);
    logInfo(`Database: ${health.database || 'unknown'}\n`);

    // Test 2: First request (should miss cache)
    spinner.start('Making first request (cache miss expected)...');

    const testRequest: ChatCompletionRequest = {
      messages: [{ role: 'user', content: options.query }],
      model: options.model
    };

    const startTime1 = Date.now();
    const firstResponse = await apiClient.chatCompletion(testRequest);
    const endTime1 = Date.now();
    const firstTime = endTime1 - startTime1;

    const firstResult = firstResponse.data;

    spinner.succeed(`First request completed in ${formatTime(firstTime)}`);

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 100));

    // Test 3: Second request (should hit cache)
    spinner.start('Making second request (cache hit expected)...');

    const startTime2 = Date.now();
    const secondResponse = await apiClient.chatCompletion(testRequest);
    const endTime2 = Date.now();
    const secondTime = endTime2 - startTime2;

    const secondResult = secondResponse.data;

    spinner.succeed(`Second request completed in ${formatTime(secondTime)}`);

    // Display results
    console.log('\n' + chalk.bold('🧪 Test Results:'));
    console.log('═'.repeat(60));

    console.log(chalk.blue('\n📊 First Request (Cache Miss Expected):'));
    console.log(`   Response Time: ${chalk.cyan(formatTime(firstTime))}`);
    console.log(`   Cached: ${firstResult.cached ? chalk.green('Yes') : chalk.red('No')}`);
    if (firstResult.cache_type) {
      console.log(`   Cache Type: ${chalk.yellow(firstResult.cache_type)}`);
    }
    console.log(`   Model: ${chalk.white(options.model)}`);
    console.log(`   Response: ${chalk.gray(truncateString(firstResult.choices[0].message.content, 100))}`);

    console.log(chalk.blue('\n📊 Second Request (Cache Hit Expected):'));
    console.log(`   Response Time: ${chalk.cyan(formatTime(secondTime))}`);
    console.log(`   Cached: ${secondResult.cached ? chalk.green('Yes') : chalk.red('No')}`);
    if (secondResult.cache_type) {
      console.log(`   Cache Type: ${chalk.yellow(secondResult.cache_type)}`);
    }
    if (secondResult.similarity) {
      console.log(`   Similarity: ${chalk.magenta(formatPercent(secondResult.similarity))}`);
    }

    // Performance analysis
    console.log(chalk.blue('\n⚡ Performance Analysis:'));
    if (secondResult.cached && secondTime < firstTime) {
      const improvement = ((firstTime - secondTime) / firstTime) * 100;
      console.log(`   Speed Improvement: ${chalk.green('+' + improvement.toFixed(1) + '%')}`);
      console.log(`   Time Saved: ${chalk.green(formatTime(firstTime - secondTime))}`);
    } else if (!secondResult.cached) {
      console.log(`   ${chalk.yellow('⚠️  Cache miss - this is unexpected for identical requests')}`);
    } else {
      console.log(`   Cache hit but no significant speed improvement`);
    }

    // Usage information
    if (firstResult.usage) {
      console.log(chalk.blue('\n💰 Usage Information:'));
      console.log(`   Tokens Used (First): ${chalk.white(firstResult.usage.total_tokens.toString())}`);
      if (secondResult.cached) {
        console.log(`   Tokens Saved (Second): ${chalk.green(firstResult.usage.total_tokens.toString())}`);
      }
    }

    // Test result summary
    console.log(chalk.blue('\n📋 Test Summary:'));
    if (secondResult.cached) {
      console.log(`   ${chalk.green('✅ Cache system is working correctly')}`);
      console.log(`   ${chalk.green('✅ Identical requests are being cached')}`);
      if (secondTime < firstTime) {
        console.log(`   ${chalk.green('✅ Cache provides performance improvement')}`);
      }
    } else {
      console.log(`   ${chalk.red('❌ Cache system may not be working correctly')}`);
      console.log(`   ${chalk.yellow('ℹ️  Identical requests should result in cache hits')}`);
    }

    logSuccess('Test completed successfully!');

  } catch (error: any) {
    spinner.fail('Test failed');

    const apiError = error as ApiError;
    if (apiError.error && apiError.message) {
      logError(apiError.error + ': ' + apiError.message);
      if (apiError.detail && typeof apiError.detail === 'object') {
        console.log(chalk.red('Details:'), JSON.stringify(apiError.detail, null, 2));
      }
    } else {
      logError('Network or unexpected error:', error.message || error);
    }

    // Suggest troubleshooting steps
    console.log(chalk.blue('\n🔧 Troubleshooting:'));
    console.log('   1. Verify your base URL is correct and the server is running');
    console.log('   2. Check that your API key is valid and active');
    console.log('   3. Ensure the LLM Cache Proxy is properly configured');
    console.log('   4. Run `cachegpt config --show` to verify your settings');
  }
}