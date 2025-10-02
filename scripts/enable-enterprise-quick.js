/**
 * Quick script to enable enterprise mode using system environment variables
 */

const { createClient } = require('@supabase/supabase-js');

// Use environment variables from system
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('Service Key:', supabaseServiceKey ? '✅ Set' : '❌ Missing');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\n❌ Error: Missing Supabase credentials in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const email = process.argv[2] || 'rolandofender@gmail.com';

async function run() {
  console.log(`\n🔧 Enabling Enterprise Mode for: ${email}\n`);

  // Find user
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (profileError || !profile) {
    console.error('❌ User not found:', profileError?.message);
    process.exit(1);
  }

  console.log('✅ User found:', profile.id);
  console.log('   Current enterprise_mode:', profile.enterprise_mode);

  // Enable enterprise mode
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ enterprise_mode: true })
    .eq('id', profile.id);

  if (updateError) {
    console.error('\n❌ Failed:', updateError.message);
    process.exit(1);
  }

  console.log('\n✅ Enterprise mode ENABLED!\n');
  console.log('Next: Add API keys at https://cachegpt.app/settings\n');
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
