import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { loadConfig, validateConfig } from '../lib/config';
import { createApiClient } from '../lib/api';
import { logError, logSuccess, formatNumber, formatPercent, formatCost, formatTime } from '../lib/utils';
import { ApiError } from '../types';
import { LocalCache } from '../lib/cache';

interface StatsOptions {
  days: string;
}

export async function statsCommand(options: StatsOptions): Promise<void> {
  const config = loadConfig();

  // Show local cache stats if in browser mode
  if (config && config.mode === 'browser') {
    const cache = new LocalCache(config.cacheLocation);
    const localStats = cache.getStats();
    const entries = cache.export();

    console.log('\n' + chalk.bold('📊 Local Cache Statistics'));
    console.log('═'.repeat(60));

    const localData = [
      [chalk.bold('Metric'), chalk.bold('Value')],
      ['Total Entries', formatNumber(localStats.entries)],
      ['Cache Hits', formatNumber(localStats.totalHits)],
      ['Cache Misses', formatNumber(localStats.totalMisses)],
      ['Hit Rate', chalk.green(formatPercent(localStats.hitRate / 100))],
      ['Exact Matches', formatNumber(localStats.exactHits || 0)],
      ['Semantic Matches', formatNumber(localStats.semanticHits || 0)],
      ['Total Saved', chalk.green(formatCost(localStats.totalSaved))],
      ['Avg Response Time', chalk.cyan(formatTime(localStats.avgResponseTimeMs || 0))]
    ];

    console.log('\n' + table(localData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼'
      }
    }));

    // Show hot cache entries
    const hotEntries = entries
      .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
      .slice(0, 5);

    if (hotEntries.length > 0) {
      console.log('\n' + chalk.bold('🔥 Hot Cache (Top 5 Most Accessed):'));
      const hotData = [
        [chalk.bold('Query'), chalk.bold('Model'), chalk.bold('Hits'), chalk.bold('Last Used')],
        ...hotEntries.map(entry => [
          entry.query.substring(0, 40) + (entry.query.length > 40 ? '...' : ''),
          entry.model,
          formatNumber(entry.accessCount || 0),
          new Date(entry.lastAccessed || entry.timestamp).toLocaleDateString()
        ])
      ];
      console.log(table(hotData));
    }

    // Performance insights
    console.log('\n' + chalk.bold('💡 Performance Insights:'));
    if (localStats.hitRate > 50) {
      console.log(`   ${chalk.green('✅')} Excellent cache performance (${localStats.hitRate.toFixed(1)}% hit rate)`);
      console.log(`   ${chalk.green('⚡')} Hash-based lookups ensuring O(1) exact matches`);
    } else if (localStats.hitRate > 30) {
      console.log(`   ${chalk.yellow('⚠️ ')} Good cache performance (${localStats.hitRate.toFixed(1)}% hit rate)`);
    } else {
      console.log(`   ${chalk.red('❌')} Low cache hit rate (${localStats.hitRate.toFixed(1)}%)`);
      console.log('       Consider using more consistent query patterns');
    }

    if ((localStats.exactHits || 0) > (localStats.semanticHits || 0)) {
      console.log(`   ${chalk.green('🎯')} Exact matches dominating (good for performance)`);
    } else if ((localStats.semanticHits || 0) > 0) {
      console.log(`   ${chalk.blue('🔍')} Semantic search finding similar queries`);
    }

    return;
  }

  // Validate configuration for API mode
  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    logError('Configuration is invalid. Run `cachegpt init` first.');
    validationErrors.forEach(error => console.log(chalk.red('  - ' + error)));
    return;
  }

  const apiClient = createApiClient(config as any);
  const spinner = ora('Fetching cache statistics...').start();

  try {
    const days = parseInt(options.days, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      spinner.fail('Invalid days parameter');
      logError('Days must be a number between 1 and 365');
      return;
    }

    const stats = await apiClient.getStats(days);
    spinner.succeed(`Statistics retrieved for the last ${days} days`);

    console.log('\n' + chalk.bold('📊 Cache Statistics'));
    console.log('═'.repeat(60));

    // Summary statistics
    const summaryData = [
      [chalk.bold('Metric'), chalk.bold('Value')],
      ['Total Requests', formatNumber(stats.totalRequests)],
      ['Cache Hits', formatNumber(stats.cacheHits)],
      ['Cache Hit Rate', chalk.green(formatPercent(stats.cacheHitRate))],
      ['Cost Saved', chalk.green(formatCost(stats.costSaved))],
      ['Avg Response Time (Cache Hit)', chalk.cyan(formatTime(stats.avgCacheResponseTime))],
      ['Avg Response Time (Cache Miss)', chalk.cyan(formatTime(stats.avgMissResponseTime))]
    ];

    console.log('\n' + table(summaryData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼'
      }
    }));

    // Performance insights
    if (stats.totalRequests > 0) {
      console.log(chalk.bold('💡 Performance Insights:'));

      if (stats.cacheHitRate > 0.5) {
        console.log(`   ${chalk.green('✅')} Excellent cache hit rate (${formatPercent(stats.cacheHitRate)})`);
      } else if (stats.cacheHitRate > 0.3) {
        console.log(`   ${chalk.yellow('⚠️ ')} Good cache hit rate (${formatPercent(stats.cacheHitRate)})`);
      } else {
        console.log(`   ${chalk.red('❌')} Low cache hit rate (${formatPercent(stats.cacheHitRate)})`);
        console.log('       Consider adjusting similarity thresholds or query patterns');
      }

      if (stats.avgCacheResponseTime && stats.avgMissResponseTime) {
        const speedup = ((stats.avgMissResponseTime - stats.avgCacheResponseTime) / stats.avgMissResponseTime) * 100;
        if (speedup > 50) {
          console.log(`   ${chalk.green('🚀')} Cache provides ${speedup.toFixed(0)}% speed improvement`);
        }
      }

      if (stats.costSaved > 0) {
        const estimatedTotalCost = stats.costSaved / stats.cacheHitRate;
        console.log(`   ${chalk.green('💰')} Estimated total cost without cache: ${formatCost(estimatedTotalCost)}`);
      }
    }

    // Top models
    if (stats.topModels && stats.topModels.length > 0) {
      console.log('\n' + chalk.bold('🤖 Top Models by Usage:'));
      const modelData = [
        [chalk.bold('Model'), chalk.bold('Requests'), chalk.bold('Cache Hit Rate')],
        ...stats.topModels.map(model => [
          model.name,
          formatNumber(model.requests),
          formatPercent(model.hitRate)
        ])
      ];
      console.log(table(modelData));
    }

    // Daily performance
    if (stats.dailyStats && stats.dailyStats.length > 0) {
      console.log('\n' + chalk.bold('📅 Daily Performance:'));
      const dailyData = [
        [chalk.bold('Date'), chalk.bold('Requests'), chalk.bold('Cache Hits'), chalk.bold('Hit Rate')],
        ...stats.dailyStats.map(day => [
          day.date,
          formatNumber(day.requests),
          formatNumber(day.cacheHits),
          formatPercent(day.hitRate)
        ])
      ];
      console.log(table(dailyData));
    }

    // Show recommendations
    if (stats.totalRequests > 100) {
      console.log('\n' + chalk.bold('📝 Recommendations:'));

      if (stats.cacheHitRate < 0.3) {
        console.log(`   ${chalk.yellow('•')} Consider lowering similarity threshold to increase cache hits`);
        console.log(`   ${chalk.yellow('•')} Review query patterns - similar queries should benefit from caching`);
      }

      if (stats.totalRequests < 1000 && days >= 7) {
        console.log(`   ${chalk.blue('•')} Usage is still low - cache benefits will increase with more traffic`);
      }

      if (stats.costSaved < 1 && stats.totalRequests > 500) {
        console.log(`   ${chalk.yellow('•')} Cost savings are low - verify model pricing configuration`);
      }
    } else {
      console.log(`\n${chalk.blue('ℹ️ ')} Not enough data for detailed analysis. Make more requests to see trends.`);
    }

    logSuccess('Statistics display completed');

  } catch (error: any) {
    spinner.fail('Failed to fetch statistics');

    const apiError = error as ApiError;
    if (apiError.error && apiError.message) {
      logError(apiError.error + ': ' + apiError.message);
    } else {
      logError('Network or unexpected error:', error.message || error);
    }

    // Suggest troubleshooting
    console.log(chalk.blue('\n🔧 Troubleshooting:'));
    console.log('   1. Verify your API key has admin permissions');
    console.log('   2. Check that the stats endpoint is enabled on your server');
    console.log('   3. Ensure you have made some requests to generate statistics');
  }
}