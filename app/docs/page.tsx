'use client'

import Link from 'next/link'
import { ArrowLeft, Terminal, Code, Database, Zap, Book, Shield, Gauge, Layers, GitBranch, Key, Settings } from 'lucide-react'
import { useState } from 'react'

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview')

  const sections = {
    overview: 'Overview',
    quickstart: 'Quick Start',
    installation: 'Installation',
    configuration: 'Configuration',
    api: 'API Reference',
    cli: 'CLI Reference',
    architecture: 'Architecture',
    security: 'Security',
    performance: 'Performance',
    troubleshooting: 'Troubleshooting'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
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
            <div className="ml-auto flex items-center space-x-2">
              <span className="text-sm text-gray-500">v6.3.0</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Getting Started
              </div>
              {['overview', 'quickstart', 'installation', 'configuration'].map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    activeSection === section
                      ? 'bg-purple-50 text-purple-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {sections[section as keyof typeof sections]}
                </button>
              ))}

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-6">
                Reference
              </div>
              {['api', 'cli', 'architecture'].map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    activeSection === section
                      ? 'bg-purple-50 text-purple-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {sections[section as keyof typeof sections]}
                </button>
              ))}

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-6">
                Operations
              </div>
              {['security', 'performance', 'troubleshooting'].map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    activeSection === section
                      ? 'bg-purple-50 text-purple-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {sections[section as keyof typeof sections]}
                </button>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-4">
            <div className="prose prose-gray max-w-none">
              {/* Overview Section */}
              {activeSection === 'overview' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">CacheGPT Documentation</h1>

                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">What is CacheGPT?</h2>
                    <p className="text-gray-600 mb-4">
                      CacheGPT is an intelligent caching proxy for Large Language Model (LLM) APIs that reduces costs by up to 80%
                      while improving response times to under 10ms. It uses advanced semantic similarity matching and natural
                      language processing to provide intelligent response adaptation.
                    </p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Key Features</h2>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <Zap className="w-5 h-5 text-yellow-500 mr-2" />
                          <h3 className="font-semibold">Intelligent Caching</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Semantic similarity matching with vector embeddings for intelligent response retrieval
                        </p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <Shield className="w-5 h-5 text-green-500 mr-2" />
                          <h3 className="font-semibold">Response Adaptation</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Natural language processing to adapt cached responses to new query contexts
                        </p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <Gauge className="w-5 h-5 text-blue-500 mr-2" />
                          <h3 className="font-semibold">Performance Analytics</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Real-time metrics on cache performance, cost savings, and usage patterns
                        </p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <Layers className="w-5 h-5 text-purple-500 mr-2" />
                          <h3 className="font-semibold">Multi-Provider Support</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Compatible with OpenAI, Anthropic, Google, and custom LLM endpoints
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">System Requirements</h2>
                    <ul className="list-disc list-inside text-gray-600 space-y-1">
                      <li>Node.js 18.0 or higher</li>
                      <li>PostgreSQL 14+ with pgvector extension</li>
                      <li>2GB RAM minimum (4GB recommended)</li>
                      <li>10GB storage for cache data</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Quick Start Section */}
              {activeSection === 'quickstart' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">Quick Start Guide</h1>

                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold mb-4">1. Install the CLI</h2>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                        <code className="text-sm">
                          npm install -g cachegpt-cli
                        </code>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">2. Initialize Configuration</h2>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                        <code className="text-sm">
                          cachegpt init
                        </code>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        Follow the interactive setup to configure your LLM provider and API keys.
                      </p>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">3. Start Chatting</h2>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                        <code className="text-sm">
                          cachegpt chat
                        </code>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        Launch the interactive chat interface with intelligent caching enabled.
                      </p>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">4. Monitor Performance</h2>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                        <code className="text-sm">
                          cachegpt stats
                        </code>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        View cache hit rates, cost savings, and performance metrics.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Installation Section */}
              {activeSection === 'installation' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">Installation</h1>

                  <div className="space-y-8">
                    <div>
                      <h2 className="text-xl font-semibold mb-4">Prerequisites</h2>
                      <ul className="list-disc list-inside text-gray-600 space-y-1">
                        <li>Node.js 18.0 or higher</li>
                        <li>npm or yarn package manager</li>
                        <li>PostgreSQL database with pgvector extension</li>
                        <li>API keys from your chosen LLM provider</li>
                      </ul>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">CLI Installation</h2>

                      <h3 className="text-lg font-medium mb-2">Option 1: NPM Global Install</h3>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg mb-4">
                        <code className="text-sm">
                          npm install -g cachegpt-cli
                        </code>
                      </div>

                      <h3 className="text-lg font-medium mb-2">Option 2: Docker</h3>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg mb-4">
                        <code className="text-sm">
                          docker pull cachegpt/cli:latest<br/>
                          docker run -it cachegpt/cli init
                        </code>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Server Deployment</h2>

                      <h3 className="text-lg font-medium mb-2">Cloud Deployment (Recommended)</h3>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <p className="text-sm text-blue-800">
                          Deploy to your preferred cloud provider using our deployment templates:
                        </p>
                        <ul className="list-disc list-inside text-sm text-blue-700 mt-2">
                          <li>AWS CloudFormation</li>
                          <li>Google Cloud Platform</li>
                          <li>Azure Resource Manager</li>
                          <li>Vercel / Netlify</li>
                        </ul>
                      </div>

                      <h3 className="text-lg font-medium mb-2">Self-Hosted</h3>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                        <code className="text-sm">
                          # Set environment variables<br/>
                          export DATABASE_URL="postgresql://..."<br/>
                          export OPENAI_API_KEY="sk-..."<br/><br/>
                          # Start the server<br/>
                          npm run start
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Configuration Section */}
              {activeSection === 'configuration' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">Configuration</h1>

                  <div className="space-y-8">
                    <div>
                      <h2 className="text-xl font-semibold mb-4">Environment Variables</h2>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-4">Variable</th>
                              <th className="text-left py-2 px-4">Description</th>
                              <th className="text-left py-2 px-4">Required</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b">
                              <td className="py-2 px-4 font-mono text-sm">DATABASE_URL</td>
                              <td className="py-2 px-4 text-sm">PostgreSQL connection string</td>
                              <td className="py-2 px-4 text-sm">Yes</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 px-4 font-mono text-sm">OPENAI_API_KEY</td>
                              <td className="py-2 px-4 text-sm">OpenAI API key</td>
                              <td className="py-2 px-4 text-sm">If using OpenAI</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 px-4 font-mono text-sm">ANTHROPIC_API_KEY</td>
                              <td className="py-2 px-4 text-sm">Anthropic API key</td>
                              <td className="py-2 px-4 text-sm">If using Claude</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 px-4 font-mono text-sm">HUGGINGFACE_API_KEY</td>
                              <td className="py-2 px-4 text-sm">HuggingFace API key for embeddings</td>
                              <td className="py-2 px-4 text-sm">Yes</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 px-4 font-mono text-sm">CACHE_TTL</td>
                              <td className="py-2 px-4 text-sm">Cache time-to-live in seconds</td>
                              <td className="py-2 px-4 text-sm">No (default: 86400)</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 px-4 font-mono text-sm">SIMILARITY_THRESHOLD</td>
                              <td className="py-2 px-4 text-sm">Minimum similarity for cache hits (0-1)</td>
                              <td className="py-2 px-4 text-sm">No (default: 0.85)</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">CLI Configuration</h2>
                      <p className="text-gray-600 mb-4">
                        Configuration file location: <code className="bg-gray-100 px-2 py-1 rounded">~/.cachegpt/config.json</code>
                      </p>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                        <pre className="text-sm">{`{
  "baseUrl": "https://api.cachegpt.io",
  "apiKey": "cgpt_...",
  "defaultModel": "gpt-3.5-turbo",
  "timeout": 30
}`}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* API Reference Section */}
              {activeSection === 'api' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">API Reference</h1>

                  <div className="space-y-8">
                    <div>
                      <h2 className="text-xl font-semibold mb-4">Base URL</h2>
                      <div className="bg-gray-100 p-3 rounded-lg">
                        <code>https://api.cachegpt.io/v1</code>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Authentication</h2>
                      <p className="text-gray-600 mb-2">
                        All API requests must include an authorization header:
                      </p>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                        <code className="text-sm">
                          Authorization: Bearer YOUR_API_KEY
                        </code>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Endpoints</h2>

                      <div className="border rounded-lg p-4 mb-4">
                        <h3 className="font-mono text-lg mb-2">POST /chat</h3>
                        <p className="text-gray-600 mb-3">Send a chat completion request</p>
                        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                          <pre className="text-sm">{`{
  "model": "gpt-3.5-turbo",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}`}</pre>
                        </div>
                      </div>

                      <div className="border rounded-lg p-4 mb-4">
                        <h3 className="font-mono text-lg mb-2">GET /stats</h3>
                        <p className="text-gray-600 mb-3">Retrieve cache statistics</p>
                        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                          <pre className="text-sm">{`{
  "totalRequests": 10000,
  "cacheHits": 8500,
  "hitRate": 85.0,
  "totalSaved": 42.50
}`}</pre>
                        </div>
                      </div>

                      <div className="border rounded-lg p-4">
                        <h3 className="font-mono text-lg mb-2">GET /health</h3>
                        <p className="text-gray-600 mb-3">Health check endpoint</p>
                        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                          <pre className="text-sm">{`{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z"
}`}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CLI Reference Section */}
              {activeSection === 'cli' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">CLI Reference</h1>

                  <div className="space-y-6">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-mono text-lg mb-2">cachegpt init</h3>
                      <p className="text-gray-600 mb-3">Initialize configuration with interactive setup</p>
                      <div className="bg-gray-900 text-gray-100 p-3 rounded-lg">
                        <code className="text-sm">cachegpt init</code>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-mono text-lg mb-2">cachegpt chat</h3>
                      <p className="text-gray-600 mb-3">Start interactive chat interface</p>
                      <div className="bg-gray-900 text-gray-100 p-3 rounded-lg">
                        <code className="text-sm">cachegpt chat</code>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-mono text-lg mb-2">cachegpt stats</h3>
                      <p className="text-gray-600 mb-3">Display cache statistics and performance metrics</p>
                      <div className="bg-gray-900 text-gray-100 p-3 rounded-lg">
                        <code className="text-sm">cachegpt stats [--days 7]</code>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-mono text-lg mb-2">cachegpt test</h3>
                      <p className="text-gray-600 mb-3">Test API connectivity and cache functionality</p>
                      <div className="bg-gray-900 text-gray-100 p-3 rounded-lg">
                        <code className="text-sm">cachegpt test [--model gpt-4] [--query "test"]</code>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-mono text-lg mb-2">cachegpt clear</h3>
                      <p className="text-gray-600 mb-3">Clear cache entries</p>
                      <div className="bg-gray-900 text-gray-100 p-3 rounded-lg">
                        <code className="text-sm">cachegpt clear [--all] [--older-than 24]</code>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-mono text-lg mb-2">cachegpt config</h3>
                      <p className="text-gray-600 mb-3">Manage configuration settings</p>
                      <div className="bg-gray-900 text-gray-100 p-3 rounded-lg">
                        <code className="text-sm">cachegpt config [--show] [--set key=value]</code>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Architecture Section */}
              {activeSection === 'architecture' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">Architecture</h1>

                  <div className="space-y-8">
                    <div>
                      <h2 className="text-xl font-semibold mb-4">System Overview</h2>
                      <p className="text-gray-600 mb-4">
                        CacheGPT operates as an intelligent proxy layer between your application and LLM providers,
                        implementing semantic caching with response adaptation.
                      </p>

                      <div className="bg-gray-100 p-6 rounded-lg">
                        <div className="text-center space-y-4">
                          <div className="bg-white p-3 rounded inline-block">Application</div>
                          <div>↓</div>
                          <div className="bg-purple-100 p-3 rounded inline-block font-semibold">CacheGPT Proxy</div>
                          <div className="flex justify-center space-x-8">
                            <div>
                              <div>↓</div>
                              <div className="bg-white p-3 rounded">Cache Layer</div>
                            </div>
                            <div>
                              <div>↓</div>
                              <div className="bg-white p-3 rounded">LLM Provider</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Components</h2>

                      <div className="space-y-4">
                        <div className="border rounded-lg p-4">
                          <h3 className="font-semibold mb-2">API Gateway</h3>
                          <p className="text-sm text-gray-600">
                            Handles incoming requests, authentication, and routing to appropriate services.
                          </p>
                        </div>

                        <div className="border rounded-lg p-4">
                          <h3 className="font-semibold mb-2">Embedding Service</h3>
                          <p className="text-sm text-gray-600">
                            Generates vector embeddings using Hugging Face models for semantic similarity search.
                          </p>
                        </div>

                        <div className="border rounded-lg p-4">
                          <h3 className="font-semibold mb-2">Cache Engine</h3>
                          <p className="text-sm text-gray-600">
                            PostgreSQL with pgvector extension for efficient vector similarity search and storage.
                          </p>
                        </div>

                        <div className="border rounded-lg p-4">
                          <h3 className="font-semibold mb-2">Response Adapter</h3>
                          <p className="text-sm text-gray-600">
                            Natural language processing using Meta Llama 2 for intelligent response adaptation.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Data Flow</h2>
                      <ol className="list-decimal list-inside space-y-2 text-gray-600">
                        <li>Request received with user query</li>
                        <li>Generate embedding vector for query</li>
                        <li>Search cache for similar responses (>85% similarity)</li>
                        <li>If hit: Adapt cached response to current context</li>
                        <li>If miss: Forward to LLM provider and cache response</li>
                        <li>Return response with cache metadata</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Section */}
              {activeSection === 'security' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">Security</h1>

                  <div className="space-y-8">
                    <div>
                      <h2 className="text-xl font-semibold mb-4">Authentication</h2>
                      <p className="text-gray-600 mb-4">
                        All API requests are authenticated using Bearer tokens. API keys are hashed using bcrypt
                        and never stored in plain text.
                      </p>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Data Encryption</h2>
                      <ul className="list-disc list-inside text-gray-600 space-y-1">
                        <li>TLS 1.3 for all API communications</li>
                        <li>AES-256 encryption for cached data at rest</li>
                        <li>Encrypted database connections</li>
                        <li>Secure key management with rotation support</li>
                      </ul>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Privacy</h2>
                      <ul className="list-disc list-inside text-gray-600 space-y-1">
                        <li>No logging of request/response content</li>
                        <li>User isolation with row-level security</li>
                        <li>Automatic cache expiration and cleanup</li>
                        <li>GDPR compliant data handling</li>
                      </ul>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Best Practices</h2>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
                          <li>Rotate API keys regularly</li>
                          <li>Use environment variables for sensitive data</li>
                          <li>Enable audit logging for compliance</li>
                          <li>Implement rate limiting for API endpoints</li>
                          <li>Regular security updates and patches</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Performance Section */}
              {activeSection === 'performance' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">Performance</h1>

                  <div className="space-y-8">
                    <div>
                      <h2 className="text-xl font-semibold mb-4">Benchmarks</h2>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-4">Metric</th>
                              <th className="text-left py-2 px-4">Without Cache</th>
                              <th className="text-left py-2 px-4">With Cache</th>
                              <th className="text-left py-2 px-4">Improvement</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b">
                              <td className="py-2 px-4">Response Time</td>
                              <td className="py-2 px-4">2100ms</td>
                              <td className="py-2 px-4">8ms</td>
                              <td className="py-2 px-4 text-green-600">99.6%</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 px-4">Cost per 1K requests</td>
                              <td className="py-2 px-4">$2.00</td>
                              <td className="py-2 px-4">$0.40</td>
                              <td className="py-2 px-4 text-green-600">80%</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 px-4">Throughput</td>
                              <td className="py-2 px-4">10 req/s</td>
                              <td className="py-2 px-4">1000 req/s</td>
                              <td className="py-2 px-4 text-green-600">100x</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Optimization Tips</h2>
                      <ul className="list-disc list-inside text-gray-600 space-y-2">
                        <li>
                          <strong>Similarity Threshold:</strong> Adjust between 0.7-0.95 based on accuracy needs
                        </li>
                        <li>
                          <strong>Cache TTL:</strong> Set based on data freshness requirements (default: 24h)
                        </li>
                        <li>
                          <strong>Connection Pooling:</strong> Use connection pools for database efficiency
                        </li>
                        <li>
                          <strong>Batch Processing:</strong> Group similar requests for better cache utilization
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h2 className="text-xl font-semibold mb-4">Scaling</h2>
                      <p className="text-gray-600 mb-4">
                        CacheGPT is designed for horizontal scaling:
                      </p>
                      <ul className="list-disc list-inside text-gray-600 space-y-1">
                        <li>Stateless API servers for easy scaling</li>
                        <li>Database read replicas for high throughput</li>
                        <li>Redis for session management</li>
                        <li>CDN for static asset delivery</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Troubleshooting Section */}
              {activeSection === 'troubleshooting' && (
                <div className="bg-white rounded-lg p-8 shadow-sm">
                  <h1 className="text-3xl font-bold mb-6">Troubleshooting</h1>

                  <div className="space-y-6">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">Connection timeout errors</h3>
                      <p className="text-sm text-gray-600 mb-2">
                        Check that the CacheGPT server is running and accessible:
                      </p>
                      <div className="bg-gray-900 text-gray-100 p-3 rounded text-sm">
                        <code>curl https://api.cachegpt.io/health</code>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">Low cache hit rate</h3>
                      <p className="text-sm text-gray-600">
                        Consider lowering the similarity threshold from 0.85 to 0.75 for more cache hits.
                        Monitor accuracy to ensure quality isn't compromised.
                      </p>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">Authentication failures</h3>
                      <p className="text-sm text-gray-600">
                        Verify your API key is correct and has not expired. Check the authorization header format.
                      </p>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">Slow response times</h3>
                      <p className="text-sm text-gray-600">
                        Check database indexes, connection pool settings, and consider adding read replicas
                        for high-traffic scenarios.
                      </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-2 text-blue-800">Need Help?</h3>
                      <p className="text-sm text-blue-700">
                        Contact support at support@cachegpt.io or visit our community forum
                        for assistance.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}