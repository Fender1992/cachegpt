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
  User, LogOut, Settings, CreditCard, Timer, DollarSign, TrendingUp
} from 'lucide-react'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [monthlyCalls, setMonthlyCalls] = useState(10000)
  const [avgResponseSize, setAvgResponseSize] = useState(2)
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
            <Link href="#installation" className="text-gray-600 hover:text-purple-600 transition">Install</Link>
            <Link href="/docs" className="text-gray-600 hover:text-purple-600 transition">Docs</Link>
            <Link href="/support" className="text-gray-600 hover:text-purple-600 transition">Support</Link>

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
      <section className="relative pt-16 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className={`text-center max-w-5xl mx-auto transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
            {/* Problem Statement */}
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
              Your LLM APIs cost too much and respond too slowly
            </h1>

            {/* Solution */}
            <p className="text-2xl text-gray-700 dark:text-gray-300 mb-8">
              CacheGPT cuts costs by <span className="text-purple-600 font-bold">80%</span> and speeds up responses to <span className="text-purple-600 font-bold">&lt;10ms</span>
            </p>

            {/* One-line install */}
            <div className="glass-card rounded-xl p-4 inline-flex items-center space-x-4 mb-8">
              <Terminal className="w-5 h-5 text-gray-500" />
              <code className="text-lg font-mono">npm install -g cachegpt</code>
              <button
                onClick={() => navigator.clipboard.writeText('npm install -g cachegpt')}
                className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-sm hover:bg-purple-200 dark:hover:bg-purple-900/50 transition"
              >
                Copy
              </button>
            </div>

            <div className="flex items-center justify-center mb-12">
              <button
                onClick={() => {
                  const element = document.getElementById('installation');
                  element?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="group relative px-10 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
              >
                Start Saving Now
                <ArrowRight className="w-5 h-5 inline ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Before/After Comparison */}
            <div className={`grid md:grid-cols-2 gap-6 max-w-4xl mx-auto transition-all duration-700 delay-400 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
              {/* Without CacheGPT */}
              <div className="glass-card rounded-2xl p-6 border-2 border-red-200 dark:border-red-900/50">
                <h3 className="text-lg font-semibold mb-4 text-red-600 dark:text-red-400">❌ Without CacheGPT</h3>
                <div className="space-y-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Response Time</span>
                    <span className="font-mono font-bold text-red-600">2,300ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Cost per 1K calls</span>
                    <span className="font-mono font-bold text-red-600">$30</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Rate Limits</span>
                    <span className="font-mono font-bold text-red-600">Hitting Daily</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Monthly Cost</span>
                    <span className="font-mono font-bold text-red-600">$5,000+</span>
                  </div>
                </div>
              </div>

              {/* With CacheGPT */}
              <div className="glass-card rounded-2xl p-6 border-2 border-green-200 dark:border-green-900/50">
                <h3 className="text-lg font-semibold mb-4 text-green-600 dark:text-green-400">✅ With CacheGPT</h3>
                <div className="space-y-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Response Time</span>
                    <span className="font-mono font-bold text-green-600">8ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Cost per 1K calls</span>
                    <span className="font-mono font-bold text-green-600">$6</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Rate Limits</span>
                    <span className="font-mono font-bold text-green-600">Never</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Monthly Cost</span>
                    <span className="font-mono font-bold text-green-600">$1,000</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Savings Calculator */}
          <div className={`mt-12 max-w-4xl mx-auto transition-all duration-700 delay-600 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold mb-6 text-center">
                <DollarSign className="w-6 h-6 inline mr-2 text-green-600" />
                Calculate Your Savings
              </h3>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monthly API Calls
                  </label>
                  <input
                    type="range"
                    min="1000"
                    max="1000000"
                    step="1000"
                    value={monthlyCalls}
                    onChange={(e) => setMonthlyCalls(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-center mt-2 font-mono font-bold text-lg">
                    {monthlyCalls.toLocaleString()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Avg Response Size (KB)
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={avgResponseSize}
                    onChange={(e) => setAvgResponseSize(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-center mt-2 font-mono font-bold text-lg">
                    {avgResponseSize} KB
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl">
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current Cost</div>
                  <div className="text-2xl font-bold text-red-600">
                    ${Math.round(monthlyCalls * 0.03).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">With CacheGPT</div>
                  <div className="text-2xl font-bold text-green-600">
                    ${Math.round(monthlyCalls * 0.006).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">You Save</div>
                  <div className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    ${Math.round(monthlyCalls * 0.024).toLocaleString()}/mo
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compact Features Grid */}
      <section className="py-12 px-6 bg-gradient-to-b from-transparent via-gray-50/50 to-transparent dark:via-gray-900/10">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-xl p-4 text-center">
              <Timer className="w-8 h-8 mx-auto mb-2 text-purple-600" />
              <div className="font-bold text-2xl">8ms</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Response Time</div>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-600" />
              <div className="font-bold text-2xl">80%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Cost Reduction</div>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <Shield className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <div className="font-bold text-2xl">SOC2</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Compliant</div>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-orange-600" />
              <div className="font-bold text-2xl">99.9%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Uptime SLA</div>
            </div>
          </div>
        </div>
      </section>

      {/* Works With Section - Simplified */}
      <section className="py-12 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Works with all major LLM providers
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <span className="px-4 py-2 glass-card rounded-lg">OpenAI</span>
            <span className="px-4 py-2 glass-card rounded-lg">Anthropic Claude</span>
            <span className="px-4 py-2 glass-card rounded-lg">Google Gemini</span>
            <span className="px-4 py-2 glass-card rounded-lg">Mistral</span>
            <span className="px-4 py-2 glass-card rounded-lg">Cohere</span>
            <span className="px-4 py-2 glass-card rounded-lg">+ Any OpenAI-compatible API</span>
          </div>
        </div>
      </section>

      {/* Installation Section - Simplified */}
      <section id="installation" className="py-16 px-6 bg-gradient-to-b from-transparent via-gray-50/50 to-transparent dark:via-gray-900/10">
        <div className="max-w-3xl mx-auto">
          <div className="glass-card rounded-2xl p-8">
            <h2 className="text-3xl font-bold mb-6 text-center">
              30-Second Setup
            </h2>

            {/* One-step install */}
            <div className="bg-gray-900 rounded-lg p-6 mb-6">
              <div className="font-mono space-y-3">
                <div className="flex items-start">
                  <span className="text-green-400 mr-2">$</span>
                  <span className="text-white">npm install -g cachegpt && cachegpt start</span>
                </div>
                <div className="text-gray-400 ml-4">✓ That's it. You're now saving 80% on API costs.</div>
              </div>
            </div>

            {/* Alternative methods */}
            <details className="mb-4">
              <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600">
                Other installation methods →
              </summary>
              <div className="mt-4 space-y-3">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium w-20">Homebrew:</span>
                  <code className="flex-1 bg-gray-100 dark:bg-gray-800 rounded px-3 py-1 text-sm">brew install cachegpt</code>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium w-20">Docker:</span>
                  <code className="flex-1 bg-gray-100 dark:bg-gray-800 rounded px-3 py-1 text-sm">docker run cachegpt/cli</code>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium w-20">Yarn:</span>
                  <code className="flex-1 bg-gray-100 dark:bg-gray-800 rounded px-3 py-1 text-sm">yarn global add cachegpt</code>
                </div>
              </div>
            </details>

            {/* Key features */}
            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <div className="flex items-center space-x-2">
                <Check className="w-5 h-5 text-green-500" />
                <span className="text-sm">No credit card</span>
              </div>
              <div className="flex items-center space-x-2">
                <Check className="w-5 h-5 text-green-500" />
                <span className="text-sm">100% open source</span>
              </div>
              <div className="flex items-center space-x-2">
                <Check className="w-5 h-5 text-green-500" />
                <span className="text-sm">Works instantly</span>
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
            <Link href="/support" className="hover:text-purple-600 transition">Support</Link>
            <Link href="/terms" className="hover:text-purple-600 transition">Terms</Link>
            <Link href="/privacy" className="hover:text-purple-600 transition">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}