import type { Metadata } from 'next';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Changelog - CacheGPT',
  description: 'Latest updates and improvements to CacheGPT',
};

export default function ChangelogPage() {
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Changelog
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-12">
          See what's new in CacheGPT
        </p>

        {/* February 2026 */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              February 2026
            </h2>
            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-full">
              Major Update
            </span>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🎓 Guided Tour for New Users
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                First-time users are now greeted with an interactive guided tour that walks through key features and gets you productive fast.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🔗 8 Third-Party Integrations
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Connect your favorite tools: Discord, Gmail, Slack, Microsoft Teams, Google Calendar, Notion, Google Drive, and Jira.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                📄 File Upload & Document Analysis
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Upload and analyze PDFs, DOCX, XLSX, and images directly in your conversations.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🔗 Conversation Sharing
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Share conversations via public links so others can view your AI interactions.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🧠 Self-MoA Quality Mode
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Mixture of Agents mode synthesizes responses from multiple models for higher-quality answers.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                💻 Command-Line Interface
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Use the <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">cachegpt</code> CLI to chat with AI directly from your terminal.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                ⚡ Message Action Bar
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Copy, regenerate, and provide feedback on AI responses with the new message action bar.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🔍 Command Palette
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Press Cmd+K to quickly navigate, search conversations, and access features instantly.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                📐 Sidebar Layout & Integrations Dock
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                New sidebar layout with a dedicated integrations dock for quick access to connected services.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🔒 Debug Logging Cleanup
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Removed verbose debug logging from production builds for improved security and performance.
              </p>
            </div>
          </div>
        </div>

        {/* December 2025 */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              December 2025
            </h2>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                💬 Microsoft Teams Integration
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Connect Microsoft Teams to bring your team conversations and channels into CacheGPT.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                📁 Google Drive File Management
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Browse, search, and manage your Google Drive files directly from CacheGPT.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                📋 Jira Project Tracking
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Integrate Jira to view and manage project issues and track progress without leaving CacheGPT.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🔄 Discord Auto-Reconnect
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Discord integration now automatically reconnects on transient connection failures for uninterrupted access.
              </p>
            </div>
          </div>
        </div>

        {/* October 2025 */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              October 2025
            </h2>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🎨 New Casual UI
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Redesigned landing page and chat interface for a more user-friendly experience.
                Now easier than ever to get started!
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🎯 AI Modes
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Pre-built AI assistants for common tasks: Code Helper, Creative Writer, Study Buddy, and more.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🎨 Theme System
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Choose from 4 beautiful themes: Light, Dark, Solarized, and Neon. Customize your experience!
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                📊 Dashboard
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Track your chat activity, cache hits, and unlock achievements as you use CacheGPT.
              </p>
            </div>
          </div>
        </div>

        {/* September 2025 */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              September 2025
            </h2>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🚀 Initial Launch
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                CacheGPT goes live with LLM caching, multiple AI providers, and CLI support.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
          <p className="text-purple-800 dark:text-purple-200">
            💡 Have a feature request? Let us know through our{' '}
            <a href="/support" className="underline font-semibold">
              support page
            </a>!
          </p>
        </div>
      </div>
      </div>
    </>
  );
}
