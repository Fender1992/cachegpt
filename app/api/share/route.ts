import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthentication, getUserId, isAuthError } from '@/lib/unified-auth-resolver';
import { isFeatureEnabled } from '@/lib/featureFlags';

/**
 * POST /api/share
 * Create a shareable public answer page
 *
 * Body:
 * {
 *   prompt: string,
 *   contentMd: string,
 *   isGuest?: boolean
 * }
 *
 * Returns:
 * {
 *   url: string,        // /a/{slug}
 *   slug: string,
 *   expiresAt?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check feature flag
    const enabled = await isFeatureEnabled('share_answer_enabled');
    if (!enabled) {
      return NextResponse.json(
        { error: 'Feature not available' },
        { status: 403 }
      );
    }

    // Authenticate (allow guests)
    const session = await resolveAuthentication(request);
    const userId = !isAuthError(session) ? getUserId(session) : null;

    const body = await request.json();
    const { prompt, contentMd, isGuest } = body;

    // Validate input
    if (!prompt || !contentMd) {
      return NextResponse.json(
        { error: 'Missing prompt or content' },
        { status: 400 }
      );
    }

    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: 'Prompt too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    if (contentMd.length > 50000) {
      return NextResponse.json(
        { error: 'Content too long (max 50KB)' },
        { status: 400 }
      );
    }

    // Basic profanity/abuse check (simple keyword filter)
    const sanitizedPrompt = sanitizeText(prompt);
    const sanitizedContent = sanitizeMarkdown(contentMd);

    // Generate unique slug
    const slug = generateSlug();

    // Calculate expiration (30 days for guests, none for authenticated)
    const expiresAt = isGuest || !userId
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      : null;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Insert share
    const { data, error } = await supabase
      .from('shared_answers')
      .insert({
        slug,
        owner: userId,
        prompt: sanitizedPrompt,
        content_md: sanitizedContent,
        expires_at: expiresAt?.toISOString(),
        is_public: true,
      })
      .select('slug, expires_at')
      .single();

    if (error) {
      console.error('[SHARE-API] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create share' },
        { status: 500 }
      );
    }

    console.log(`[SHARE-API] Created share: ${slug} (user: ${userId || 'guest'}, expires: ${expiresAt || 'never'})`);

    return NextResponse.json({
      url: `/a/${data.slug}`,
      slug: data.slug,
      expiresAt: data.expires_at,
    });

  } catch (error: any) {
    console.error('[SHARE-API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate URL-safe slug (6-12 characters)
 */
function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const length = 8 + Math.floor(Math.random() * 5); // 8-12 chars
  let slug = '';

  for (let i = 0; i < length; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }

  return slug;
}

/**
 * Sanitize text (remove potential XSS, profanity check)
 */
function sanitizeText(text: string): string {
  // Remove script tags, event handlers, etc.
  let sanitized = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');

  // Simple profanity filter (extend as needed)
  const profanityList = ['spam', 'scam']; // Minimal list for demo
  profanityList.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '***');
  });

  return sanitized.trim();
}

/**
 * Sanitize markdown (strip dangerous HTML/JS)
 */
function sanitizeMarkdown(markdown: string): string {
  // Remove script tags
  let sanitized = markdown
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');

  // Remove data URIs (potential XSS)
  sanitized = sanitized.replace(/data:text\/html[^"'\s>]*/gi, '');

  return sanitized.trim();
}
