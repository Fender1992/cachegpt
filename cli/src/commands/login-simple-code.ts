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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error(chalk.red('Error: Supabase configuration missing.'));
      console.log(chalk.yellow('Please ensure environment variables are set.'));
      return;
    }

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
      // Login flow - ask for login method
      const { loginMethod } = await inquirer.prompt({
        type: 'list',
        name: 'loginMethod',
        message: 'How would you like to login?',
        choices: [
          { name: '📧 Email code (6-digit OTP)', value: 'otp' },
          { name: '🔑 Password', value: 'password' }
        ]
      });

      if (loginMethod === 'password') {
        // Password login
        const { password } = await inquirer.prompt({
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*'
        });

        console.log(chalk.dim('\n🔄 Logging in...'));

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.error(chalk.red(`\n❌ Login failed: ${error.message}`));
          console.log(chalk.yellow('\n💡 Tips:'));
          console.log('• Make sure your email and password are correct');
          console.log('• If you signed up on the web, confirm your email first');
          console.log('• Try resetting your password at https://cachegpt.app');
          process.exit(1);
        }

        if (data.session) {
          await saveSession(data.session, email, tokenManager);
        }
      } else {
        // OTP login
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
          } else if (error.message.includes('email not confirmed') || error.message.includes('Email not confirmed')) {
            console.log(chalk.yellow('\n⚠️  Please confirm your email first.'));
            console.log(chalk.cyan('📧 Check your inbox for a confirmation email from CacheGPT'));
            console.log(chalk.dim('\nAfter confirming your email, run: cachegpt login'));
            process.exit(1);
          } else {
            console.error(chalk.red(`\n❌ Failed to send code: ${error.message}`));
            console.log(chalk.yellow('\n💡 Try using password login instead'));
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
      process.exit(1);
    } else if (error.message.includes('Database error')) {
      console.log(chalk.yellow('\n⚠️  Database configuration issue detected.'));
      console.log(chalk.cyan('Attempting alternative signup method...'));

      // Try to create account without profile, then manually create profile
      const { data: retryData, error: retryError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: email.split('@')[0],
            skip_profile_creation: true
          },
          emailRedirectTo: 'https://cachegpt.app/auth/success'
        }
      });

      if (retryError && !retryError.message.includes('User already registered')) {
        console.error(chalk.red(`\n❌ Account creation failed: ${retryError.message}`));
        console.log(chalk.yellow('\n🔧 Troubleshooting:'));
        console.log('1. This is a known Supabase configuration issue');
        console.log('2. Please contact support@cachegpt.io for assistance');
        console.log('3. Or try signing up at https://cachegpt.app');
        process.exit(1);
      }

      if (retryData?.user) {
        // Try to manually create the profile using the RPC function
        try {
          const { error: profileError } = await supabase.rpc('force_create_user_profile', {
            user_id: retryData.user.id,
            user_email: email
          });

          if (!profileError) {
            console.log(chalk.green('\n✅ Account created successfully!'));
          } else {
            console.log(chalk.yellow('\n⚠️  Account created but profile setup incomplete.'));
            console.log(chalk.cyan('This will be fixed automatically on your first login.'));
          }
        } catch (e) {
          // Profile creation failed but account exists
          console.log(chalk.yellow('\n⚠️  Account created but profile setup pending.'));
        }

        console.log(chalk.yellow('\n📧 Please check your email to confirm your account.'));
        console.log(chalk.cyan('After confirming, run: cachegpt login'));
        return;
      }
    } else {
      console.error(chalk.red(`\n❌ Account creation failed: ${error.message}`));
      process.exit(1);
    }
  }

  if (data?.user) {
    // Try to ensure profile exists
    try {
      await supabase.rpc('force_create_user_profile', {
        user_id: data.user.id,
        user_email: email
      });
    } catch (e) {
      // Ignore profile creation errors
    }

    console.log(chalk.green('\n✅ Account created!'));
    console.log(chalk.yellow('📧 Please check your email to confirm your account.'));
    console.log(chalk.cyan('\n💡 After confirming your email, run:'));
    console.log(chalk.white('   cachegpt login'));
  }
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
  console.log('  • ' + chalk.yellow('cachegpt chat') + ' to start chatting in the terminal');
  console.log('  • ' + chalk.blue('https://cachegpt.app/chat') + ' to use the web interface');
  console.log('  • ' + chalk.yellow('cachegpt auth-status') + ' to check your login status');

  // First-run donation message (show only once)
  const configDir = path.join(os.homedir(), '.cachegpt');
  const firstRunFlag = path.join(configDir, '.first_run_shown');
  if (!fs.existsSync(firstRunFlag)) {
    console.log();
    console.log(chalk.cyan('  CacheGPT is free and community-supported. Love it? → https://cachegpt.app/donate'));
    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(firstRunFlag, new Date().toISOString());
    } catch {
      // Ignore write errors for the flag file
    }
  }
}