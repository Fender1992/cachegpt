import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

// GET /api/user/model-preferences - Get user's model preferences (ONLY their own)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform') || 'web'

    // Create Supabase client with user session
    const cookieStore = cookies()
    const supabase = await createClient({ cookies: () => cookieStore })

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    const userId = session.user.id

    // Get user's model preferences - ONLY for this user
    const { data: preferences, error } = await supabase
      .from('user_model_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)

    if (error) {
      console.error('Error fetching model preferences for user:', userId, error)
      return NextResponse.json({ error: 'Failed to fetch model preferences' }, { status: 500 })
    }

    return NextResponse.json({
      preferences: preferences || [],
      user_id: userId,
      platform
    })
  } catch (error) {
    console.error('Error in model preferences API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/user/model-preferences - Set user's model preference for a provider
export async function POST(request: NextRequest) {
  try {
    const { provider, preferred_model, is_premium, platform = 'web' } = await request.json()

    if (!provider || !preferred_model) {
      return NextResponse.json({
        error: 'Provider and preferred_model are required'
      }, { status: 400 })
    }

    // Create Supabase client with user session
    const cookieStore = cookies()
    const supabase = await createClient({ cookies: () => cookieStore })

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    const userId = session.user.id

    // Upsert user's model preference - ONLY for this user
    const { data: preference, error } = await supabase
      .from('user_model_preferences')
      .upsert([{
        user_id: userId,
        provider,
        preferred_model,
        is_premium: is_premium || false,
        platform
      }], {
        onConflict: 'user_id,provider,platform'
      })
      .select()
      .single()

    if (error) {
      console.error('Error setting model preference for user:', userId, error)
      return NextResponse.json({ error: 'Failed to set model preference' }, { status: 500 })
    }

    return NextResponse.json({
      preference,
      user_id: userId
    })
  } catch (error) {
    console.error('Error in model preferences POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/user/model-preferences - Remove user's model preference for a provider
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')
    const platform = searchParams.get('platform') || 'web'

    if (!provider) {
      return NextResponse.json({
        error: 'Provider parameter is required'
      }, { status: 400 })
    }

    // Create Supabase client with user session
    const cookieStore = cookies()
    const supabase = await createClient({ cookies: () => cookieStore })

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    const userId = session.user.id

    // Delete user's model preference - ONLY for this user
    const { error } = await supabase
      .from('user_model_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('platform', platform)

    if (error) {
      console.error('Error deleting model preference for user:', userId, error)
      return NextResponse.json({ error: 'Failed to delete model preference' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      provider,
      platform
    })
  } catch (error) {
    console.error('Error in model preferences DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}