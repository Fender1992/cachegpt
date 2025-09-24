import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

// Store for temporary session data (in production, use Redis)
const captureResults = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey, error, sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Store the result for the CLI to poll
    const result = {
      success: !error,
      provider,
      apiKey: apiKey || null,
      error: error || null,
      timestamp: Date.now()
    };

    captureResults.set(sessionId, result);

    // Clean up old results (older than 5 minutes)
    for (const [key, value] of captureResults.entries()) {
      if (Date.now() - value.timestamp > 5 * 60 * 1000) {
        captureResults.delete(key);
      }
    }

    // If we have an API key, also save to database
    if (apiKey && !error) {
      try {
        // Get user from session token if available
        const authHeader = request.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.substring(7);

          // Verify token and get user (simplified)
          const { data: { user } } = await supabase.auth.getUser(token);

          if (user) {
            // Save captured API key
            await supabase
              .from('user_provider_credentials')
              .upsert({
                user_id: user.id,
                provider,
                user_email: user.email || '',
                key_name: `${provider}_api_key`,
                api_key: btoa(apiKey), // Base64 encode for security
                status: 'ready',
                auto_captured: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'user_id,provider'
              });
          }
        }
      } catch (dbError) {
        console.error('Failed to save captured key to database:', dbError);
        // Don't fail the request - the key is still captured for CLI use
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Key capture error:', error);
    return NextResponse.json(
      { error: error.message || 'Key capture failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const result = captureResults.get(sessionId);

    if (!result) {
      return NextResponse.json(
        { waiting: true, message: 'Waiting for key capture...' }
      );
    }

    // Remove the result after retrieving it
    captureResults.delete(sessionId);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Key capture polling error:', error);
    return NextResponse.json(
      { error: error.message || 'Polling failed' },
      { status: 500 }
    );
  }
}