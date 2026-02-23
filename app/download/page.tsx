'use client'

import { useEffect, useState } from 'react'
import { Download, Apple, Monitor, Terminal } from 'lucide-react'
import Navigation from '@/components/Navigation'

type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

const VERSION = '1.0.0'

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>('unknown')

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Download CacheGPT Desktop</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Native app with system tray, global hotkey, and instant access to your AI assistant.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Version {VERSION}</p>
        </div>

        {/* Available Now Banner */}
        <div className="mb-8 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Download className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="font-semibold text-green-700 dark:text-green-300">Windows Available Now</span>
          </div>
          <p className="text-sm text-green-600 dark:text-green-400">
            Download the Windows installer below. macOS and Linux builds are coming soon.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* macOS */}
          <div
            className={`rounded-xl border p-6 flex flex-col items-center gap-4 transition-all ${
              platform === 'macos'
                ? 'border-purple-400 dark:border-purple-600 ring-2 ring-purple-200 dark:ring-purple-800'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <Apple className="w-12 h-12" />
            <h2 className="text-xl font-semibold">macOS</h2>
            <button
              disabled
              className="inline-flex items-center gap-2 bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-6 py-3 rounded-lg font-medium cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Download .dmg
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">macOS 10.15+ (Apple Silicon &amp; Intel)</p>
          </div>

          {/* Windows */}
          <div
            className={`rounded-xl border p-6 flex flex-col items-center gap-4 transition-all ${
              platform === 'windows'
                ? 'border-purple-400 dark:border-purple-600 ring-2 ring-purple-200 dark:ring-purple-800'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <Monitor className="w-12 h-12" />
            <h2 className="text-xl font-semibold">Windows</h2>
            <a
              href={`https://github.com/Fender1992/cachegpt/releases/download/v${VERSION}/CacheGPT_${VERSION}_x64-setup.exe`}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white px-6 py-3 rounded-lg font-medium transition-opacity"
            >
              <Download className="w-4 h-4" />
              Download .exe
            </a>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Windows 10+ (x64) &bull; {VERSION}</p>
          </div>

          {/* Linux */}
          <div
            className={`rounded-xl border p-6 flex flex-col items-center gap-4 transition-all ${
              platform === 'linux'
                ? 'border-purple-400 dark:border-purple-600 ring-2 ring-purple-200 dark:ring-purple-800'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <Terminal className="w-12 h-12" />
            <h2 className="text-xl font-semibold">Linux</h2>
            <div className="flex flex-col gap-2 w-full">
              <button
                disabled
                className="inline-flex items-center justify-center gap-2 bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                .deb (Debian/Ubuntu)
              </button>
              <button
                disabled
                className="inline-flex items-center justify-center gap-2 bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                .AppImage (Universal)
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Ubuntu 20.04+, Fedora 36+, or equivalent</p>
          </div>
        </div>

        {/* Features */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-8">
          <h3 className="text-lg font-semibold mb-4">Desktop Features</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-purple-600 dark:text-purple-400 font-bold">+</span>
              <div>
                <p className="font-medium">System Tray</p>
                <p className="text-gray-500 dark:text-gray-400">Always running, quick access from tray icon</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-purple-600 dark:text-purple-400 font-bold">+</span>
              <div>
                <p className="font-medium">Global Hotkey</p>
                <p className="text-gray-500 dark:text-gray-400">Cmd/Ctrl+Shift+C to toggle from anywhere</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-purple-600 dark:text-purple-400 font-bold">+</span>
              <div>
                <p className="font-medium">Auto Updates</p>
                <p className="text-gray-500 dark:text-gray-400">Stays current automatically</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-purple-600 dark:text-purple-400 font-bold">+</span>
              <div>
                <p className="font-medium">Native Performance</p>
                <p className="text-gray-500 dark:text-gray-400">Lightweight native wrapper, low memory usage</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
