#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const SUPABASE_URL = 'https://zfqtydaskvtevhdsltbp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY environment variable is required');
  console.log('Please set it with your Supabase service role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
  console.log('🔄 Applying RLS migration to fix user signup...\n');

  try {
    // Read the migration SQL
    const migrationPath = path.join(__dirname, '017_fix_user_profiles_rls.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split into individual statements (simple split by semicolon)
    const statements = migrationSQL
      .split(/;\s*$/gm)
      .filter(stmt => stmt.trim().length > 0)
      .map(stmt => stmt.trim() + ';');

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and empty statements
      if (statement.startsWith('--') || statement.trim() === ';') {
        continue;
      }

      // Get first 50 chars of statement for logging
      const preview = statement.substring(0, 50).replace(/\n/g, ' ');
      process.stdout.write(`  [${i+1}/${statements.length}] ${preview}... `);

      try {
        // Execute the statement using Supabase's rpc
        const { error } = await supabase.rpc('exec_sql', {
          sql: statement
        });

        if (error) {
          console.log('❌');
          console.error(`    Error: ${error.message}`);
          errorCount++;
        } else {
          console.log('✅');
          successCount++;
        }
      } catch (err) {
        console.log('❌');
        console.error(`    Error: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Migration Results:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);

    if (errorCount === 0) {
      console.log('\n🎉 Migration applied successfully!');
      console.log('New users should now be able to sign up without errors.');
    } else {
      console.log('\n⚠️  Some statements failed. Please check the errors above.');
      console.log('You may need to apply the migration manually in Supabase Dashboard.');
    }

    // Test the policies
    console.log('\n🔍 Verifying RLS policies...');
    const { data: policies } = await supabase.rpc('get_policies', {
      table_name: 'user_profiles'
    });

    if (policies && policies.length > 0) {
      console.log(`✅ Found ${policies.length} RLS policies on user_profiles table`);
    } else {
      console.log('⚠️  Could not verify RLS policies');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('\n💡 Alternative: Apply the migration manually in Supabase Dashboard:');
    console.log('   1. Go to https://supabase.com/dashboard');
    console.log('   2. Select your project');
    console.log('   3. Go to SQL Editor');
    console.log('   4. Paste the contents of 017_fix_user_profiles_rls.sql');
    console.log('   5. Click "Run"');
  }
}

// Run the migration
applyMigration();