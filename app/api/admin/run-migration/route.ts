import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * POST /api/admin/run-migration
 * Run database migration (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Simple admin check - you should implement proper admin authentication
    const authHeader = request.headers.get('x-admin-key')
    if (authHeader !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { migrationFile } = await request.json()

    if (!migrationFile) {
      return NextResponse.json({ error: 'migrationFile required' }, { status: 400 })
    }

    // Read migration file
    const migrationPath = join(process.cwd(), 'database-scripts', migrationFile)
    const migrationSQL = await readFile(migrationPath, 'utf-8')

    // Create admin Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Execute migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    })

    if (error) {
      console.error('[MIGRATION] Error:', error)
      return NextResponse.json({
        error: 'Migration failed',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      migration: migrationFile,
      message: 'Migration completed successfully'
    })

  } catch (error) {
    console.error('[MIGRATION] Exception:', error)
    return NextResponse.json({
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
