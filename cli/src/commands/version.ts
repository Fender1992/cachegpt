import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Get local version from package.json
function getLocalVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    return 'unknown';
  }
}

// Get latest version from npm
async function getLatestVersion(): Promise<string> {
  try {
    const { stdout } = await execAsync('npm view cachegpt-cli version');
    return stdout.trim();
  } catch (error) {
    return 'unknown';
  }
}

// Compare version strings
function compareVersions(v1: string, v2: string): number {
  if (v1 === 'unknown' || v2 === 'unknown') return 0;

  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }

  return 0;
}

export async function versionCommand(): Promise<void> {
  console.log(chalk.cyan.bold('\n📦 CacheGPT CLI Version Information\n'));

  const localVersion = getLocalVersion();
  console.log(chalk.white('Current Installation:'));
  console.log(chalk.green(`  📋 Installed Version: v${localVersion}`));

  console.log(chalk.gray('\n🔍 Checking for updates...'));

  try {
    const latestVersion = await getLatestVersion();

    if (latestVersion !== 'unknown') {
      console.log(chalk.white('\nLatest Available:'));
      console.log(chalk.blue(`  🌟 Latest Version: v${latestVersion}`));

      const comparison = compareVersions(localVersion, latestVersion);

      if (comparison < 0) {
        console.log(chalk.yellow('\n⚠️  Update Available!'));
        console.log(chalk.white('To update, run:'));
        console.log(chalk.green('  npm install -g cachegpt-cli@latest'));

        console.log(chalk.gray('\n📝 What\'s new:'));
        console.log(chalk.gray('  • Automated API key capture'));
        console.log(chalk.gray('  • Enhanced OAuth provider support'));
        console.log(chalk.gray('  • Improved error handling'));
      } else if (comparison === 0) {
        console.log(chalk.green('\n✅ You have the latest version!'));
      } else {
        console.log(chalk.blue('\n🚀 You have a newer version (development build)'));
      }
    } else {
      console.log(chalk.yellow('\n⚠️  Could not check for updates'));
      console.log(chalk.gray('Please check your internet connection'));
    }

  } catch (error) {
    console.log(chalk.red('\n❌ Failed to check for updates'));
    console.log(chalk.gray('You can manually check: npm view cachegpt-cli version'));
  }

  console.log(chalk.white('\n📚 Helpful Links:'));
  console.log(chalk.gray('  🏠 Homepage: https://cachegpt.app'));
  console.log(chalk.gray('  📖 Documentation: https://cachegpt.app/docs'));
  console.log(chalk.gray('  🐛 Issues: https://github.com/Fender1992/cachegpt/issues'));
  console.log(chalk.gray('  📦 npm: https://www.npmjs.com/package/cachegpt-cli'));
  console.log();
}