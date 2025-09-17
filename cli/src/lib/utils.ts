import chalk from 'chalk';

export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function logError(message: string, error?: any): void {
  console.error(chalk.red('❌ ' + message));
  if (error && error.message) {
    console.error(chalk.red('   ' + error.message));
  }
}

export function logSuccess(message: string): void {
  console.log(chalk.green('✅ ' + message));
}

export function logInfo(message: string): void {
  console.log(chalk.blue('ℹ️  ' + message));
}

export function logWarning(message: string): void {
  console.log(chalk.yellow('⚠️  ' + message));
}

export function truncateString(str: string, length: number): string {
  if (str.length <= length) {
    return str;
  }
  return str.substring(0, length) + '...';
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}