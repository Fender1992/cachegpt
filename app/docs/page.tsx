import { redirect } from 'next/navigation'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Book, Command, Key, Database, Shield, Zap, Terminal, Settings, HelpCircle } from 'lucide-react'
import Link from 'next/link'

export default async function DocsPage() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const sections = [
    {
      title: 'Quick Start',
      icon: <Zap className="w-5 h-5" />,
      commands: [
        { cmd: 'npm install -g cachegpt-cli', desc: 'Install CacheGPT CLI' },
        { cmd: 'cachegpt login', desc: 'Create account or login' },
        { cmd: 'cachegpt chat', desc: 'Start chatting - no API keys needed!' }
      ]
    },
    {
      title: 'Authentication',
      icon: <Shield className="w-5 h-5" />,
      commands: [
        { cmd: 'cachegpt login', desc: 'Login or create account' },
        { cmd: 'cachegpt logout', desc: 'Logout from all accounts' },
        { cmd: 'cachegpt auth-status', desc: 'Check authentication status' }
      ]
    },
    {
      title: 'Chat Commands',
      icon: <Terminal className="w-5 h-5" />,
      commands: [
        { cmd: 'cachegpt chat', desc: 'Free AI chat with smart caching' },
        { cmd: 'cachegpt claude', desc: 'Direct Claude chat (needs API key)' },
        { cmd: 'cachegpt free', desc: 'Alias for chat command' }
      ]
    },
    {
      title: 'API Key Management',
      icon: <Key className="w-5 h-5" />,
      commands: [
        { cmd: 'cachegpt api-keys add', desc: 'Add your API key' },
        { cmd: 'cachegpt api-keys view', desc: 'View configured keys' },
        { cmd: 'cachegpt api-keys test', desc: 'Test if keys are working' },
        { cmd: 'cachegpt api-keys remove', desc: 'Remove an API key' }
      ]
    },
    {
      title: 'Cache Management',
      icon: <Database className="w-5 h-5" />,
      commands: [
        { cmd: 'cachegpt stats', desc: 'Show cache statistics' },
        { cmd: 'cachegpt clear --all', desc: 'Clear all cache entries' },
        { cmd: 'cachegpt clear --older-than 30', desc: 'Clear old entries' }
      ]
    },
    {
      title: 'Configuration',
      icon: <Settings className="w-5 h-5" />,
      commands: [
        { cmd: 'cachegpt init', desc: 'Initialize configuration' },
        { cmd: 'cachegpt config --show', desc: 'Display configuration' },
        { cmd: 'cachegpt config --reset', desc: 'Reset to defaults' }
      ]
    },
    {
      title: 'Models & Templates',
      icon: <Book className="w-5 h-5" />,
      commands: [
        { cmd: 'cachegpt models list', desc: 'List available models' },
        { cmd: 'cachegpt templates list', desc: 'Show prompt templates' },
        { cmd: 'cachegpt templates use code-review', desc: 'Use code review template' }
      ]
    },
    {
      title: 'Testing & Help',
      icon: <HelpCircle className="w-5 h-5" />,
      commands: [
        { cmd: 'cachegpt test --all', desc: 'Test all systems' },
        { cmd: 'cachegpt version', desc: 'Check version' },
        { cmd: 'cachegpt --help', desc: 'Show help for any command' }
      ]
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            CacheGPT Command Reference
          </h1>
          <p className="text-gray-300 text-lg">
            Complete guide to all CLI commands and features
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              href="/chat"
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              Back to Chat
            </Link>
            <Link
              href="/settings"
              className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
            >
              Settings
            </Link>
          </div>
        </div>

        {/* Installation Card */}
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 mb-8 border border-purple-500/20">
          <h2 className="text-xl font-semibold text-white mb-4">Installation</h2>
          <div className="bg-black/50 rounded-lg p-4 font-mono text-sm">
            <span className="text-green-400">$</span>{' '}
            <span className="text-white">npm install -g cachegpt-cli</span>
          </div>
          <p className="text-gray-400 mt-3 text-sm">
            Requires Node.js 16+ • Current version: v11.1.19
          </p>
        </div>

        {/* Command Sections */}
        <div className="grid md:grid-cols-2 gap-6">
          {sections.map((section, idx) => (
            <div
              key={idx}
              className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-purple-500/20"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-600/20 rounded-lg text-purple-400">
                  {section.icon}
                </div>
                <h2 className="text-xl font-semibold text-white">
                  {section.title}
                </h2>
              </div>
              <div className="space-y-3">
                {section.commands.map((cmd, cmdIdx) => (
                  <div
                    key={cmdIdx}
                    className="bg-black/30 rounded-lg p-3 hover:bg-black/40 transition"
                  >
                    <code className="text-sm text-green-400 font-mono block mb-1">
                      {cmd.cmd}
                    </code>
                    <p className="text-xs text-gray-400">{cmd.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Tips Section */}
        <div className="mt-8 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-xl p-6 border border-purple-500/30">
          <h2 className="text-xl font-semibold text-white mb-4">💡 Pro Tips</h2>
          <ul className="space-y-2 text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">•</span>
              <span>Use templates for common tasks like code review and debugging</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">•</span>
              <span>Cached responses are instant and free - ask the same question twice!</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">•</span>
              <span>Add your own API keys for unlimited premium model access</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">•</span>
              <span>Run any command with --help for detailed options</span>
            </li>
          </ul>
        </div>

        {/* Support Section */}
        <div className="mt-8 text-center text-gray-400">
          <p className="mb-2">Need help? Check out our resources:</p>
          <div className="flex justify-center gap-6 text-sm">
            <a
              href="https://github.com/cachegpt/cachegpt-cli"
              className="hover:text-purple-400 transition"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              href="mailto:support@cachegpt.io"
              className="hover:text-purple-400 transition"
            >
              Email Support
            </a>
            <Link href="/settings" className="hover:text-purple-400 transition">
              API Keys Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}