import type { Metadata } from 'next';
import Link from 'next/link';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Security - CacheGPT',
  description: 'Learn about CacheGPT security practices and policies',
};

export default function SecurityPage() {
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Security
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-12">
          Your security is our top priority
        </p>

        {/* Data Encryption */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            🔒 Data Encryption
          </h2>
          <ul className="space-y-3 text-gray-700 dark:text-gray-300">
            <li>• All data is encrypted in transit using TLS 1.3</li>
            <li>• API keys are encrypted at rest using AES-256</li>
            <li>• Integration OAuth tokens are encrypted at rest</li>
            <li>• Database connections use SSL encryption</li>
            <li>• Passwords are hashed using bcrypt</li>
          </ul>
        </div>

        {/* Authentication */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            👤 Authentication
          </h2>
          <ul className="space-y-3 text-gray-700 dark:text-gray-300">
            <li>• Email/password authentication with bcrypt-hashed passwords</li>
            <li>• OAuth 2.0 with Google and GitHub</li>
            <li>• CLI authentication via browser-based OAuth flow</li>
            <li>• No passwords stored for OAuth users</li>
            <li>• Session tokens expire after 7 days</li>
            <li>• Two-factor authentication (coming soon)</li>
          </ul>
        </div>

        {/* Privacy */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            🛡️ Privacy
          </h2>
          <ul className="space-y-3 text-gray-700 dark:text-gray-300">
            <li>• We never sell your data</li>
            <li>• Your conversations are private</li>
            <li>• We don't train AI models on your data</li>
            <li>• You can delete your account anytime</li>
            <li>• Integration data (Discord messages, Gmail, Calendar events) is accessed in real-time via OAuth and not bulk stored on our servers</li>
          </ul>
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            Read our full{' '}
            <Link href="/privacy" className="text-purple-600 hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>

        {/* Compliance */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            ✅ Compliance
          </h2>
          <ul className="space-y-3 text-gray-700 dark:text-gray-300">
            <li>• GDPR compliant</li>
            <li>• CCPA compliant</li>
            <li>• SOC 2 Type II (in progress)</li>
            <li>• Regular security audits</li>
          </ul>
        </div>

        {/* Integration Security */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            🔗 Integration Security
          </h2>
          <ul className="space-y-3 text-gray-700 dark:text-gray-300">
            <li>• OAuth 2.0 used for all third-party integrations</li>
            <li>• Integration tokens stored encrypted at rest</li>
            <li>• Refresh tokens automatically rotated on expiry</li>
            <li>• Users can revoke integration access anytime from settings</li>
            <li>• Supported integrations: Discord, Gmail, Slack, Microsoft Teams, Google Calendar, Notion, Google Drive, Jira</li>
          </ul>
        </div>

        {/* Report Vulnerability */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h3 className="text-xl font-bold text-red-900 dark:text-red-200 mb-2">
            🚨 Report a Security Vulnerability
          </h3>
          <p className="text-red-800 dark:text-red-300 mb-4">
            If you discover a security issue, please report it responsibly. Do not disclose
            it publicly until we've had a chance to address it.
          </p>
          <p className="text-red-800 dark:text-red-300">
            Email:{' '}
            <a href="mailto:security@cachegpt.app" className="underline font-semibold">
              security@cachegpt.app
            </a>
          </p>
        </div>
      </div>
      </div>
    </>
  );
}
