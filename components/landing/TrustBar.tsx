'use client';

export default function TrustBar() {
  const providers = [
    { name: 'OpenAI', icon: '🤖' },
    { name: 'Claude', icon: '🧠' },
    { name: 'Gemini', icon: '✨' },
    { name: 'Perplexity', icon: '⚡' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-6">
            Powered by leading AI models
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {providers.map((provider) => (
              <div
                key={provider.name}
                className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                <span className="text-2xl">{provider.icon}</span>
                <span className="font-semibold">{provider.name}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            Used by developers worldwide · Smart caching saves up to 80% on costs
          </p>
        </div>
      </div>
    </div>
  );
}
