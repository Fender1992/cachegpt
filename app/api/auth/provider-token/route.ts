import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const { code, provider, state } = await request.json();

    if (!code || !provider || !state) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Parse and validate state
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid state parameter' },
        { status: 400 }
      );
    }

    // Exchange authorization code for tokens
    let tokenData;

    if (provider === 'google') {
      tokenData = await exchangeGoogleCode(code);
    } else {
      return NextResponse.json(
        { error: `Provider ${provider} not supported yet` },
        { status: 400 }
      );
    }

    // Return the tokens (will be saved by the client)
    return NextResponse.json({
      success: true,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      provider: provider
    });

  } catch (error: any) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: error.message || 'Token exchange failed' },
      { status: 500 }
    );
  }
}

async function exchangeGoogleCode(code: string) {
  const tokenEndpoint = 'https://oauth2.googleapis.com/token';

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/provider-callback`,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Google token exchange failed: ${errorData.error_description || errorData.error}`);
  }

  return response.json();
}