import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../lib/config';
import { createApiClient } from '../lib/api';
import { logError, logInfo } from '../lib/utils';
import { CacheService } from '../lib/cache-service';
import { AuthService } from '../lib/auth-service';
import readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function chatCommand(): Promise<void> {
  // Use the new v2 chat command with proper OAuth flow and local storage
  const { chatV2Command } = await import('./chat-v2');
  return chatV2Command();
}

// Keep the old implementation for reference but it won't be used
export async function chatCommandOld(): Promise<void> {
  console.log(chalk.yellow('This is the old chat command. Please use the new version.'));
}