'use client';

import { useState } from 'react';
import { ChevronDown, Sparkles, Code, Zap } from 'lucide-react';

interface Preset {
  id: string;
  name: string;
  description: string;
  icon: typeof Sparkles;
  color: string;
}

const presets: Preset[] = [
  {
    id: 'smart',
    name: 'Smart',
    description: 'Balanced for general questions',
    icon: Sparkles,
    color: 'purple',
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'More imaginative responses',
    icon: Zap,
    color: 'yellow',
  },
  {
    id: 'code',
    name: 'Code',
    description: 'Optimized for programming',
    icon: Code,
    color: 'blue',
  },
];

interface ModelPresetProps {
  value?: string;
  onChange?: (preset: string) => void;
  className?: string;
}

export default function ModelPreset({
  value = 'smart',
  onChange,
  className = '',
}: ModelPresetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedPreset = presets.find((p) => p.id === value) || presets[0];
  const SelectedIcon = selectedPreset.icon;

  const colorClasses = {
    purple: {
      bg: 'bg-purple-100 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-300 dark:border-purple-700',
      hover: 'hover:bg-purple-50 dark:hover:bg-purple-900/10',
    },
    yellow: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/20',
      text: 'text-yellow-600 dark:text-yellow-400',
      border: 'border-yellow-300 dark:border-yellow-700',
      hover: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/10',
    },
    blue: {
      bg: 'bg-blue-100 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-300 dark:border-blue-700',
      hover: 'hover:bg-blue-50 dark:hover:bg-blue-900/10',
    },
  };

  const handleSelect = (presetId: string) => {
    onChange?.(presetId);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
          colorClasses[selectedPreset.color as keyof typeof colorClasses].border
        } ${
          colorClasses[selectedPreset.color as keyof typeof colorClasses].bg
        } ${
          colorClasses[selectedPreset.color as keyof typeof colorClasses].hover
        } transition-colors`}
      >
        <SelectedIcon
          className={`w-4 h-4 ${
            colorClasses[selectedPreset.color as keyof typeof colorClasses].text
          }`}
        />
        <span
          className={`font-medium ${
            colorClasses[selectedPreset.color as keyof typeof colorClasses].text
          }`}
        >
          {selectedPreset.name}
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${
            isOpen ? 'rotate-180' : ''
          } ${
            colorClasses[selectedPreset.color as keyof typeof colorClasses].text
          }`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full mt-2 left-0 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
            {presets.map((preset) => {
              const Icon = preset.icon;
              const colors =
                colorClasses[preset.color as keyof typeof colorClasses];
              const isSelected = preset.id === value;

              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelect(preset.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    isSelected
                      ? 'bg-gray-50 dark:bg-gray-700'
                      : 'bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${colors.bg}`}>
                    <Icon className={`w-4 h-4 ${colors.text}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {preset.name}
                      </span>
                      {isSelected && (
                        <span className={`text-xs px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                      {preset.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
