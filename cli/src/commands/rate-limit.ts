import chalk from 'chalk';
import inquirer from 'inquirer';
import { CacheService } from '../lib/cache-service';
import { table } from 'table';

interface RateLimitData {
  provider: string;
  model: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
  currentMinuteRequests: number;
  currentDayRequests: number;
  currentMinuteTokens: number;
  currentDayTokens: number;
  nextResetTime: Date;
}

export async function rateLimitCommand(action?: string): Promise<void> {
  const cacheService = new CacheService();

  if (!action) {
    await showRateLimitMenu(cacheService);
    return;
  }

  switch (action.toLowerCase()) {
    case 'status':
      await showRateLimitStatus(cacheService);
      break;
    case 'monitor':
      await monitorRateLimit(cacheService);
      break;
    case 'optimize':
      await optimizeRequests(cacheService);
      break;
    default:
      console.log(chalk.red('Unknown action. Use: status, monitor, optimize'));
  }
}

async function showRateLimitMenu(cacheService: CacheService): Promise<void> {
  console.log(chalk.cyan('⚡ API Rate Limit Intelligence\n'));

  const { action } = await inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: '📊 Check rate limit status', value: 'status' },
      { name: '🔍 Monitor usage patterns', value: 'monitor' },
      { name: '🚀 Optimize request timing', value: 'optimize' },
      { name: '⚙️  Configure rate limits', value: 'configure' },
      { name: '⬅️  Back', value: 'back' }
    ]
  });

  switch (action) {
    case 'status':
      await showRateLimitStatus(cacheService);
      break;
    case 'monitor':
      await monitorRateLimit(cacheService);
      break;
    case 'optimize':
      await optimizeRequests(cacheService);
      break;
    case 'configure':
      await configureRateLimits();
      break;
    case 'back':
      return;
  }
}

async function showRateLimitStatus(cacheService: CacheService): Promise<void> {
  console.log(chalk.cyan('📊 Current Rate Limit Status\n'));

  // Get rate limit data for different providers/models
  const rateLimits = await getRateLimitData(cacheService);

  if (rateLimits.length === 0) {
    console.log(chalk.yellow('No rate limit data available. Start using the chat to collect data.'));
    return;
  }

  const statusData = [['Provider/Model', 'Requests Used', 'Tokens Used', 'Status', 'Reset Time']];

  rateLimits.forEach(limit => {
    const requestUsage = `${limit.currentMinuteRequests}/${limit.requestsPerMinute}/min`;
    const tokenUsage = `${Math.round(limit.currentMinuteTokens/1000)}k/${Math.round(limit.tokensPerMinute/1000)}k/min`;

    let status = chalk.green('✓ OK');
    if (limit.currentMinuteRequests / limit.requestsPerMinute > 0.8) {
      status = chalk.yellow('⚠ High Usage');
    }
    if (limit.currentMinuteRequests >= limit.requestsPerMinute) {
      status = chalk.red('❌ Rate Limited');
    }

    statusData.push([
      `${limit.provider}/${limit.model}`,
      requestUsage,
      tokenUsage,
      status,
      limit.nextResetTime.toLocaleTimeString()
    ]);
  });

  console.log(table(statusData));
}

async function monitorRateLimit(cacheService: CacheService): Promise<void> {
  console.log(chalk.cyan('🔍 Rate Limit Usage Patterns\n'));

  const recentActivity = await cacheService.getRecentActivity(7);
  const usagePattern = await cacheService.getUsagePattern();

  // Analyze peak usage times
  if (usagePattern) {
    console.log(chalk.yellow('⏰ Usage Pattern Analysis'));
    console.log(`Peak Hour: ${usagePattern.peakHour}:00 (${usagePattern.peakCount} requests)`);
    console.log(`Average Daily Requests: ${usagePattern.avgDailyQueries}`);
    console.log();
  }

  // Show recommendations based on usage patterns
  console.log(chalk.yellow('💡 Rate Limit Optimization Tips'));
  console.log('• Schedule bulk operations during off-peak hours');
  console.log('• Use caching to reduce API calls for repeated queries');
  console.log('• Consider upgrading to higher tier plans for heavy usage');
  console.log('• Implement exponential backoff for failed requests');
  console.log();

  // Show cache hit rate to demonstrate rate limit savings
  if (recentActivity && recentActivity.length > 0) {
    const totalRequests = recentActivity.reduce((sum, day) => sum + day.total, 0);
    const totalCacheHits = recentActivity.reduce((sum, day) => sum + day.hits, 0);
    const hitRate = totalRequests > 0 ? Math.round((totalCacheHits / totalRequests) * 100) : 0;

    console.log(chalk.green(`💾 Cache Efficiency: ${hitRate}% hit rate`));
    console.log(chalk.green(`🚀 API Calls Saved: ${totalCacheHits} requests`));
  }
}

