#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

// Load environment variables
const envPath = path.join(__dirname, '../../.env.defaults');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export async function loginConsoleCommand() {
  console.log(chalk.cyan('🔐 CacheGPT Console Login\n'));

  try {
    // Check if already logged in
    const configDir = path.join(os.homedir(), '.cachegpt');
    const tokenPath = path.join(configDir, 'auth.json');

    if (fs.existsSync(tokenPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
        if (existing.cachegpt_auth?.value) {
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

          fs.unlinkSync(tokenPath);
          console.log(chalk.dim('Logged out successfully\n'));
        }
      } catch (e) {
        // Invalid token file, continue with login
      }
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slxgfzlralwbpzafbufm.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNseGdmemxyYWx3YnB6YWZidWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NzgwMzQsImV4cCI6MjA3MzU1NDAzNH0.0TRSpP_OxAde0WkVXJohGWIqlJ2CdpiYt6FAh2lz1so';

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get email first
    const { email } = await inquirer.prompt({
      type: 'input',
      name: 'email',
      message: 'Enter your email address:',
      validate: (input) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input) || 'Please enter a valid email address';
      }
    });

    // Skip account existence check to avoid rate limits
    // We'll let the user tell us their account type directly
    console.log(chalk.cyan('\nℹ️  How did you originally sign up for CacheGPT?'));

    const { loginMethod } = await inquirer.prompt({
      type: 'list',
      name: 'loginMethod',
      message: 'Choose your login method:',
      choices: [
        { name: '🔑 I have a password (signed up with email)', value: 'password' },
        { name: '🌐 I signed up with Google/GitHub (no password)', value: 'oauth' },
        { name: '📧 Send me a magic link (works for everyone)', value: 'magiclink' },
        { name: '➕ I don\'t have an account yet', value: 'create' }
      ]
    });

    if (loginMethod === 'create') {
      // Create new account
      await createNewAccount(supabase, email, configDir, tokenPath);

    } else if (loginMethod === 'password') {
        // Try password login
        const { password } = await inquirer.prompt({
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*'
        });

        console.log(chalk.dim('\n🔄 Authenticating...'));

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            console.error(chalk.red('\n❌ Invalid password'));
            console.log(chalk.yellow('💡 If you signed up with Google/GitHub, you don\'t have a password.'));
            console.log(chalk.cyan('   Try running the command again and choose "Google/GitHub" option.'));
          } else {
            console.error(chalk.red(`\n❌ Login failed: ${error.message}`));
          }

          const { forgotPassword } = await inquirer.prompt({
            type: 'confirm',
            name: 'forgotPassword',
            message: 'Would you like to reset your password?',
            default: false
          });

          if (forgotPassword) {
            await sendPasswordReset(supabase, email);
          }
          process.exit(1);
        }

        if (data.session) {
          await saveSession(data.session, email, configDir, tokenPath);
        }

      } else if (loginMethod === 'oauth') {
        // OAuth user wants to set up password
        console.log(chalk.cyan('\n🔐 Setting up password for your OAuth account...'));
        console.log(chalk.yellow('📧 We\'ll verify your email first, then let you set a password.\n'));

        const { setupPassword } = await inquirer.prompt({
          type: 'confirm',
          name: 'setupPassword',
          message: 'Set a password for console access?',
          default: true
        });

        if (setupPassword) {
          await setupPasswordForOAuthUser(supabase, email, configDir, tokenPath);
        } else {
          await sendMagicLink(supabase, email, configDir, tokenPath);
        }

    } else if (loginMethod === 'magiclink') {
      // Magic link login
      await sendMagicLink(supabase, email, configDir, tokenPath);
    }

  } catch (error: any) {
    console.error(chalk.red('\n❌ Login failed:'), error.message || error);
    process.exit(1);
  }
}

