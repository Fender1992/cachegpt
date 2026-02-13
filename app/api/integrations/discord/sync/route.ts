/**
 * Discord Sync API
 * Manually trigger Discord message sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { syncDiscordMessages } from '@/lib/integrations/discord-adapter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Support both authenticated user sync and webhook-triggered sync
    let userId: string;
    let integrationId: string;
    
    // Check for webhook header (from OAuth callback)
    const webhookIntegrationId = req.headers.get('X-Integration-Id');
    
    if (webhookIntegrationId) {
      // Webhook-triggered sync
      integrationId = webhookIntegrationId;
      
      // Get user ID from integration
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('user_id')
        .eq('id', integrationId)
        .single();
      
      if (!integration) {
        return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
      }
      
      userId = integration.user_id;
    } else {
      // User-triggered sync
      const authResult = await resolveAuthentication(req);
      if (isAuthError(authResult)) {
        return NextResponse.json({ error: authResult.error }, { status: 401 });
      }
      userId = authResult.user.id;
      
      // Get integration ID for user
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'discord')
        .single();
      
      if (!integration) {
        return NextResponse.json({ error: 'No Discord integration found' }, { status: 404 });
      }
      
      integrationId = integration.id;
    }
    
    // Check if already syncing
    const { data: currentIntegration } = await supabase
      .from('user_integrations')
      .select('status, access_token')
      .eq('id', integrationId)
      .single();
    
    if (!currentIntegration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }
    
    if (currentIntegration.status === 'syncing') {
      return NextResponse.json({ 
        message: 'Sync already in progress',
        status: 'syncing' 
      });
    }
    
    if (!currentIntegration.access_token) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }
    
    // Start sync in background
    syncDiscordMessages(userId, integrationId, currentIntegration.access_token)
      .then(result => {
        console.log('[Discord Sync] Completed:', result);
      })
      .catch(async (error) => {
        console.error('[Discord Sync] Failed:', error);
        // Reset status so user isn't stuck in 'syncing' forever
        try {
          await supabase
            .from('user_integrations')
            .update({
              status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('id', integrationId);
        } catch (dbError) {
          console.error('[Discord Sync] Failed to reset status:', dbError);
        }
      });
    
    return NextResponse.json({ 
      message: 'Discord sync started',
      status: 'syncing' 
    });
  } catch (error) {
    console.error('[Discord Sync] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start Discord sync' },
      { status: 500 }
    );
  }
}