'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import {
  Zap, Shield, BarChart3, Code, ArrowRight, Check,
  Cpu, Globe, Lock, Gauge, Cloud, Sparkles,
  ChevronDown, Terminal, Database, Layers
} from 'lucide-react'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)

  useEffect(() => {
    if (user && !loading) {
      router.push('/dashboard')
    }
    setIsVisible(true)
  }, [user, loading, router])

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
            <Link href="/pricing" className="text-gray-600 hover:text-purple-600 transition">Pricing</Link>
            <Link href="/docs" className="text-gray-600 hover:text-purple-600 transition">Docs</Link>
            <Link href="/dashboard" className="btn-glow">
              Get Started
              <ArrowRight className="w-4 h-4 ml-2 inline" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className={`text-center max-w-4xl mx-auto transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">v2.0 Now Available</span>
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
              <button
                onClick={() => router.push('/dashboard')}
                className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
              >
                <span className="relative z-10">Start Free Forever</span>
                <ArrowRight className="w-5 h-5 inline ml-2 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => router.push('/docs')}
                className="group px-8 py-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl font-semibold text-lg hover:border-purple-500 transition-all duration-200"
              >
                <Terminal className="w-5 h-5 inline mr-2" />
                View Documentation
              </button>
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
                <div className="text-gray-500">$ llm-cache init</div>
                <div className="text-green-400">✓ Configuration initialized</div>
                <div className="text-gray-500">$ llm-cache test --model gpt-4</div>
                <div className="text-blue-400">→ Cache miss (2.1s) - Calling OpenAI...</div>
                <div className="text-green-400">✓ Response cached</div>
                <div className="text-gray-500">$ llm-cache test --model gpt-4</div>
                <div className="text-purple-400">→ Cache hit (8ms) - 99.6% faster!</div>
                <div className="text-yellow-400">💰 Saved: $0.03</div>
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
                Join thousands of developers saving millions on API costs - completely free!
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="btn-glow"
                >
                  Start Free Forever
                  <ArrowRight className="w-4 h-4 ml-2 inline" />
                </button>
                <button
                  onClick={() => window.open('https://github.com/cachegpt/cachegpt', '_blank')}
                  className="px-8 py-3 font-semibold border-2 border-gray-300 dark:border-gray-600 rounded-xl hover:border-purple-500 transition"
                >
                  View on GitHub
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
            <Link href="/pricing" className="hover:text-purple-600 transition">Pricing</Link>
            <a href="https://github.com/cachegpt/cachegpt" target="_blank" rel="noopener noreferrer" className="hover:text-purple-600 transition">GitHub</a>
            <Link href="/dashboard" className="hover:text-purple-600 transition">Get Started</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}