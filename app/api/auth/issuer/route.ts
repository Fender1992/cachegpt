import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({
      error: 'Authentication not configured'
    }, { status: 500 });
  }

  // Construct Supabase GoTrue endpoints
  const authUrl = `${supabaseUrl}/auth/v1`;

  const metadata = {
    issuer: supabaseUrl,
    authorization_endpoint: `${authUrl}/authorize`,
    token_endpoint: `${authUrl}/token`,
    userinfo_endpoint: null, // Will use our /api/me endpoint
    jwks_uri: `${authUrl}/.well-known/jwks.json`,
    revocation_endpoint: `${authUrl}/logout`,
    device_authorization_endpoint: null, // Supabase doesn't support device flow
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    response_types_supported: ['code', 'token'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'password'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none']
  };

  return NextResponse.json(metadata);
}