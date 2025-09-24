import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authorization header for Bearer token
    const authHeader = request.headers.get('Authorization');

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Validate token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Get additional user profile data
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      // Return UserInfo format
      const userInfo = {
        sub: user.id,
        email: user.email,
        email_verified: user.email_confirmed_at ? true : false,
        name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name,
        picture: profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture,
        preferred_username: user.email?.split('@')[0],
        updated_at: profile?.updated_at || user.updated_at
      };

      return NextResponse.json(userInfo);
    }

    // Fallback to session cookie
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get additional user profile data
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    // Return UserInfo format
    const userInfo = {
      sub: session.user.id,
      email: session.user.email,
      email_verified: session.user.email_confirmed_at ? true : false,
      name: profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name,
      picture: profile?.avatar_url || session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
      preferred_username: session.user.email?.split('@')[0],
      updated_at: profile?.updated_at || session.user.updated_at
    };

    return NextResponse.json(userInfo);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}