/**
 * Script to enable enterprise mode for a user account
 * Usage: ts-node scripts/enable-enterprise-mode.ts <email>
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase credentials');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function enableEnterpriseMode(email: string) {
  console.log(`\n🔧 Enabling Enterprise Mode for: ${email}\n`);

  // 1. Find user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (profileError || !profile) {
    console.error('❌ User not found:', email);
    console.error('Error:', profileError?.message);
    process.exit(1);
  }

  console.log('✅ User found:');
  console.log(`   ID: ${profile.id}`);
  console.log(`   Email: ${profile.email}`);
  console.log(`   Current Enterprise Mode: ${profile.enterprise_mode || false}`);
  console.log(`   Current Provider: ${profile.selected_provider || 'none'}`);

  // 2. Enable enterprise mode
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ enterprise_mode: true })
    .eq('id', profile.id);

  if (updateError) {
    console.error('\n❌ Failed to enable enterprise mode:', updateError.message);
    process.exit(1);
  }

  console.log('\n✅ Enterprise mode enabled!\n');

  // 3. Check existing credentials
  const { data: credentials, error: credError } = await supabase
    .from('user_provider_credentials')
    .select('*')
    .eq('user_id', profile.id);

  if (credentials && credentials.length > 0) {
    console.log('📋 Existing API Keys:');
    credentials.forEach(cred => {
      console.log(`   - ${cred.provider}: ${cred.api_key ? '✅ Set' : '❌ Not set'}`);
    });
  } else {
    console.log('⚠️  No API keys configured yet');
  }

  console.log('\n📝 Next Steps:');
  console.log('1. Go to https://cachegpt.app/settings');
  console.log('2. Add your API keys for providers you want to use:');
  console.log('   - OpenAI (ChatGPT)');
  console.log('   - Anthropic (Claude)');
  console.log('   - Google (Gemini)');
  console.log('3. Select your preferred provider');
  console.log('4. Start chatting with no rate limits!\n');

  console.log('💡 Benefits of Enterprise Mode:');
  console.log('   ✓ No rate limits (uses your own API keys)');
  console.log('   ✓ Choose specific models');
  console.log('   ✓ Priority support');
  console.log('   ✓ Full control over API usage\n');
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: ts-node scripts/enable-enterprise-mode.ts <email>');
  console.error('Example: ts-node scripts/enable-enterprise-mode.ts user@example.com');
  process.exit(1);
}

enableEnterpriseMode(email);
