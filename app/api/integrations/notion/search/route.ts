/**
 * Notion Search API
 * GET: Search across Notion pages and databases
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidNotionToken } from '@/lib/notion/notion-token';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'notion')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Notion not connected' }, { status: 404 });
    }

    const token = await getValidNotionToken(
      integration.id,
      integration.access_token
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const filter = searchParams.get('filter'); // 'page' or 'database'
    const pageSize = searchParams.get('pageSize') || '10';

    const body: any = {
      query,
      page_size: parseInt(pageSize),
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    };

    if (filter === 'page' || filter === 'database') {
      body.filter = { property: 'object', value: filter };
    }

    const searchRes = await fetch(`${NOTION_API}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!searchRes.ok) {
      return NextResponse.json({ error: 'Failed to search Notion' }, { status: searchRes.status });
    }

    const searchData = await searchRes.json();

    const results = (searchData.results || []).map((item: any) => {
      const isDatabase = item.object === 'database';
      return {
        id: item.id,
        type: item.object,
        title: isDatabase ? extractDatabaseTitle(item) : extractPageTitle(item),
        icon: item.icon?.emoji || item.icon?.external?.url || null,
        lastEditedTime: item.last_edited_time,
        url: item.url,
      };
    });

    return NextResponse.json({
      results,
      nextCursor: searchData.next_cursor || null,
      hasMore: searchData.has_more || false,
    });
  } catch (error) {
    console.error('[Notion Search] Error:', error);
    return NextResponse.json(
      { error: 'Failed to search Notion' },
      { status: 500 }
    );
  }
}

function extractPageTitle(page: any): string {
  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title' && prop.title?.length > 0) {
      return prop.title.map((t: any) => t.plain_text).join('');
    }
  }
  return 'Untitled';
}

function extractDatabaseTitle(db: any): string {
  if (db.title?.length > 0) {
    return db.title.map((t: any) => t.plain_text).join('');
  }
  return 'Untitled Database';
}
