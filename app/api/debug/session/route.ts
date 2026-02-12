import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    return NextResponse.json({
      hasSession: !!user,
      sessionError: error?.message || null,
      userId: user?.id || null,
      cookieCount: allCookies.length,
      cookies: allCookies.map(c => ({ name: c.name, hasValue: !!c.value })),
      supabaseConfigured: {
        url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      error: 'Debug endpoint error',
      details: error.message
    }, { status: 500 });
  }
}
