'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase-client';
import {
  User, Palette, Shield, Key, Moon, Sun, Sparkles,
  Save, Check, LogOut, ChevronLeft
} from 'lucide-react';
import { telemetry } from '@/lib/telemetry';

type Tab = 'profile' | 'themes' | 'privacy' | 'providers';
type Theme = 'light' | 'dark' | 'solarized' | 'neon';

const THEMES = [
  { id: 'light' as Theme, name: 'Light', icon: Sun, colors: 'bg-white border-gray-200' },
  { id: 'dark' as Theme, name: 'Dark', icon: Moon, colors: 'bg-gray-900 border-gray-700' },
  { id: 'solarized' as Theme, name: 'Solarized', icon: Sparkles, colors: 'bg-amber-50 border-amber-200' },
  { id: 'neon' as Theme, name: 'Neon', icon: Sparkles, colors: 'bg-purple-950 border-purple-500' },
];

export default function CasualSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [theme, setTheme] = useState<Theme>('light');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadUserProfile();
      telemetry.settingsView();
    }
  }, [user, authLoading, router]);

  const loadUserProfile = async () => {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user!.id)
        .single();

      if (profile) {
        setUserProfile(profile);
        // Load saved theme from profile or localStorage
        const savedTheme = localStorage.getItem('theme') as Theme;
        if (savedTheme) {
          setTheme(savedTheme);
          applyTheme(savedTheme);
        }
      }
    } catch (error) {
      console.error('[SETTINGS] Error loading profile:', error);
    }
  };

  const applyTheme = (themeName: Theme) => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('light', 'dark', 'theme-solarized', 'theme-neon');

    // Apply new theme
    if (themeName === 'light') {
      root.classList.add('light');
    } else if (themeName === 'dark') {
      root.classList.add('dark');
    } else if (themeName === 'solarized') {
      root.classList.add('theme-solarized');
    } else if (themeName === 'neon') {
      root.classList.add('theme-neon');
    }

    // Save to localStorage
    localStorage.setItem('theme', themeName);
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    telemetry.themeChanged(newTheme);
    showMessage('success', `Theme changed to ${newTheme}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  if (authLoading || !userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/chat')}
            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 mb-4"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Chat
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Customize your CacheGPT experience
          </p>
        </div>

        {/* Success/Error Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
          }`}>
            <Check className="w-5 h-5" />
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'profile'
                ? 'bg-purple-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <User className="w-4 h-4" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('themes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'themes'
                ? 'bg-purple-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Palette className="w-4 h-4" />
            Themes
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'bg-purple-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Shield className="w-4 h-4" />
            Privacy
          </button>
          <button
            onClick={() => setActiveTab('providers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'providers'
                ? 'bg-purple-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Key className="w-4 h-4" />
            API Keys
          </button>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Your Profile</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-gray-900 dark:text-white">
                  {user?.email}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Account Type
                </label>
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-gray-900 dark:text-white">
                  Free Plan
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Themes Tab */}
        {activeTab === 'themes' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Choose Your Theme</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Pick a theme that makes you happy! Changes apply instantly.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {THEMES.map((themeOption) => {
                const Icon = themeOption.icon;
                return (
                  <button
                    key={themeOption.id}
                    onClick={() => handleThemeChange(themeOption.id)}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      theme === themeOption.id
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-lg ${themeOption.colors} border-2 flex items-center justify-center`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-gray-900 dark:text-white">{themeOption.name}</div>
                        {theme === themeOption.id && (
                          <div className="text-sm text-purple-600 dark:text-purple-400">Active</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Your Privacy Matters</h2>

            <div className="space-y-6 text-gray-700 dark:text-gray-300">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">What we store</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Your chat messages (to show you your history)</li>
                  <li>Your email (to identify your account)</li>
                  <li>Your AI provider preference (OpenAI, Claude, etc.)</li>
                  <li>Your API keys if you add them (encrypted)</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">What we don't do</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>We don't sell your data to anyone. Ever.</li>
                  <li>We don't train AI models on your conversations</li>
                  <li>We don't share your messages with third parties</li>
                  <li>We don't track you across other websites</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Your data, your control</h3>
                <p className="mb-3">
                  You can delete your account and all your data anytime. Just email us at{' '}
                  <a href="mailto:privacy@cachegpt.app" className="text-purple-600 hover:underline">
                    privacy@cachegpt.app
                  </a>
                </p>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Read our full{' '}
                  <a href="/privacy" className="text-purple-600 hover:underline">
                    Privacy Policy
                  </a>
                  {' '}and{' '}
                  <a href="/terms" className="text-purple-600 hover:underline">
                    Terms of Service
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === 'providers' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">API Keys (Optional)</h2>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-blue-800 dark:text-blue-200">
                <strong>Good news!</strong> You don't need to add API keys. CacheGPT provides free access to all AI models.
              </p>
            </div>

            <div className="space-y-4 text-gray-700 dark:text-gray-300">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Why add your own keys?</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Use your own OpenAI, Claude, or Gemini subscription</li>
                  <li>Get billed directly by the provider (at their rates)</li>
                  <li>Have full control over your API usage</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">How it works</h3>
                <p className="mb-3">
                  If you add your own API key, we'll use it instead of our shared keys. Your key is encrypted and stored securely. We never see or log your actual key.
                </p>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => router.push('/settings')}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  <Key className="w-4 h-4" />
                  Advanced: Manage API Keys
                </button>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Opens the full settings page with API key management
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
