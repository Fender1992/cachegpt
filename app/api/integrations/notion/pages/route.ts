/**
 * Notion Pages API
 * GET: Fetch pages and databases accessible to the integration
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
    const pageId = searchParams.get('pageId');
    const cursor = searchParams.get('cursor') || undefined;
    const pageSize = searchParams.get('pageSize') || '20';

    // If pageId is specified, fetch the specific page content
    if (pageId) {
      // Get page metadata
      const pageRes = await fetch(`${NOTION_API}/pages/${pageId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
        },
      });

      if (!pageRes.ok) {
        return NextResponse.json({ error: 'Failed to fetch page' }, { status: pageRes.status });
      }

      const page = await pageRes.json();

      // Get page content (blocks)
      const blocksRes = await fetch(`${NOTION_API}/blocks/${pageId}/children?page_size=100`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
        },
      });

      const blocksData = blocksRes.ok ? await blocksRes.json() : { results: [] };

      return NextResponse.json({
        page: {
          id: page.id,
          title: extractPageTitle(page),
          icon: page.icon?.emoji || page.icon?.external?.url || null,
          cover: page.cover?.external?.url || page.cover?.file?.url || null,
          lastEditedTime: page.last_edited_time,
          createdTime: page.created_time,
          url: page.url,
        },
        blocks: (blocksData.results || []).map(formatBlock),
      });
    }

    // List pages via search
    const body: any = {
      page_size: parseInt(pageSize),
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    };
    if (cursor) body.start_cursor = cursor;

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
      return NextResponse.json({ error: 'Failed to search pages' }, { status: searchRes.status });
    }

    const searchData = await searchRes.json();

    const items = (searchData.results || []).map((item: any) => ({
      id: item.id,
      type: item.object, // 'page' or 'database'
      title: item.object === 'database'
        ? extractDatabaseTitle(item)
        : extractPageTitle(item),
      icon: item.icon?.emoji || item.icon?.external?.url || null,
      lastEditedTime: item.last_edited_time,
      url: item.url,
    }));

    return NextResponse.json({
      items,
      nextCursor: searchData.next_cursor || null,
      hasMore: searchData.has_more || false,
    });
  } catch (error) {
    console.error('[Notion Pages] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Notion pages' },
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

function formatBlock(block: any): any {
  const type = block.type;
  let content = '';

  if (block[type]?.rich_text) {
    content = block[type].rich_text.map((t: any) => t.plain_text).join('');
  } else if (block[type]?.text) {
    content = block[type].text;
  }

  return {
    id: block.id,
    type,
    content,
    hasChildren: block.has_children || false,
  };
}
