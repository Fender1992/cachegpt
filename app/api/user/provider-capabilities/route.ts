import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface ProviderCapability {
  provider: string;
  hasApiKey: boolean;
}

/**
 * GET /api/user/provider-capabilities
 * Returns which providers the authenticated user has configured
 * WITHOUT exposing actual API key values to the browser
 */
export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      // Not authenticated - return only 'auto' provider
      return NextResponse.json({
        providers: [{ provider: 'auto', hasApiKey: false }]
      });
    }

    const token = authHeader.substring(7);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      // Auth failed - return only 'auto' provider
      return NextResponse.json({
        providers: [{ provider: 'auto', hasApiKey: false }]
      });
    }

    // Fetch ONLY provider name and whether api_key is set
    // Never fetch the actual api_key value
    const { data: credentials, error: fetchError } = await supabase
      .from('user_provider_credentials')
      .select('provider, status, is_active')
      .eq('user_id', user.id)
      .or('status.eq.ready,is_active.eq.true')
      .not('api_key', 'is', null);

    if (fetchError) {
      console.error('[PROVIDER-CAPABILITIES] Error:', fetchError);
      return NextResponse.json({
        providers: [{ provider: 'auto', hasApiKey: false }]
      });
    }

    // Build provider list (never include api_key values)
    const providerList: ProviderCapability[] = [
      { provider: 'auto', hasApiKey: false }
    ];

    if (credentials && credentials.length > 0) {
      const providerMap: Record<string, string> = {
        'claude': 'anthropic',
        'chatgpt': 'openai',
        'gemini': 'google',
        'perplexity': 'perplexity'
      };

      credentials.forEach((cred) => {
        const providerKey = providerMap[cred.provider] || cred.provider;
        if (!providerList.find(p => p.provider === providerKey)) {
          providerList.push({ provider: providerKey, hasApiKey: true });
        }
      });
    }

    return NextResponse.json({ providers: providerList });

  } catch (error: any) {
    console.error('[PROVIDER-CAPABILITIES] Error:', error);
    return NextResponse.json({
      providers: [{ provider: 'auto', hasApiKey: false }]
    }, { status: 500 });
  }
}
