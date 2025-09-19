import chalk from 'chalk';
import { CacheService } from '../lib/cache-service';
import { table } from 'table';

export async function analyticsCommand(): Promise<void> {
  console.log(chalk.cyan('📊 CacheGPT Analytics Dashboard\n'));

  const cacheService = new CacheService();

  try {
    // Get comprehensive stats
    const stats = await cacheService.getCacheStats();
    const recentActivity = await cacheService.getRecentActivity();
    const topQueries = await cacheService.getTopQueries();
    const usagePattern = await cacheService.getUsagePattern();

    // Authentication Status
    console.log(chalk.yellow('🔐 Authentication Status'));
    console.log(`   Status: ${stats.authenticated ? chalk.green('✓ Logged In') : chalk.red('✗ Anonymous')}`);
    if (stats.user_id) {
      console.log(`   User ID: ${chalk.dim(stats.user_id.substring(0, 8))}...`);
    }
    console.log();

    // Cache Overview
    console.log(chalk.yellow('💾 Cache Overview'));
    const overviewData = [
      ['Metric', 'Local', 'Cloud', 'Total'],
      ['Entries', stats.local_entries.toString(), stats.cloud_entries.toString(), stats.total_entries.toString()],
      ['Storage', 'On Device', stats.authenticated ? 'Synced' : 'N/A', ''],
      ['Status', 'Active', stats.authenticated ? 'Connected' : 'Offline', '']
    ];
    console.log(table(overviewData));

    // Recent Activity (last 7 days)
    if (recentActivity && recentActivity.length > 0) {
      console.log(chalk.yellow('📈 Recent Activity (Last 7 Days)'));
      const activityData = [['Date', 'Queries', 'Cache Hits', 'Hit Rate']];
      recentActivity.forEach(day => {
        const hitRate = day.total > 0 ? Math.round((day.hits / day.total) * 100) : 0;
        activityData.push([
          day.date,
          day.total.toString(),
          day.hits.toString(),
          `${hitRate}%`
        ]);
      });
      console.log(table(activityData));
    }

    // Top Queries
    if (topQueries && topQueries.length > 0) {
      console.log(chalk.yellow('🔥 Most Popular Query Types'));
      const queryData = [['Query Preview', 'Count', 'Last Used']];
      topQueries.slice(0, 5).forEach(query => {
        const preview = query.prompt.length > 50
          ? query.prompt.substring(0, 50) + '...'
          : query.prompt;
        queryData.push([
          preview,
          query.count.toString(),
          new Date(query.lastUsed).toLocaleDateString()
        ]);
      });
      console.log(table(queryData));
    }

    // Usage Patterns
    if (usagePattern) {
      console.log(chalk.yellow('⏰ Usage Patterns'));
      console.log(`   Peak Hour: ${usagePattern.peakHour}:00 (${usagePattern.peakCount} queries)`);
      console.log(`   Most Active Day: ${usagePattern.mostActiveDay}`);
      console.log(`   Average Daily Queries: ${usagePattern.avgDailyQueries}`);
      console.log();
    }

    // Performance Insights
    console.log(chalk.yellow('⚡ Performance Insights'));
    const savings = calculateEstimatedSavings(stats.total_entries);
    console.log(`   Estimated Cost Savings: ${chalk.green('$' + savings.cost.toFixed(2))}`);
    console.log(`   Time Saved: ${chalk.green(savings.time + ' minutes')}`);
    console.log(`   Carbon Footprint Reduced: ${chalk.green(savings.carbon + ' kg CO²')}`);
    console.log();

    // Tips and Recommendations
    showRecommendations(stats);

  } catch (error) {
    console.error(chalk.red('❌ Failed to load analytics:'), error);
  }
}

function calculateEstimatedSavings(totalEntries: number) {
  // Rough estimates based on typical API costs and response times
  const avgCostPerQuery = 0.002; // $0.002 per query
  const avgTimePerQuery = 2; // 2 seconds saved per cached response
  const carbonPerQuery = 0.01; // 0.01 kg CO² per query

  return {
    cost: totalEntries * avgCostPerQuery,
    time: Math.round((totalEntries * avgTimePerQuery) / 60), // minutes
    carbon: (totalEntries * carbonPerQuery).toFixed(2)
  };
}

function showRecommendations(stats: any) {
  console.log(chalk.yellow('💡 Recommendations'));

  if (!stats.authenticated) {
    console.log(chalk.cyan('   • Run `cachegpt login` to sync your cache across devices'));
  }

  if (stats.total_entries < 10) {
    console.log(chalk.cyan('   • Use the chat more to build up your cache for better savings'));
  }

  if (stats.local_entries > 100) {
    console.log(chalk.cyan('   • Consider running `cachegpt clean` to remove old cache entries'));
  }

  console.log(chalk.cyan('   • Use `cachegpt templates` to see pre-built prompt templates'));
  console.log(chalk.cyan('   • Export your chat history with `cachegpt export`'));
  console.log();
}