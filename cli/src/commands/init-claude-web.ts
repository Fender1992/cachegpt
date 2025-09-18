import inquirer from 'inquirer';
import chalk from 'chalk';
import open from 'open';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { saveConfig, getConfigPath } from '../lib/config';
import { CredentialStore } from '../lib/credential-store';

interface ClaudeWebConfig {
  mode: 'browser';
  provider: 'anthropic';
  authMethod: 'web-session';
  sessionKey?: string;
  organizationId?: string;
  defaultModel: string;
  cacheEnabled: boolean;
  cacheLocation: string;
  userId?: string;
  userEmail?: string;
}

/**
 * Authenticate with Claude.ai like Claude Code does
 * This captures the session from the web interface after login
 */
export async function initClaudeWebAuth(): Promise<ClaudeWebConfig> {
  console.log(chalk.cyan('\n🌐 Claude Web Authentication\n'));
  console.log(chalk.white('This works just like Claude Code!'));
  console.log(chalk.gray('1. Your browser will open to claude.ai'));
  console.log(chalk.gray('2. Log in with your existing account (Google, email, etc.)'));
  console.log(chalk.gray('3. Once logged in, we\'ll capture your session\n'));

  const credentialStore = new CredentialStore();

  // Step 1: Open Claude.ai in the browser
  console.log(chalk.yellow('Opening claude.ai in your browser...'));
  await open('https://claude.ai/new');

  console.log(chalk.cyan('\nPlease log in to Claude using your preferred method.'));
  console.log(chalk.gray('(Google, email, or any way you normally sign in)\n'));

  // Step 2: Wait for user to confirm they're logged in
  const { isLoggedIn } = await inquirer.prompt([{
    type: 'confirm',
    name: 'isLoggedIn',
    message: 'Have you successfully logged in to Claude?',
    default: false
  }]);

  if (!isLoggedIn) {
    console.log(chalk.yellow('\nPlease try again when you\'re ready to log in.'));
    process.exit(0);
  }

  // Step 3: Guide user to get session cookie
  console.log(chalk.cyan('\n📋 Now we need to capture your session (just like Claude Code does):\n'));
  console.log(chalk.white('Instructions:'));
  console.log('1. In the Claude tab, press F12 to open Developer Tools');
  console.log('2. Go to the "Application" tab (or "Storage" in Firefox)');
  console.log('3. On the left, expand "Cookies" and click on "https://claude.ai"');
  console.log('4. Look for a cookie named "sessionKey" or similar');
  console.log('5. Copy the cookie value (it\'s a long string)');
  console.log(chalk.gray('\nNote: This is exactly what Claude Code does behind the scenes!\n'));

  // Step 4: Let user paste the session cookie
  const { sessionCookie } = await inquirer.prompt([{
    type: 'password',
    name: 'sessionCookie',
    message: 'Paste your session cookie value here:',
    mask: '*',
    validate: (input) => {
      if (!input || input.length < 20) {
        return 'Session cookie is required and should be a long string';
      }
      return true;
    }
  }]);

  // Optional: Get organization ID if using Claude for Work
  const { hasOrg } = await inquirer.prompt([{
    type: 'confirm',
    name: 'hasOrg',
    message: 'Are you using Claude for Work (with an organization)?',
    default: false
  }]);

  let organizationId;
  if (hasOrg) {
    const { orgId } = await inquirer.prompt([{
      type: 'input',
      name: 'orgId',
      message: 'Enter your organization ID (from the URL):',
      validate: (input) => input.length > 0 || 'Organization ID is required'
    }]);
    organizationId = orgId;
  }

  // Step 5: Test the session by making a request
  console.log(chalk.yellow('\n🔍 Testing your session...'));

  const testSuccess = await testClaudeSession(sessionCookie, organizationId);

  if (!testSuccess) {
    console.log(chalk.red('\n❌ Session test failed. The cookie might be expired or invalid.'));
    console.log(chalk.yellow('Please make sure you:'));
    console.log('1. Are logged in to claude.ai');
    console.log('2. Copied the correct cookie value');
    console.log('3. The session is still active\n');

    const { retry } = await inquirer.prompt([{
      type: 'confirm',
      name: 'retry',
      message: 'Would you like to try again?',
      default: true
    }]);

    if (retry) {
      return initClaudeWebAuth();
    } else {
      process.exit(1);
    }
  }

  console.log(chalk.green('✅ Session validated successfully!\n'));

  // Step 6: Save the session securely
  const userId = crypto.randomBytes(16).toString('hex');

  // Store in credential store (encrypted)
  await credentialStore.store(`anthropic:claude-web:${userId}`, {
    accessToken: sessionCookie, // We store the session cookie as "accessToken"
    provider: 'anthropic',
    userId,
    userEmail: 'claude.ai-user',
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
  });

  // Return configuration
  const config: ClaudeWebConfig = {
    mode: 'browser',
    provider: 'anthropic',
    authMethod: 'web-session',
    sessionKey: encryptData(sessionCookie),
    organizationId: organizationId ? encryptData(organizationId) : undefined,
    defaultModel: 'claude-3-opus-20240229',
    cacheEnabled: true,
    cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
    userId,
    userEmail: 'claude.ai-user'
  };

  return config;
}

/**
 * Test if the Claude session is valid by making a simple API call
 */
async function testClaudeSession(sessionCookie: string, organizationId?: string): Promise<boolean> {
  try {
    const headers: any = {
      'Cookie': `sessionKey=${sessionCookie}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://claude.ai',
      'Referer': 'https://claude.ai/'
    };

    if (organizationId) {
      headers['anthropic-organization-id'] = organizationId;
    }

    // Try to get conversation list or user info
    const response = await fetch('https://claude.ai/api/organizations', {
      method: 'GET',
      headers
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

function encryptData(data: string): string {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(os.hostname(), 'salt', 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return JSON.stringify({
    data: encrypted,
    iv: iv.toString('hex')
  });
}