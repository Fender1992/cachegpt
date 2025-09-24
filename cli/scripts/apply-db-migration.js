#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

async function applyMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials in environment variables');
    console.log('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('🗄️  Applying database migration...');
  console.log(`📍 Database: ${supabaseUrl}`);

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../../database-scripts/013_add_provider_selection.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration content:');
    console.log(migrationSQL);
    console.log('');

    // Apply the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      // Try direct execution if rpc doesn't work
      console.log('⚠️  RPC method failed, trying direct execution...');

      // Split SQL into individual statements
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.toLowerCase().includes('alter table')) {
          console.log(`🔧 Executing: ${statement.substring(0, 50)}...`);

          // For ALTER TABLE, we need to use the REST API directly
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql: statement + ';' })
          });

          if (!response.ok) {
            console.log(`⚠️  Statement failed, might already exist: ${statement}`);
          } else {
            console.log('✅ Statement executed successfully');
          }
        }
      }
    } else {
      console.log('✅ Migration applied successfully');
    }

    // Verify the columns were added
    console.log('\n🔍 Verifying database schema...');

    const { data: columns, error: schemaError } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(0);

    if (schemaError) {
      console.error('❌ Failed to verify schema:', schemaError.message);
    } else {
      console.log('✅ Schema verification successful');
      console.log('📊 user_profiles table is accessible');
    }

    // Try to verify specific columns exist by attempting a query
    try {
      const { error: testError } = await supabase
        .from('user_profiles')
        .select('selected_provider, selected_model, enterprise_mode')
        .limit(1);

      if (testError) {
        if (testError.message.includes('selected_provider')) {
          console.log('❌ selected_provider column not found');
        }
        if (testError.message.includes('selected_model')) {
          console.log('❌ selected_model column not found');
        }
        if (testError.message.includes('enterprise_mode')) {
          console.log('❌ enterprise_mode column not found');
        }
        console.log('⚠️  Some columns may need manual addition via Supabase dashboard');
      } else {
        console.log('✅ All required columns (selected_provider, selected_model, enterprise_mode) are present');
      }
    } catch (verifyError) {
      console.log('⚠️  Column verification failed:', verifyError.message);
    }

    console.log('\n🎉 Migration process completed!');
    console.log('💡 If columns are still missing, please add them manually in Supabase dashboard:');
    console.log('   1. Go to Database > Tables > user_profiles');
    console.log('   2. Add columns: selected_provider (text), selected_model (text), enterprise_mode (boolean)');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration();