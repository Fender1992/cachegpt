'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { ArrowLeft, RefreshCw, Save, ToggleLeft, ToggleRight, Flag } from 'lucide-react';
import Toast from '@/components/toast';

interface FeatureFlag {
  id: string;
  key: string;
  value: any;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const FLAG_DESCRIPTIONS: { [key: string]: string } = {
  ui_casual_landing: 'New casual landing page (vs developer-focused landing)',
  ui_casual_chat: 'Chat UI refresh with example prompts and cache toasts',
  ui_modes: 'Modes/templates system (Writing, Coding, Study, etc.)',
  ui_casual_dashboard: 'Casual dashboard with stats and achievements',
  ui_casual_settings: 'Simplified settings with themes',
  ux_gamified_toasts: 'Cache hit toast notifications with savings',
  ux_voice_input: 'Voice input using Web Speech API',
  ux_file_upload: 'File context upload feature',
  ux_cache_badges: 'Inline cache hit badges in messages',
  ux_example_prompts: 'Example prompt cards in empty chat',
  ab_landing_hero_copy_v1: 'A/B test: Landing hero copy variant',
  ab_example_prompts_layout_v1: 'A/B test: Prompt layout (grid/list)',
  ab_onboarding_flow_v1: 'A/B test: Onboarding flow version',
};

export default function AdminFeatureFlagsClient() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .is('user_id', null) // Only global flags
        .order('key', { ascending: true });

      if (error) throw error;

      setFlags(data || []);
    } catch (error) {
      console.error('[ADMIN] Error loading flags:', error);
      setToast({ message: 'Failed to load feature flags', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (flag: FeatureFlag) => {
    try {
      setSaving(true);
      const newEnabled = !flag.enabled;

      const { error } = await supabase
        .from('feature_flags')
        .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
        .eq('id', flag.id);

      if (error) throw error;

      setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: newEnabled } : f));
      setToast({
        message: `${flag.key} ${newEnabled ? 'enabled' : 'disabled'}`,
        type: 'success'
      });
    } catch (error) {
      console.error('[ADMIN] Error toggling flag:', error);
      setToast({ message: 'Failed to update flag', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const createMissingFlags = async () => {
    try {
      setSaving(true);
      const existingKeys = new Set(flags.map(f => f.key));
      const missingFlags = Object.keys(FLAG_DESCRIPTIONS).filter(key => !existingKeys.has(key));

      if (missingFlags.length === 0) {
        setToast({ message: 'All flags already exist', type: 'info' });
        return;
      }

      const flagsToCreate = missingFlags.map(key => ({
        key,
        value: false,
        enabled: false,
        description: FLAG_DESCRIPTIONS[key],
      }));

      const { error } = await supabase
        .from('feature_flags')
        .insert(flagsToCreate);

      if (error) throw error;

      setToast({ message: `Created ${missingFlags.length} missing flags`, type: 'success' });
      loadFlags();
    } catch (error) {
      console.error('[ADMIN] Error creating flags:', error);
      setToast({ message: 'Failed to create flags', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin/bugs')}
            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back to Admin
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
                <Flag className="w-8 h-8 text-purple-600" />
                Feature Flags
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage global feature flags for gradual rollout
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={createMissingFlags}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Save className="w-4 h-4" />
                Create Missing Flags
              </button>
              <button
                onClick={loadFlags}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Flags List */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="grid grid-cols-1 gap-4">
              {flags.map((flag) => (
                <div
                  key={flag.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <code className="text-sm font-mono text-purple-600 dark:text-purple-400">
                        {flag.key}
                      </code>
                      <span className={`px-2 py-1 text-xs font-semibold rounded ${
                        flag.enabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {flag.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {flag.description || FLAG_DESCRIPTIONS[flag.key] || 'No description'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Updated: {new Date(flag.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleFlag(flag)}
                    disabled={saving}
                    className={`ml-6 p-2 rounded-lg transition ${
                      flag.enabled
                        ? 'bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                    } disabled:opacity-50`}
                  >
                    {flag.enabled ? (
                      <ToggleRight className="w-6 h-6" />
                    ) : (
                      <ToggleLeft className="w-6 h-6" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {flags.length === 0 && (
              <div className="text-center py-12">
                <Flag className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  No feature flags found
                </p>
                <button
                  onClick={createMissingFlags}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Create Default Flags
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="font-bold text-blue-900 dark:text-blue-200 mb-2">
            ℹ️ Flag Resolution Hierarchy
          </h3>
          <ol className="list-decimal list-inside text-blue-800 dark:text-blue-300 space-y-1">
            <li>Environment variables (e.g., <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">FEATURE_UI_CASUAL_LANDING</code>)</li>
            <li>User-specific overrides (in <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">feature_flags</code> table)</li>
            <li>Global flags (shown above)</li>
            <li>Default values (hardcoded in code)</li>
          </ol>
          <p className="text-sm text-blue-700 dark:text-blue-400 mt-4">
            Changes take effect within 60 seconds due to in-memory caching.
          </p>
        </div>
      </div>
    </div>
  );
}