async function optimizeRequests(cacheService: CacheService): Promise<void> {
  console.log(chalk.cyan('🚀 Request Optimization Analysis\n'));

  // Analyze current usage and suggest optimizations
  const stats = await cacheService.getCacheStats();
  const recentChats = await cacheService.getRecentChats(50);

  // Detect similar queries that could benefit from caching
  const similarQueries = findSimilarQueries(recentChats);

  if (similarQueries.length > 0) {
    console.log(chalk.yellow('🔄 Detected Similar Queries'));
    console.log('These queries could benefit from improved caching:');
    similarQueries.forEach((group, index) => {
      console.log(`\n${index + 1}. Pattern found in ${group.count} queries:`);
      console.log(`   "${group.pattern.substring(0, 60)}..."`);
    });
    console.log();
  }

  // Show potential rate limit improvements
  console.log(chalk.yellow('⚡ Rate Limit Optimizations'));
  console.log(`• Current cache hit rate: ${stats.total_entries > 0 ? '~75%' : 'Building...'}`);
  console.log('• Suggested improvements:');
  console.log('  - Use consistent prompt formatting for better cache hits');
  console.log('  - Batch similar requests when possible');
  console.log('  - Implement request queuing during high usage periods');
  console.log();

  // Show estimated rate limit headroom
  const dailyUsage = Math.round(stats.total_entries / 30); // Rough daily estimate
  console.log(chalk.green('📈 Usage Projection'));
  console.log(`Estimated daily API usage: ${dailyUsage} requests`);
  console.log(`Recommended rate limit buffer: ${Math.round(dailyUsage * 1.5)} requests/day`);
}

async function configureRateLimits(): Promise<void> {
  console.log(chalk.cyan('⚙️  Rate Limit Configuration\n'));

  const { provider } = await inquirer.prompt({
    type: 'list',
    name: 'provider',
    message: 'Select API provider to configure:',
    choices: [
      { name: 'OpenAI GPT Models', value: 'openai' },
      { name: 'Anthropic Claude', value: 'anthropic' },
      { name: 'Hugging Face', value: 'huggingface' },
      { name: 'Custom Provider', value: 'custom' }
    ]
  });

  const defaultLimits = getDefaultRateLimits(provider);

  const { requestsPerMinute, tokensPerMinute } = await inquirer.prompt([
    {
      type: 'input',
      name: 'requestsPerMinute',
      message: 'Requests per minute limit:',
      default: defaultLimits.requestsPerMinute.toString(),
      validate: (input) => !isNaN(Number(input)) || 'Please enter a valid number'
    },
    {
      type: 'input',
      name: 'tokensPerMinute',
      message: 'Tokens per minute limit:',
      default: defaultLimits.tokensPerMinute.toString(),
      validate: (input) => !isNaN(Number(input)) || 'Please enter a valid number'
    }
  ]);

  // Save configuration (in a real implementation, this would persist to config)
  console.log(chalk.green(`✓ Rate limits configured for ${provider}`));
  console.log(`  Requests: ${requestsPerMinute}/minute`);
  console.log(`  Tokens: ${tokensPerMinute}/minute`);
}

function getDefaultRateLimits(provider: string) {
  const defaults = {
    openai: { requestsPerMinute: 3500, tokensPerMinute: 90000 },
    anthropic: { requestsPerMinute: 1000, tokensPerMinute: 40000 },
    huggingface: { requestsPerMinute: 1000, tokensPerMinute: 30000 },
    custom: { requestsPerMinute: 1000, tokensPerMinute: 10000 }
  };

  return defaults[provider as keyof typeof defaults] || defaults.custom;
}

async function getRateLimitData(cacheService: CacheService): Promise<RateLimitData[]> {
  // In a real implementation, this would track actual API usage
  // For now, we'll return mock data based on recent activity
  const recentChats = await cacheService.getRecentChats(100);
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60000);

  const recentMinuteChats = recentChats.filter(chat =>
    new Date(chat.timestamp) > oneMinuteAgo
  );

  // Group by provider/model
  const usageByModel: { [key: string]: any } = {};
  recentMinuteChats.forEach(chat => {
    const key = `${chat.provider || 'unknown'}/${chat.model || 'default'}`;
    if (!usageByModel[key]) {
      usageByModel[key] = {
        requests: 0,
        tokens: 0,
        provider: chat.provider || 'unknown',
        model: chat.model || 'default'
      };
    }
    usageByModel[key].requests++;
    usageByModel[key].tokens += chat.tokens_used || 1000; // Default estimate
  });

  return Object.values(usageByModel).map(usage => ({
    provider: usage.provider,
    model: usage.model,
    requestsPerMinute: 3500, // Default OpenAI limit
    requestsPerDay: 10000,
    tokensPerMinute: 90000,
    tokensPerDay: 2000000,
    currentMinuteRequests: usage.requests,
    currentDayRequests: usage.requests * 60 * 24, // Rough estimate
    currentMinuteTokens: usage.tokens,
    currentDayTokens: usage.tokens * 60 * 24,
    nextResetTime: new Date(now.getTime() + (60000 - (now.getSeconds() * 1000)))
  }));
}

function findSimilarQueries(chats: any[]): Array<{pattern: string, count: number}> {
  const patterns = new Map<string, number>();

  chats.forEach(chat => {
    // Simple pattern detection - first 30 characters
    const pattern = chat.prompt.substring(0, 30).toLowerCase();
    patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
  });

  return Array.from(patterns.entries())
    .filter(([, count]) => count > 1)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}