#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import ora from 'ora';

interface ClaudeMessage {
  uuid: string;
  parentUuid?: string;
  sessionId: string;
  type: 'user' | 'assistant' | 'system';
  message?: any;
  timestamp: string;
  cwd?: string;
  gitBranch?: string;
  userType?: string;
  version?: string;
  requestId?: string;
  toolUseResult?: any;
}

async function parseConversationFile(filePath: string): Promise<any> {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(line => line.trim());
  const messages: ClaudeMessage[] = [];

  let sessionId = '';
  let projectPath = '';
  let gitBranch = '';
  let startedAt: Date | null = null;
  let lastUpdated: Date | null = null;
  let userId = '';

  for (const line of lines) {
    try {
      const data = JSON.parse(line);

      // Extract session metadata from first message
      if (!sessionId && data.sessionId) {
        sessionId = data.sessionId;
        projectPath = data.cwd || '';
        gitBranch = data.gitBranch || 'main';
        userId = data.userID || '';
      }

      // Track timestamps
      const timestamp = new Date(data.timestamp);
      if (!startedAt || timestamp < startedAt) {
        startedAt = timestamp;
      }
      if (!lastUpdated || timestamp > lastUpdated) {
        lastUpdated = timestamp;
      }

      messages.push(data);
    } catch (error) {
      // Skip invalid lines
    }
  }

  return {
    sessionId,
    projectPath,
    gitBranch,
    startedAt: startedAt || new Date(),
    lastUpdated: lastUpdated || new Date(),
    messages,
    userId
  };
}

async function syncConversation(apiUrl: string, conversationData: any, authToken?: string): Promise<any> {
  const headers: any = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${apiUrl}/api/claude-sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ conversationData }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to sync: ${error}`);
  }

  return response.json();
}

import { AuthService } from '../lib/auth-service';

export async function syncClaude(options: { all?: boolean; recent?: boolean; apiUrl?: string; authToken?: string }) {
  const spinner = ora('Syncing Claude conversations to Supabase...').start();

  try {
    // Load environment config if available
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          process.env[key.trim()] = value.trim().replace(/["']/g, '');
        }
      });
    }

    // Get auth token from stored credentials
    let authToken: string | undefined = options.authToken;
    if (!authToken) {
      try {
        const authService = new AuthService();
        const token = await authService.getAccessToken();

        if (token) {
          authToken = token;
        } else {
          spinner.warn('Not authenticated. Syncing without user association.');
          console.log(chalk.dim('Use'), chalk.yellow('llm-cache login'), chalk.dim('to associate conversations with your account'));
        }
      } catch (error) {
        // Continue without auth
      }
    }

    // Get Claude conversation files
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');

    if (!fs.existsSync(claudeDir)) {
      spinner.fail('No Claude conversation directory found');
      return;
    }

    // Find all project directories
    const projectDirs = fs.readdirSync(claudeDir)
      .map(dir => path.join(claudeDir, dir))
      .filter(dir => fs.statSync(dir).isDirectory());

    let totalFiles = 0;
    let syncedFiles = 0;
    let errors = 0;

    const apiUrl = options.apiUrl || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    for (const projectDir of projectDirs) {
      const files = fs.readdirSync(projectDir)
        .filter(file => file.endsWith('.jsonl'))
        .map(file => ({
          path: path.join(projectDir, file),
          name: file,
          stats: fs.statSync(path.join(projectDir, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      totalFiles += files.length;

      // Determine which files to sync
      let filesToSync = files;
      if (!options.all) {
        if (options.recent) {
          // Sync files modified in last 24 hours
          const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
          filesToSync = files.filter(f => f.stats.mtime.getTime() > oneDayAgo);
        } else {
          // Default: sync only the most recent file
          filesToSync = files.slice(0, 1);
        }
      }

      for (const file of filesToSync) {
        spinner.text = `Syncing ${file.name}...`;

        try {
          const conversation = await parseConversationFile(file.path);
          const result = await syncConversation(apiUrl, conversation, authToken);

          syncedFiles++;
          spinner.text = `Synced ${file.name} (${result.messagesAdded} new messages)`;
        } catch (error) {
          errors++;
          console.error(chalk.red(`\n✗ Failed to sync ${file.name}: ${error}`));
        }
      }
    }

    spinner.succeed(`Sync complete: ${syncedFiles}/${totalFiles} files synced${errors > 0 ? ` (${errors} errors)` : ''}`);

    console.log(chalk.dim('\nTip: Use --all to sync all conversations or --recent for last 24 hours'));
  } catch (error) {
    spinner.fail(`Sync failed: ${error}`);
    process.exit(1);
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    all: args.includes('--all'),
    recent: args.includes('--recent'),
    apiUrl: process.env.CACHEGPT_API_URL || 'http://localhost:3000'
  };

  syncClaude(options);
}