async function createNewAccount(supabase: any, email: string, configDir: string, tokenPath: string) {
  console.log(chalk.cyan('\n📝 Creating new CacheGPT account...\n'));

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
      console.log(chalk.cyan('💡 Try choosing "I have a password" or "Google/GitHub" login instead.'));
      process.exit(0);
    } else {
      console.error(chalk.red(`\n❌ Account creation failed: ${error.message}`));
      process.exit(1);
    }
  }

  if (data.user) {
    if (data.user.email_confirmed_at) {
      // Account created and immediately confirmed (rare but possible)
      console.log(chalk.green('\n✅ Account created and confirmed!'));

      if (data.session) {
        await saveSession(data.session, email, configDir, tokenPath);
        return;
      }
    } else {
      // Account created but needs email confirmation
      console.log(chalk.green('\n✅ Account created successfully!'));
      console.log(chalk.yellow('📧 Please check your email to confirm your account.'));
      console.log(chalk.cyan('\n🎯 After confirming your email:'));
      console.log(chalk.white('1. Click the confirmation link in your email'));
      console.log(chalk.white('2. You\'ll be redirected to cachegpt.app'));
      console.log(chalk.white('3. Come back here and login with your password\n'));

      const { proceedWithLogin } = await inquirer.prompt({
        type: 'confirm',
        name: 'proceedWithLogin',
        message: 'Have you confirmed your email and want to login now?',
        default: false
      });

      if (proceedWithLogin) {
        // Try to login with the password they just created
        console.log(chalk.dim('\n🔄 Attempting login...'));

        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (loginError) {
          if (loginError.message.includes('Email not confirmed')) {
            console.log(chalk.yellow('\n⚠️  Please confirm your email first, then run:'));
            console.log(chalk.cyan('   cachegpt login --console'));
          } else {
            console.error(chalk.red(`\n❌ Login failed: ${loginError.message}`));
            console.log(chalk.cyan('\n💡 Once you confirm your email, run:'));
            console.log(chalk.cyan('   cachegpt login --console'));
          }
        } else if (loginData.session) {
          await saveSession(loginData.session, email, configDir, tokenPath);
          return;
        }
      } else {
        console.log(chalk.cyan('\n💡 Once you confirm your email, run:'));
        console.log(chalk.cyan('   cachegpt login --console'));
      }
    }
  } else {
    console.error(chalk.red('\n❌ Account creation failed - no user data returned'));
    process.exit(1);
  }
}

