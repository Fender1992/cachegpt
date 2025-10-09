import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const alt = 'Shared Answer - CacheGPT';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Generate OpenGraph image for shared answer
 */
export default async function Image({ params }: Props) {
  const { slug } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Fetch share data
  const { data: share } = await supabase
    .from('shared_answers')
    .select('prompt, content_md')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  const prompt = share?.prompt || 'Shared Answer';
  const truncatedPrompt = prompt.length > 120
    ? prompt.substring(0, 120) + '...'
    : prompt;

  const preview = share?.content_md
    ? share.content_md.substring(0, 200).replace(/[#*`]/g, '') + '...'
    : '';

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: 60,
        }}
      >
        {/* Logo */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              background: 'white',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 'bold',
              color: '#667eea',
            }}
          >
            C
          </div>
          <span
            style={{
              fontSize: 32,
              fontWeight: 'bold',
              color: 'white',
            }}
          >
            CacheGPT
          </span>
        </div>

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 24,
            padding: 48,
            width: '100%',
            maxWidth: 1000,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Prompt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 36 }}>💬</span>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#64748b',
                }}
              >
                Prompt
              </span>
            </div>
            <p
              style={{
                fontSize: 32,
                fontWeight: 600,
                color: '#1e293b',
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {truncatedPrompt}
            </p>
          </div>

          {/* Preview */}
          {preview && (
            <div
              style={{
                fontSize: 22,
                color: '#475569',
                lineHeight: 1.6,
                borderLeft: '4px solid #667eea',
                paddingLeft: 24,
              }}
            >
              {preview}
            </div>
          )}

          {/* CTA */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 12,
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Try this prompt →
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'white',
            fontSize: 18,
            opacity: 0.9,
          }}
        >
          <span>Free AI chat with smart caching</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
