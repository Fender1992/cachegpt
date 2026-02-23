'use client'

import { useEffect, useState } from 'react'
import { Download, Apple, Monitor, Terminal } from 'lucide-react'

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

const downloads = {
  macos: {
    label: 'macOS',
    icon: Apple,
    file: 'CacheGPT_1.0.0_aarch64.dmg',
    note: 'macOS 10.15+ (Apple Silicon & Intel)',
  },
  windows: {
    label: 'Windows',
    icon: Monitor,
    file: 'CacheGPT_1.0.0_x64-setup.exe',
    note: 'Windows 10+',
  },
  linux: {
    label: 'Linux',
    icon: Terminal,
    files: [
      { name: '.deb (Debian/Ubuntu)', file: 'CacheGPT_1.0.0_amd64.deb' },
      { name: '.AppImage (Universal)', file: 'CacheGPT_1.0.0_amd64.AppImage' },
    ],
    note: 'Ubuntu 20.04+, Fedora 36+, or equivalent',
  },
}

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>('unknown')

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  const baseUrl = 'https://cachegpt.app/releases/desktop'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Download CacheGPT Desktop</h1>
          <p className="text-lg text-muted-foreground">
            Native app with system tray, global hotkey, and instant access to your AI assistant.
          </p>
          <p className="text-sm text-muted-foreground mt-2">Version {VERSION}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* macOS */}
          <div
            className={`rounded-xl border p-6 flex flex-col items-center gap-4 transition-all ${
              platform === 'macos' ? 'border-primary ring-2 ring-primary/20' : 'border-border'
            }`}
          >
            <Apple className="w-12 h-12" />
            <h2 className="text-xl font-semibold">{downloads.macos.label}</h2>
            <a
              href={`${baseUrl}/${downloads.macos.file}`}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              Download .dmg
            </a>
            <p className="text-xs text-muted-foreground text-center">{downloads.macos.note}</p>
          </div>

          {/* Windows */}
          <div
            className={`rounded-xl border p-6 flex flex-col items-center gap-4 transition-all ${
              platform === 'windows' ? 'border-primary ring-2 ring-primary/20' : 'border-border'
            }`}
          >
            <Monitor className="w-12 h-12" />
            <h2 className="text-xl font-semibold">{downloads.windows.label}</h2>
            <a
              href={`${baseUrl}/${downloads.windows.file}`}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              Download .exe
            </a>
            <p className="text-xs text-muted-foreground text-center">{downloads.windows.note}</p>
          </div>

          {/* Linux */}
          <div
            className={`rounded-xl border p-6 flex flex-col items-center gap-4 transition-all ${
              platform === 'linux' ? 'border-primary ring-2 ring-primary/20' : 'border-border'
            }`}
          >
            <Terminal className="w-12 h-12" />
            <h2 className="text-xl font-semibold">{downloads.linux.label}</h2>
            <div className="flex flex-col gap-2 w-full">
              {downloads.linux.files.map((f) => (
                <a
                  key={f.file}
                  href={`${baseUrl}/${f.file}`}
                  className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Download className="w-4 h-4" />
                  {f.name}
                </a>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">{downloads.linux.note}</p>
          </div>
        </div>

        {/* Features */}
        <div className="border rounded-xl p-8">
          <h3 className="text-lg font-semibold mb-4">Desktop Features</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-primary font-bold">+</span>
              <div>
                <p className="font-medium">System Tray</p>
                <p className="text-muted-foreground">Always running, quick access from tray icon</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary font-bold">+</span>
              <div>
                <p className="font-medium">Global Hotkey</p>
                <p className="text-muted-foreground">Cmd/Ctrl+Shift+C to toggle from anywhere</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary font-bold">+</span>
              <div>
                <p className="font-medium">Auto Updates</p>
                <p className="text-muted-foreground">Stays current automatically</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary font-bold">+</span>
              <div>
                <p className="font-medium">Native Performance</p>
                <p className="text-muted-foreground">Lightweight native wrapper, low memory usage</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