async function setupPasswordForOAuthUser(supabase: any, email: string, configDir: string, tokenPath: string) {
  console.log(chalk.cyan('\n🔐 Setting up password for your account...'));
  console.log(chalk.yellow('📧 We\'ll send a verification link to your email.\n'));

  // Send magic link for verification - but we need to intercept the callback
  const { error: linkError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false
    }
  });

  if (linkError) {
    if (linkError.message.includes('For security purposes, you can only request this after')) {
      console.log(chalk.yellow('\n⏳ Please wait 30 seconds before requesting another email.'));
      console.log(chalk.cyan('💡 Or use the previous magic link if you still have it in your email.\n'));

      const { waitOrUsePrevious } = await inquirer.prompt({
        type: 'list',
        name: 'waitOrUsePrevious',
        message: 'What would you like to do?',
        choices: [
          { name: '📧 Use the previous magic link from my email', value: 'use_previous' },
          { name: '⏳ Wait 30 seconds and send a new link', value: 'wait' }
        ]
      });

      if (waitOrUsePrevious === 'wait') {
        console.log(chalk.dim('\n⏳ Waiting 30 seconds...'));
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Try again
        const { error: retryError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false
          }
        });

        if (retryError) {
          console.error(chalk.red(`\n❌ Failed to send verification link: ${retryError.message}`));
          process.exit(1);
        }
        console.log(chalk.green('✅ New verification link sent!'));
      } else {
        console.log(chalk.green('✅ Using previous magic link from your email'));
      }
    } else {
      console.error(chalk.red(`\n❌ Failed to send verification link: ${linkError.message}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.green('✅ Verification link sent!'));
  }

  console.log(chalk.green('✅ Magic link sent to ' + chalk.bold(email)));
  console.log(chalk.cyan('📧 Check your email and click the "Log In" button'));
  console.log(chalk.yellow('⚠️  This will open the web interface - that\'s expected!'));
  console.log(chalk.dim('\nAfter clicking the link and completing web login:\n'));

  // Give them the manual token option
  console.log(chalk.cyan('📋 To complete console setup:'));
  console.log(chalk.white('1. Click the magic link in your email'));
  console.log(chalk.white('2. Complete login in the web browser'));
  console.log(chalk.white('3. Once logged in, copy your session token:'));
  console.log(chalk.dim('   • Open browser Developer Tools (F12)'));
  console.log(chalk.dim('   • Go to Application/Storage → Local Storage → cachegpt.app'));
  console.log(chalk.dim('   • Copy the value from "sb-zfqtydaskvtevhdsltbp-auth-token"'));
  console.log(chalk.white('4. Come back here and paste the token\n'));

  const { useManualToken } = await inquirer.prompt({
    type: 'confirm',
    name: 'useManualToken',
    message: 'Ready to enter your session token?',
    default: true
  });

  if (!useManualToken) {
    console.log(chalk.yellow('\n💡 No problem! When ready, run:'));
    console.log(chalk.cyan('   cachegpt login --console'));
    console.log(chalk.dim('   And we\'ll help you set up the password.'));
    process.exit(0);
  }

  // Get the token manually
  const { sessionToken } = await inquirer.prompt({
    type: 'password',
    name: 'sessionToken',
    message: 'Paste your session token here:',
    mask: '*',
    validate: (input) => {
      try {
        // Basic JWT validation
        const parts = input.split('.');
        if (parts.length !== 3) return 'Invalid token format (should be a JWT)';

        // Try to decode the payload to check if it's valid
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (!payload.sub || !payload.email) return 'Invalid token content';

        return true;
      } catch (e) {
        return 'Invalid token format';
      }
    }
  });

  console.log(chalk.dim('\n🔄 Validating token...'));

  // Set the session manually
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: sessionToken,
    refresh_token: '' // We'll need to get this too, but for now try without
  });

  if (sessionError || !sessionData.session) {
    console.error(chalk.red(`\n❌ Invalid token: ${sessionError?.message || 'Session not found'}`));
    console.log(chalk.yellow('💡 Make sure you copied the complete token from Local Storage'));
    process.exit(1);
  }

  // Now user is authenticated, let them set a password
  console.log(chalk.green('\n✅ Token validated! Now let\'s set a password.\n'));

  const { newPassword } = await inquirer.prompt({
    type: 'password',
    name: 'newPassword',
    message: 'Choose a password (min 6 characters):',
    mask: '*',
    validate: (input) => input.length >= 6 || 'Password must be at least 6 characters'
  });

  const { confirmPassword } = await inquirer.prompt({
    type: 'password',
    name: 'confirmPassword',
    message: 'Confirm your password:',
    mask: '*',
    validate: (input) => input === newPassword || 'Passwords do not match'
  });

  console.log(chalk.dim('\n🔄 Setting password...'));

  // Update user password using the authenticated session
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (updateError) {
    console.error(chalk.red(`\n❌ Failed to set password: ${updateError.message}`));
    process.exit(1);
  }

  console.log(chalk.green('\n🎉 Password set successfully!'));
  console.log(chalk.cyan('✅ Your OAuth account now has a password for console access'));

  // Save the session
  await saveSession(sessionData.session, email, configDir, tokenPath);
}

async function sendMagicLink(supabase: any, email: string, configDir: string, tokenPath: string) {
  console.log(chalk.dim('\n📧 Sending magic link to your email...'));

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false
    }
  });

  if (error) {
    console.error(chalk.red(`\n❌ Failed to send magic link: ${error.message}`));
    process.exit(1);
  }

  console.log(chalk.green('\n✅ Magic link sent to ' + chalk.bold(email)));
  console.log(chalk.cyan('📧 Check your email and click the "Log In" button'));
  console.log(chalk.yellow('⚠️  This will open the web interface to complete login'));
  console.log(chalk.dim('\nAfter clicking the link and logging in:\n'));

  // Give them the manual token option
  console.log(chalk.cyan('📋 To complete console login:'));
  console.log(chalk.white('1. Click the magic link in your email'));
  console.log(chalk.white('2. Complete login in the web browser'));
  console.log(chalk.white('3. Copy your session token from the browser:'));
  console.log(chalk.dim('   • Open Developer Tools (F12)'));
  console.log(chalk.dim('   • Go to Application/Storage → Local Storage → cachegpt.app'));
  console.log(chalk.dim('   • Copy the value from "sb-zfqtydaskvtevhdsltbp-auth-token"'));
  console.log(chalk.white('4. Come back here and paste the token\n'));

  const { useManualToken } = await inquirer.prompt({
    type: 'confirm',
    name: 'useManualToken',
    message: 'Ready to enter your session token?',
    default: true
  });

  if (!useManualToken) {
    console.log(chalk.yellow('\n💡 No problem! After clicking the magic link, you\'ll be logged in on the web.'));
    console.log(chalk.cyan('   To use console commands, run `cachegpt login --console` again.'));
    process.exit(0);
  }

  // Get the token manually
  const { sessionToken } = await inquirer.prompt({
    type: 'password',
    name: 'sessionToken',
    message: 'Paste your session token here:',
    mask: '*',
    validate: (input) => {
      try {
        // Basic JWT validation
        const parts = input.split('.');
        if (parts.length !== 3) return 'Invalid token format (should be a JWT)';

        // Try to decode the payload to check if it's valid
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (!payload.sub || !payload.email) return 'Invalid token content';

        return true;
      } catch (e) {
        return 'Invalid token format';
      }
    }
  });

  console.log(chalk.dim('\n🔄 Validating token...'));

  // Set the session manually
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: sessionToken,
    refresh_token: '' // We'll try without refresh token first
  });

  if (sessionError || !sessionData.session) {
    console.error(chalk.red(`\n❌ Invalid token: ${sessionError?.message || 'Session not found'}`));
    console.log(chalk.yellow('💡 Make sure you copied the complete token from Local Storage'));
    process.exit(1);
  }

  // Save the session
  await saveSession(sessionData.session, email, configDir, tokenPath);
}

async function sendPasswordReset(supabase: any, email: string) {
  console.log(chalk.dim('\n📧 Sending password reset link...'));

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://cachegpt.app/auth/reset-password'
  });

  if (error) {
    console.error(chalk.red(`\n❌ Failed to send reset link: ${error.message}`));
  } else {
    console.log(chalk.green('\n✅ Password reset link sent to ' + chalk.bold(email)));
    console.log(chalk.cyan('📮 Check your email to reset your password.'));
    console.log(chalk.dim('\nOnce reset, run `cachegpt login --console` again to login.'));
  }
}

async function saveSession(session: any, email: string, configDir: string, tokenPath: string) {
  // Store the session token
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({
      cachegpt_auth: {
        value: session.access_token,
        timestamp: Date.now(),
        user_id: session.user?.id || 'console-user',
        email: session.user?.email || email
      }
    }, null, 2),
    { mode: 0o600 }
  );

  console.log(chalk.green('\n✅ Login successful!'));
  console.log(chalk.cyan(`Welcome, ${email}!`));
  console.log(chalk.dim('\nYou can now use:'));
  console.log('  • ' + chalk.yellow('cachegpt chat') + ' to start chatting');
  console.log('  • ' + chalk.yellow('cachegpt auth-status') + ' to check your login status');
  console.log('  • ' + chalk.yellow('cachegpt logout') + ' to sign out');
}