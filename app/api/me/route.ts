import { NextRequest, NextResponse } from 'next/server';
import {
  resolveAuthentication,
  isUnifiedSession,
  isAuthError,
  logAuthMethodUsage
} from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Use unified authentication resolver
    const authResult = await resolveAuthentication(request);

    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const session = authResult as any;
    logAuthMethodUsage(session, '/api/me');

    // Get additional user profile data using service key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    // Return UserInfo format
    const userInfo = {
      sub: session.user.id,
      email: session.user.email,
      email_verified: !!session.user.email_verified_at || !!session.user.email_confirmed_at,
      name: profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name,
      picture: profile?.avatar_url || session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
      preferred_username: session.user.email?.split('@')[0],
      updated_at: profile?.updated_at || session.user.updated_at,
      // Add session health info
      session_expires_at: session.expiresAt,
      auth_method: session.authMethod
    };

    return NextResponse.json(userInfo);
  } catch (error: any) {
    console.error('User info endpoint error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}