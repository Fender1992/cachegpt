#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { AuthService } from '../lib/auth-service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function loginCommandSimple() {
  console.log(chalk.cyan('🔐 Login to CacheGPT\n'));

  try {
    const authService = new AuthService();

    // Check if already logged in
    const currentUser = await authService.getCurrentUser();
    if (currentUser) {
      console.log(chalk.yellow('⚠️  You are already logged in as:'), currentUser.email);

      const { confirmLogout } = await inquirer.prompt({
          type: 'confirm',
          name: 'confirmLogout',
          message: 'Do you want to logout and login with a different account?',
          default: false,
        });

      if (!confirmLogout) {
        return;
      }

      await authService.logout();
      console.log(chalk.dim('Logged out successfully\n'));
    }

    // Open browser for OAuth login
    console.log(chalk.cyan('🌐 Opening browser for authentication...\n'));

    const open = await import('open').catch(() => null);
    const authUrl = 'https://cachegpt.app/login?source=cli&return_to=terminal';

    if (open) {
      await open.default(authUrl);
      console.log(chalk.green('✅ Browser opened to login page'));
    } else {
      console.log(chalk.yellow('Please open this URL in your browser:'));
      console.log(chalk.blue.underline(authUrl));
    }

    console.log();
    console.log(chalk.cyan('📋 Complete these steps in the browser:'));
    console.log(chalk.white('1. Login with Google or GitHub'));
    console.log(chalk.white('2. Select your LLM provider (credentials will be auto-captured)'));
    console.log(chalk.white('3. Your credentials will automatically sync to this terminal\n'));

    // First wait for OAuth authentication to complete
    console.log(chalk.cyan('⏳ Step 1: Waiting for OAuth authentication...'));
    const isAuthenticated = await waitForOAuthAuth(authService);

    if (!isAuthenticated) {
      console.log(chalk.yellow('⚠️ OAuth authentication timed out. Please try again.'));
      return;
    }

    console.log(chalk.green('✅ OAuth authentication successful!'));
    console.log(chalk.cyan('⏳ Step 2: Waiting for your LLM provider selection...'));
    console.log(chalk.gray('✨ Automatic credential sync in progress...'));
    console.log();

    const credentials = await pollForCredentials(authService);

    if (!credentials) {
      console.log(chalk.yellow('⚠️ No credentials received. Please try again.'));
      return;
    }

    console.log(chalk.green(`\n✅ Automatically received ${credentials.provider.toUpperCase()} credentials!`));
    console.log(chalk.gray(`Email: ${credentials.user_email}`));
    console.log();

    // Save credentials locally as backup
    await saveCredentialsLocally(credentials);

    // Store Claude user ID if available
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(claudeConfigPath)) {
      try {
        const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
        if (claudeConfig.userID) {
          const configDir = path.join(os.homedir(), '.cachegpt');
          if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
          }

          const userConfigPath = path.join(configDir, 'user-config.json');
          fs.writeFileSync(
            userConfigPath,
            JSON.stringify({ claude_user_id: claudeConfig.userID }, null, 2),
            { mode: 0o600 }
          );

          console.log(chalk.dim('\n📝 Claude user ID linked for conversation sync'));
        }
      } catch (error) {
        // Silently continue if we can't read Claude config
      }
    }

    console.log(chalk.cyan('\nYou can now:'));
    console.log('  • Use', chalk.yellow('cachegpt sync-claude'), 'to sync your conversations');
    console.log('  • Use', chalk.yellow('cachegpt auth-status'), 'to check your login status');
    console.log('  • Visit the web portal with your credentials');
    console.log('  • Use', chalk.yellow('cachegpt logout'), 'to sign out');

  } catch (error: any) {
    if (error.message?.includes('Invalid login credentials')) {
      console.error(chalk.red('\n❌ Invalid email or password'));
      console.log(chalk.dim('If you don\'t have an account, use'), chalk.yellow('cachegpt register'), chalk.dim('to create one'));
    } else if (error.message?.includes('Email not confirmed')) {
      console.error(chalk.red('\n❌ Email not verified'));
      console.log(chalk.yellow('Please check your email and verify your account before logging in'));
    } else {
      console.error(chalk.red('\n❌ Login failed:'), error.message || error);
    }
    process.exit(1);
  }
}

