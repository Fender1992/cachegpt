import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

interface SharedAnswer {
  id: string;
  slug: string;
  prompt: string;
  content_md: string;
  created_at: string;
  expires_at: string | null;
  view_count: number;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Generate metadata for OG preview
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const share = await getSharedAnswer(slug);

  if (!share) {
    return {
      title: 'Share Not Found - CacheGPT',
    };
  }

  const title = share.prompt.length > 60
    ? share.prompt.substring(0, 60) + '...'
    : share.prompt;

  const description = share.content_md.length > 160
    ? share.content_md.substring(0, 160) + '...'
    : share.content_md;

  return {
    title: `${title} - CacheGPT`,
    description,
    openGraph: {
      title,
      description,
      url: `https://cachegpt.app/a/${slug}`,
      siteName: 'CacheGPT',
      type: 'article',
      images: [
        {
          url: `https://cachegpt.app/a/${slug}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
  };
}

/**
 * Fetch shared answer from database
 */
async function getSharedAnswer(slug: string): Promise<SharedAnswer | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data, error } = await supabase
    .from('shared_answers')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  if (error || !data) {
    return null;
  }

  // Check if expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Increment view count
  await supabase
    .from('shared_answers')
    .update({ view_count: data.view_count + 1 })
    .eq('slug', slug);

  return data;
}

/**
 * Public share page component
 */
export default async function SharedAnswerPage({ params }: PageProps) {
  const { slug } = await params;
  const share = await getSharedAnswer(slug);

  if (!share) {
    notFound();
  }

  const prefillUrl = `/chat?prefill=${encodeURIComponent(share.prompt)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-900 dark:text-white">CacheGPT</span>
          </Link>

          <Link
            href={prefillUrl}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Try this prompt →
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Prompt Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">💬</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Prompt</h3>
              <p className="text-lg text-gray-900 dark:text-white">{share.prompt}</p>
            </div>
          </div>
        </div>

        {/* Answer Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🤖</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">AI Response</h3>
            </div>
          </div>

          <div className="prose prose-gray dark:prose-invert max-w-none">
            <ReactMarkdown>{share.content_md}</ReactMarkdown>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 text-center">
          <Link
            href={prefillUrl}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <span>Try this prompt on CacheGPT</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Free AI chat with smart caching • {share.view_count} views
          </p>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Shared from{' '}
            <Link href="/" className="text-purple-600 dark:text-purple-400 hover:underline">
              CacheGPT
            </Link>
            {share.expires_at && (
              <span> • Expires {new Date(share.expires_at).toLocaleDateString()}</span>
            )}
          </p>
        </footer>
      </main>
    </div>
  );
}
