import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
);

// Generate a secure API key
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  return `cgpt_sk_${randomBytes.toString('hex')}`;
}

// Hash API key for storage
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// GET /api/api-keys - List user's API keys
export async function GET(req: NextRequest) {
  try {
    // Get user from session
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user's API keys
    const { data: apiKeys, error } = await supabase
      .from('cachegpt_api_keys')
      .select('id, key_name, key_prefix, is_active, created_at, last_used_at, usage_count, expires_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching API keys:', error);
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }

    return NextResponse.json({ apiKeys: apiKeys || [] });
  } catch (error: any) {
    console.error('API keys GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/api-keys - Create new API key
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { keyName, expiresInDays } = body;

    if (!keyName || keyName.trim().length === 0) {
      return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
    }

    // Generate new API key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 16); // Store first 16 chars for identification

    // Calculate expiration if provided
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expiresInDays);
      expiresAt = expiryDate.toISOString();
    }

    // Insert into database
    const { data, error } = await supabase
      .from('cachegpt_api_keys')
      .insert({
        user_id: user.id,
        key_name: keyName.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
        expires_at: expiresAt,
        is_active: true,
      })
      .select('id, key_name, key_prefix, created_at, expires_at')
      .single();

    if (error) {
      console.error('Error creating API key:', error);
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    // Return the full API key ONCE (never stored or shown again)
    return NextResponse.json({
      apiKey: apiKey, // Full key - user must save this!
      keyInfo: data,
      message: 'API key created successfully. Save this key now - it will not be shown again!'
    });
  } catch (error: any) {
    console.error('API keys POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/api-keys/:id - Revoke API key
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const keyId = url.searchParams.get('id');

    if (!keyId) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    // Delete the API key (RLS ensures user can only delete their own keys)
    const { error } = await supabase
      .from('cachegpt_api_keys')
      .delete()
      .eq('id', keyId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting API key:', error);
      return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
    }

    return NextResponse.json({ message: 'API key deleted successfully' });
  } catch (error: any) {
    console.error('API keys DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
