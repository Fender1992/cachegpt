import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

async function runMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Read migration file
  const migrationPath = join(process.cwd(), 'database-scripts', '033_conversation_files.sql')
  const sql = readFileSync(migrationPath, 'utf-8')

  console.log('[MIGRATION] Running 033_conversation_files.sql...')

  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (const statement of statements) {
    if (statement) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement })
        if (error) {
          console.error('Error executing statement:', error)
          console.log('Statement was:', statement.substring(0, 200))
        }
      } catch (e) {
        console.error('Exception:', e)
      }
    }
  }

  console.log('[MIGRATION] ✅ Migration completed')
}

runMigration().catch(console.error)
