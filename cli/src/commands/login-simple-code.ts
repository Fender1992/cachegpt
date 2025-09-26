#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import { createClient } from '@supabase/supabase-js';
import { TokenManager } from '../lib/token-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

// Load environment variables
const envPath = path.join(__dirname, '../../.env.defaults');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export async function loginSimpleCodeCommand() {
  console.log(chalk.cyan('🔐 CacheGPT Login\n'));

  try {
    const tokenManager = new TokenManager();

    // Check if already logged in
    try {
      const existing = tokenManager.getCacheGPTAuth();
      console.log(chalk.yellow('⚠️  You are already logged in.'));

      const { confirmLogout } = await inquirer.prompt({
        type: 'confirm',
        name: 'confirmLogout',
        message: 'Do you want to logout and login again?',
        default: false,
      });

      if (!confirmLogout) {
        return;
      }

      tokenManager.clearCacheGPTAuth();
      console.log(chalk.dim('Logged out successfully\n'));
    } catch (e) {
      // Not logged in, continue with login
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zfqtydaskvtevhdsltbp.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmcXR5ZGFza3Z0ZXZoZHNsdGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzczMTE2MjAsImV4cCI6MjA1Mjg4NzYyMH0.w0E5-Q5pv-R_Y3AF5uBClQnnchQEd8HB6itr6dPDKRw';

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get email
    const { email } = await inquirer.prompt({
      type: 'input',
      name: 'email',
      message: 'Enter your email address:',
      validate: (input) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input) || 'Please enter a valid email address';
      }
    });

    // Ask for simple choice
    const { hasAccount } = await inquirer.prompt({
      type: 'list',
      name: 'hasAccount',
      message: 'Do you have a CacheGPT account?',
      choices: [
        { name: '✅ Yes, I have an account', value: 'yes' },
        { name: '➕ No, create a new account', value: 'no' }
      ]
    });

    if (hasAccount === 'no') {
      // Create account with password
      await createAccountWithPassword(supabase, email, tokenManager);
    } else {
      // Login flow - send 6-digit code
      console.log(chalk.cyan('\n📧 Sending 6-digit code to your email...'));

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false
        }
      });

      if (error) {
        if (error.message.includes('User not found')) {
          console.log(chalk.yellow('\n⚠️  No account found with this email.'));

          const { createNew } = await inquirer.prompt({
            type: 'confirm',
            name: 'createNew',
            message: 'Would you like to create a new account?',
            default: true
          });

          if (createNew) {
            await createAccountWithPassword(supabase, email, tokenManager);
          } else {
            console.log(chalk.cyan('\n💡 Visit https://cachegpt.app to sign up!'));
          }
          return;
        } else {
          console.error(chalk.red(`\n❌ Failed to send code: ${error.message}`));
          process.exit(1);
        }
      }

      console.log(chalk.green('✅ 6-digit code sent to ' + chalk.bold(email)));
      console.log(chalk.cyan('📮 Check your email for the code\n'));

      // Get the 6-digit code
      const { code } = await inquirer.prompt({
        type: 'input',
        name: 'code',
        message: 'Enter the 6-digit code from your email:',
        validate: (input) => {
          const cleaned = input.replace(/\s/g, '');
          return /^\d{6}$/.test(cleaned) || 'Please enter a valid 6-digit code';
        }
      });

      const cleanedCode = code.replace(/\s/g, '');

      console.log(chalk.dim('\n🔄 Verifying code...'));

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: cleanedCode,
        type: 'email'
      });

      if (verifyError) {
        console.error(chalk.red(`\n❌ Invalid code: ${verifyError.message}`));
        console.log(chalk.yellow('💡 Make sure you entered the 6-digit code correctly'));
        process.exit(1);
      }

      if (data.session) {
        await saveSession(data.session, email, tokenManager);
      }
    }

  } catch (error: any) {
    console.error(chalk.red('\n❌ Login failed:'), error.message || error);
    process.exit(1);
  }
}

async function createAccountWithPassword(supabase: any, email: string, tokenManager: TokenManager) {
  console.log(chalk.cyan('\n📝 Creating your CacheGPT account...\n'));

  const { password } = await inquirer.prompt({
    type: 'password',
    name: 'password',
    message: 'Choose a password (min 6 characters):',
    mask: '*',
    validate: (input) => input.length >= 6 || 'Password must be at least 6 characters'
  });

  const { confirmPassword } = await inquirer.prompt({
    type: 'password',
    name: 'confirmPassword',
    message: 'Confirm your password:',
    mask: '*',
    validate: (input) => input === password || 'Passwords do not match'
  });

  console.log(chalk.dim('\n🔄 Creating account...'));

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: email.split('@')[0]
      },
      emailRedirectTo: 'https://cachegpt.app/auth/success'
    }
  });

  if (error) {
    if (error.message.includes('User already registered')) {
      console.log(chalk.yellow('\n⚠️  An account with this email already exists.'));
      console.log(chalk.cyan('💡 Try logging in instead.'));
    } else {
      console.error(chalk.red(`\n❌ Account creation failed: ${error.message}`));
    }
    process.exit(1);
  }

  console.log(chalk.green('\n✅ Account created!'));
  console.log(chalk.yellow('📧 Please check your email to confirm your account.'));
  console.log(chalk.cyan('\n💡 After confirming your email, run:'));
  console.log(chalk.white('   cachegpt login'));
}

async function saveSession(session: any, email: string, tokenManager: TokenManager) {
  // Store the session token using TokenManager
  tokenManager.setCacheGPTAuth(
    session.access_token,
    session.refresh_token,
    session.user?.id,
    session.user?.email || email
  );

  console.log(chalk.green('\n🎉 Login successful!'));
  console.log(chalk.cyan(`Welcome, ${email}!`));
  console.log(chalk.dim('\nYou can now use:'));
  console.log('  • ' + chalk.yellow('cachegpt chat') + ' to start chatting');
  console.log('  • ' + chalk.yellow('cachegpt auth-status') + ' to check your login status');
}