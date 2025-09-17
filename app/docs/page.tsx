'use client'

import Link from 'next/link'
import { ArrowLeft, Terminal, Code, Database, Zap, Book, GitHub } from 'lucide-react'

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="flex items-center space-x-2 text-gray-600 hover:text-purple-600 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-xl font-bold">Documentation</h1>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">CacheGPT Documentation</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Everything you need to get started with intelligent LLM caching
          </p>
        </div>

        {/* Quick Start Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-lg p-6 shadow-sm border hover:shadow-md transition">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Quick Start</h3>
            <p className="text-gray-600 text-sm mb-4">
              Get up and running with CacheGPT in under 5 minutes
            </p>
            <Link href="/dashboard" className="text-purple-600 hover:text-purple-700 text-sm font-medium">
              Get Started →
            </Link>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border hover:shadow-md transition">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Terminal className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">CLI Tool</h3>
            <p className="text-gray-600 text-sm mb-4">
              Use the command-line interface for testing and management
            </p>
            <div className="text-gray-400 text-sm">
              Coming soon →
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border hover:shadow-md transition">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <Code className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">API Reference</h3>
            <p className="text-gray-600 text-sm mb-4">
              Complete API documentation and examples
            </p>
            <div className="text-gray-400 text-sm">
              Coming soon →
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h3 className="font-semibold mb-4">Getting Started</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="#overview" className="text-gray-600 hover:text-purple-600">Overview</Link></li>
                <li><Link href="#setup" className="text-gray-600 hover:text-purple-600">Setup</Link></li>
                <li><Link href="#configuration" className="text-gray-600 hover:text-purple-600">Configuration</Link></li>
              </ul>

              <h3 className="font-semibold mb-4 mt-6">Features</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="#caching" className="text-gray-600 hover:text-purple-600">Intelligent Caching</Link></li>
                <li><Link href="#semantic" className="text-gray-600 hover:text-purple-600">Semantic Search</Link></li>
                <li><Link href="#analytics" className="text-gray-600 hover:text-purple-600">Analytics</Link></li>
              </ul>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg p-8 shadow-sm border">
              <div id="overview" className="mb-8">
                <h2 className="text-2xl font-bold mb-4">Overview</h2>
                <p className="text-gray-600 mb-4">
                  CacheGPT is an intelligent caching layer for Large Language Model APIs that can reduce costs by up to 80%
                  while improving response times to under 10ms. It uses both exact matching and semantic similarity to
                  identify cached responses.
                </p>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                  <p className="text-purple-800 text-sm">
                    <strong>✨ New:</strong> CacheGPT is now completely free and open source! No limits, no subscriptions.
                  </p>
                </div>
              </div>

              <div id="setup" className="mb-8">
                <h2 className="text-2xl font-bold mb-4">Quick Setup</h2>
                <ol className="list-decimal list-inside space-y-3 text-gray-600">
                  <li>Sign up for a free account on the <Link href="/dashboard" className="text-purple-600 hover:underline">dashboard</Link></li>
                  <li>Generate your API key in the dashboard</li>
                  <li>Replace your OpenAI/Anthropic endpoint with our proxy URL</li>
                  <li>Start saving on API costs immediately!</li>
                </ol>
              </div>

              <div id="configuration" className="mb-8">
                <h2 className="text-2xl font-bold mb-4">Configuration</h2>
                <p className="text-gray-600 mb-4">
                  CacheGPT works as a drop-in replacement for your existing LLM API calls. Simply change your endpoint:
                </p>
                <div className="bg-gray-100 rounded-lg p-4">
                  <code className="text-sm">
                    # Instead of: https://api.openai.com/v1/chat/completions<br/>
                    # Use: https://your-cache-endpoint.com/v1/chat/completions
                  </code>
                </div>
              </div>

              <div className="border-t pt-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">Need more help?</h3>
                    <p className="text-gray-600 text-sm">Check out our GitHub repository for complete documentation and examples.</p>
                  </div>
                  <a
                    href="https://github.com/cachegpt/cachegpt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition"
                  >
                    <GitHub className="w-4 h-4" />
                    <span>View on GitHub</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}