'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import {
  Zap, Shield, BarChart3, Code, ArrowRight, Check,
  Cpu, Globe, Lock, Gauge, Cloud, Sparkles,
  ChevronDown, Terminal, Database, Layers,
  User, LogOut, Settings, CreditCard
} from 'lucide-react'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsVisible(true)
  }, [user, loading, router])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh()
  }

  const features = [
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Lightning Fast",
      description: "Sub-millisecond cache retrieval with intelligent matching algorithms",
      gradient: "from-yellow-400 to-orange-500"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Enterprise Security",
      description: "End-to-end encryption with SOC2 compliance and API key management",
      gradient: "from-purple-400 to-pink-500"
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Real-time Analytics",
      description: "Track usage, costs, and performance with beautiful visualizations",
      gradient: "from-blue-400 to-cyan-500"
    },
    {
      icon: <Database className="w-6 h-6" />,
      title: "Smart Caching",
      description: "Semantic search with vector embeddings for intelligent response matching",
      gradient: "from-green-400 to-emerald-500"
    }
  ]

  const stats = [
    { value: "99.9%", label: "Uptime SLA", trend: "+0.1%" },
    { value: "< 10ms", label: "Response Time", trend: "-25%" },
    { value: "80%", label: "Cost Reduction", trend: "+15%" },
    { value: "100M+", label: "Cached Queries", trend: "+2.5M" }
  ]

  const integrations = [
    { name: "OpenAI", logo: "🤖" },
    { name: "Anthropic", logo: "🧠" },
    { name: "Gemini", logo: "💎" },
    { name: "Cohere", logo: "🌊" },
    { name: "Mistral", logo: "🌪️" },
    { name: "Custom", logo: "⚡" }
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 mesh-gradient opacity-30"></div>
        <div className="absolute inset-0 grid-pattern"></div>
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500 rounded-full filter blur-[100px] opacity-20 blob-animation"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500 rounded-full filter blur-[120px] opacity-20 blob-animation" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500 rounded-full filter blur-[100px] opacity-15 blob-animation" style={{ animationDelay: '4s' }}></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className={`flex items-center space-x-2 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-5'}`}>
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold">CacheGPT</span>
          </div>

          <div className={`flex items-center space-x-6 transition-all duration-500 delay-100 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-5'}`}>
            <Link href="#features" className="text-gray-600 hover:text-purple-600 transition">Features</Link>
            <Link href="#installation" className="text-gray-600 hover:text-purple-600 transition">Install</Link>
            <Link href="/docs" className="text-gray-600 hover:text-purple-600 transition">Docs</Link>

            {loading ? (
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
            ) : user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user.email?.split('@')[0]}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Free Plan</p>
                    </div>

                    <Link
                      href="/settings"
                      className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </Link>


                    <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 w-full text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login" className="btn-glow">
                Login
                <ArrowRight className="w-4 h-4 ml-2 inline" />
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className={`text-center max-w-4xl mx-auto transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">v7.0 Now Available</span>
            </div>

            <h1 className="text-6xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-purple-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent">
                Supercharge
              </span>
              <br />
              Your LLM APIs
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
              Intelligent caching layer for OpenAI, Anthropic, and any LLM.
              Cut costs by 80% while improving response times to under 10ms.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              {user ? (
                <>
                  <button
                    onClick={() => router.push('/docs')}
                    className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
                  >
                    <Terminal className="w-5 h-5 inline mr-2" />
                    <span className="relative z-10">View Documentation</span>
                  </button>

                  <a
                    href="#installation"
                    className="group px-8 py-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl font-semibold text-lg hover:border-purple-500 transition-all duration-200 inline-flex items-center"
                  >
                    <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    Install Now
                  </a>
                </>
              ) : (
                <>
                  <button
                    onClick={() => router.push('/login')}
                    className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
                  >
                    <span className="relative z-10">Get Started</span>
                    <ArrowRight className="w-5 h-5 inline ml-2 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    onClick={() => router.push('/docs')}
                    className="group px-8 py-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl font-semibold text-lg hover:border-purple-500 transition-all duration-200"
                  >
                    <Terminal className="w-5 h-5 inline mr-2" />
                    View Documentation
                  </button>
                </>
              )}
            </div>

            {/* Live Stats */}
            <div className={`grid grid-cols-2 md:grid-cols-4 gap-6 p-6 glass-card rounded-2xl max-w-3xl mx-auto transition-all duration-700 delay-400 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</div>
                  <div className="text-xs text-green-500 mt-1">{stat.trend}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating Demo Terminal */}
          <div className={`mt-16 max-w-4xl mx-auto transition-all duration-700 delay-600 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            <div className="glass-card rounded-2xl p-6 float-animation">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-gray-500 ml-4">terminal</span>
              </div>
              <div className="font-mono text-sm space-y-2">
                <div className="text-gray-500">$ cachegpt init</div>
                <div className="text-green-400">✓ Configuration file created</div>
                <div className="text-gray-500">$ cachegpt login</div>
                <div className="text-blue-400">✓ Authenticated successfully</div>
                <div className="text-gray-500">$ cachegpt start</div>
                <div className="text-green-400">✓ Cache server running on port 8080</div>
                <div className="text-purple-400">→ Proxy endpoint: http://localhost:8080/v1/chat</div>
                <div className="text-yellow-400">💡 100% free - no credit card required!</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 fade-in">
            <h2 className="text-4xl font-bold mb-4">
              Built for <span className="text-purple-600">Scale</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Enterprise-grade features out of the box
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                onMouseEnter={() => setActiveFeature(index)}
                className="group relative fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="glass-card rounded-2xl p-6 h-full card-lift cursor-pointer relative">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>

                  {activeFeature === index && (
                    <div className="absolute inset-0 border-2 border-purple-500 rounded-2xl pointer-events-none transition-all duration-300" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-transparent via-purple-50/50 to-transparent dark:via-purple-900/10">
        <div className="max-w-7xl mx-auto text-center">
          <div className="fade-in">
            <h2 className="text-4xl font-bold mb-4">
              Works with <span className="text-purple-600">Everything</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-12">
              Drop-in replacement for any LLM API
            </p>

            <div className="flex flex-wrap items-center justify-center gap-8">
              {integrations.map((integration, index) => (
                <div
                  key={index}
                  className="w-24 h-24 glass-card rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:scale-110 transition-transform fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span className="text-3xl mb-1">{integration.logo}</span>
                  <span className="text-sm font-medium">{integration.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Installation Section */}
      <section id="installation" className="py-20 px-6 bg-gradient-to-b from-transparent via-blue-50/50 to-transparent dark:via-blue-900/10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="fade-in">
            <h2 className="text-4xl font-bold mb-4">
              Install <span className="text-blue-600">CacheGPT</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-12">
              Get started in seconds - completely free, no registration required
            </p>

            {/* Installation Instructions */}
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-semibold mb-6">📦 Quick Installation</h3>

              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="text-left">
                  <h4 className="text-lg font-medium mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 1.85c-.27 0-.55.07-.78.2l-7.44 4.3c-.48.28-.78.8-.78 1.36v8.58c0 .56.3 1.08.78 1.36l1.95 1.12c.95.46 1.27.47 1.71.47 1.4 0 2.21-.85 2.21-2.33V8.44c0-.12-.1-.22-.22-.22H8.5c-.13 0-.23.1-.23.22v8.47c0 .66-.68 1.31-1.77.76L4.45 16.5c-.06-.03-.1-.1-.1-.17V7.67c0-.07.04-.13.1-.16l7.44-4.3c.06-.04.16-.04.22 0l7.44 4.3c.07.03.1.1.1.16v8.66c0 .07-.03.14-.1.17l-7.44 4.3c-.06.04-.16.04-.22 0l-1.9-1.12c-.06-.03-.13-.04-.2-.02-.53.15-.65.18-1.16.4-.13.05-.07.2.08.28l2.47 1.47c.23.13.5.2.78.2.27 0 .54-.07.78-.2l7.44-4.3c.48-.27.78-.8.78-1.35V7.67c0-.56-.3-1.08-.78-1.36l-7.44-4.3c-.23-.13-.5-.2-.78-.2z"/>
                    </svg>
                    npm / Node.js
                  </h4>
                  <code className="block bg-gray-100 dark:bg-gray-800 rounded p-3 text-sm font-mono">
                    npm install -g cachegpt
                  </code>
                  <p className="text-xs text-gray-500 mt-2">Requires Node.js 16+</p>
                </div>

                <div className="text-left">
                  <h4 className="text-lg font-medium mb-3 flex items-center">
                    <span className="text-xl mr-2">🍺</span>
                    Homebrew (macOS/Linux)
                  </h4>
                  <code className="block bg-gray-100 dark:bg-gray-800 rounded p-3 text-sm font-mono">
                    brew install cachegpt
                  </code>
                  <p className="text-xs text-gray-500 mt-2">For macOS and Linux users</p>
                </div>

                <div className="text-left">
                  <h4 className="text-lg font-medium mb-3 flex items-center">
                    <span className="text-xl mr-2">🐳</span>
                    Docker
                  </h4>
                  <code className="block bg-gray-100 dark:bg-gray-800 rounded p-3 text-sm font-mono">
                    docker run cachegpt/cli
                  </code>
                  <p className="text-xs text-gray-500 mt-2">Container-based installation</p>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h4 className="text-lg font-medium mb-4">🚀 Quick Start</h4>
                <div className="bg-gray-900 rounded-lg p-4 text-left">
                  <div className="font-mono text-sm space-y-2">
                    <div className="text-gray-400"># Initialize configuration</div>
                    <div className="text-green-400">$ cachegpt init</div>
                    <div className="text-gray-500 ml-4">✓ Configuration file created at ~/.cachegpt/config.json</div>
                    <div className="mt-3 text-gray-400"># Login to your account</div>
                    <div className="text-green-400">$ cachegpt login</div>
                    <div className="text-gray-500 ml-4">✓ Successfully authenticated</div>
                    <div className="mt-3 text-gray-400"># Start the cache server</div>
                    <div className="text-green-400">$ cachegpt start</div>
                    <div className="text-gray-500 ml-4">✓ Cache server running on http://localhost:8080</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  <strong>✅ That's it!</strong> CacheGPT is now running and ready to cache your LLM API calls.
                  Check out the <a href="/docs" className="underline hover:text-green-800 dark:hover:text-green-200">documentation</a> for configuration options.
                </p>
              </div>

              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Need help?</strong> Visit our
                  <a href="https://github.com/Fender1992/cachegpt/issues" target="_blank" rel="noopener" className="underline hover:text-blue-800 dark:hover:text-blue-200"> GitHub Issues</a> page
                  or join our <a href="/support" className="underline hover:text-blue-800 dark:hover:text-blue-200">support community</a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-3xl p-12 text-center relative overflow-hidden fade-in">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-blue-600/10"></div>
            <div className="relative z-10">
              <h2 className="text-4xl font-bold mb-4">
                Ready to <span className="text-purple-600">Optimize</span>?
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                Join thousands of developers saving millions on API costs
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="btn-glow"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-2 inline" />
                </button>
                <button
                  onClick={() => router.push('/docs')}
                  className="px-8 py-3 font-semibold border-2 border-gray-300 dark:border-gray-600 rounded-xl hover:border-purple-500 transition"
                >
                  View Documentation
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold">CacheGPT</span>
          </div>
          <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
            <Link href="/docs" className="hover:text-purple-600 transition">Documentation</Link>
            <a href="https://github.com/Fender1992/cachegpt" target="_blank" rel="noopener" className="hover:text-purple-600 transition">GitHub</a>
            <Link href="/support" className="hover:text-purple-600 transition">Support</Link>
            <Link href="/terms" className="hover:text-purple-600 transition">Terms</Link>
            <Link href="/privacy" className="hover:text-purple-600 transition">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}