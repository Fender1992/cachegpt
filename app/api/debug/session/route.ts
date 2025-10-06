import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    return NextResponse.json({
      hasSession: !!session,
      sessionError: error?.message || null,
      userId: session?.user?.id || null,
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
