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

export async function signupConsoleCommand() {
  console.log(chalk.cyan('📝 Create CacheGPT Account\n'));

  try {
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

    // Get password
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

    console.log(chalk.dim('\n🔄 Creating your account...'));

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
        console.log(chalk.cyan('💡 Use `cachegpt login --console` to login instead.'));
      } else {
        console.error(chalk.red(`\n❌ Account creation failed: ${error.message}`));
      }
      process.exit(1);
    }

    if (data.user) {
      console.log(chalk.green('\n🎉 Account created successfully!'));
      console.log(chalk.yellow('📧 Please check your email to confirm your account.'));

      console.log(chalk.cyan('\n📋 Next steps:'));
      console.log(chalk.white('1. Check your email for a confirmation link'));
      console.log(chalk.white('2. Click the confirmation link'));
      console.log(chalk.white('3. Once confirmed, login with:'));
      console.log(chalk.yellow('   cachegpt login --console'));
      console.log(chalk.white('4. Start chatting with:'));
      console.log(chalk.yellow('   cachegpt chat'));

      console.log(chalk.dim('\n✨ Welcome to CacheGPT - free AI chat with smart caching!'));
    } else {
      console.error(chalk.red('\n❌ Account creation failed - no user data returned'));
      process.exit(1);
    }

  } catch (error: any) {
    console.error(chalk.red('\n❌ Signup failed:'), error.message || error);
    process.exit(1);
  }
}