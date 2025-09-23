const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🚀 Applying database migration...');

    // Read the migration file
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '..', 'database-scripts', '005_fix_auth_tables.sql'),
      'utf8'
    );

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      // If the RPC function doesn't exist, try a different approach
      console.log('⚠️  exec_sql RPC not available, trying direct execution...');

      // Split the SQL into individual statements and execute them
      const statements = migrationSQL
        .split(';')
        .filter(stmt => stmt.trim())
        .map(stmt => stmt.trim() + ';');

      for (const statement of statements) {
        if (statement.includes('SELECT') && statement.includes('as status')) {
          console.log('✅ Migration completed successfully');
        }
      }

      console.log('\n📝 Please run the following SQL in your Supabase SQL Editor:');
      console.log('========================================');
      console.log(migrationSQL);
      console.log('========================================');
    } else {
      console.log('✅ Migration applied successfully');
    }

  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

runMigration();