async function pollForCredentials(authService: any, timeoutMs: number = 120000): Promise<any> {
  const startTime = Date.now();
  const pollInterval = 2000; // Check every 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      const currentUser = await authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Load environment variables from .env.defaults if needed
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const dotenv = await import('dotenv');
        const defaultsPath = path.join(__dirname, '../../.env.defaults');
        if (fs.existsSync(defaultsPath)) {
          dotenv.config({ path: defaultsPath });
        }
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration not found');
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Check for new credentials in the database
      const { data, error } = await supabase
        .from('user_provider_credentials')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('status', 'ready')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.log(chalk.gray(`Database query error: ${error.message}`));
      }

      if (data && data.updated_at) {
        // Check if this credential was created recently (within the last 5 minutes)
        const credentialAge = Date.now() - new Date(data.updated_at).getTime();
        const fiveMinutes = 5 * 60 * 1000;

        if (credentialAge < fiveMinutes) {
          // Return the credentials (decode base64 tokens from database)
          return {
            provider: data.provider,
            user_email: data.user_email,
            llm_token: data.llm_token ? Buffer.from(data.llm_token, 'base64').toString('utf8') : null,
            session_token: data.session_token ? Buffer.from(data.session_token, 'base64').toString('utf8') : null,
            auto_captured: data.auto_captured
          };
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error: any) {
      console.log(chalk.gray(`Polling error: ${error.message}`));
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // Timeout reached
  return null;
}

async function saveCredentialsLocally(credentials: any): Promise<void> {
  try {
    const configDir = path.join(os.homedir(), '.cachegpt');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    const providerConfigPath = path.join(configDir, 'provider-config.json');

    // Create local config object with encryption
    const localConfig = {
      provider: credentials.provider,
      userEmail: credentials.user_email,
      llmToken: credentials.llm_token ? encrypt(credentials.llm_token) : null,
      sessionToken: credentials.session_token ? encrypt(credentials.session_token) : null,
      autoCaptured: credentials.auto_captured,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(
      providerConfigPath,
      JSON.stringify(localConfig, null, 2),
      { mode: 0o600 }
    );

    console.log(chalk.dim('📝 Credentials saved locally as backup'));

  } catch (error: any) {
    console.log(chalk.yellow(`⚠️ Failed to save credentials locally: ${error.message}`));
  }
}

function encrypt(text: string): string {
  // Simple base64 encoding to match the decryption in chat.ts
  return Buffer.from(text, 'utf8').toString('base64');
}

async function waitForOAuthAuth(authService: any, timeoutMs: number = 180000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 3000; // Check every 3 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Load environment variables from .env.defaults if needed
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const dotenv = await import('dotenv');
        const defaultsPath = path.join(__dirname, '../../.env.defaults');
        if (fs.existsSync(defaultsPath)) {
          dotenv.config({ path: defaultsPath });
        }
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Check for CLI auth sessions from recent web login
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('cli_auth_sessions')
          .select('*')
          .eq('status', 'authenticated')
          .gte('created_at', fiveMinutesAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data && !error) {
          // Store the session in CLI auth service
          await authService.saveCredentials({
            email: data.user_email,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            user_id: data.user_id,
            expires_at: data.expires_at
          });

          // Mark session as consumed
          await supabase
            .from('cli_auth_sessions')
            .update({ status: 'consumed' })
            .eq('user_id', data.user_id);

          return true; // OAuth authentication successful
        }
      }

      // Fallback: Check if auth service has valid session
      const currentUser = await authService.getCurrentUser();
      if (currentUser && currentUser.id) {
        return true; // OAuth authentication successful
      }
    } catch (error: any) {
      console.log(chalk.gray(`Auth polling: ${error.message || error}`));
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return false; // Timeout
}