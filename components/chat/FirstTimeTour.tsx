'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

const TOUR_STEPS = [
  {
    target: null, // centered modal
    title: 'Welcome to CacheGPT!',
    description: "Let's take a quick tour of the features available to you.",
    position: 'center' as const,
  },
  {
    target: 'provider-selector',
    title: 'Provider Selector',
    description: 'Choose your AI provider — ChatGPT, Claude, Gemini, or Perplexity.',
    position: 'bottom' as const,
  },
  {
    target: 'quality-mode',
    title: 'Quality Mode',
    description: 'Toggle between Fast responses and Best quality (Self-MoA).',
    position: 'bottom' as const,
  },
  {
    target: 'chat-input',
    title: 'Chat Input',
    description: 'Type your message here. Attach files or reference past conversations.',
    position: 'top' as const,
  },
  {
    target: 'integrations',
    title: 'Integrations Dock',
    description: 'Connect Discord, Gmail, Slack, Teams, Calendar, and more.',
    position: 'left' as const,
  },
  {
    target: 'history',
    title: 'History',
    description: 'Access and manage your conversation history.',
    position: 'bottom' as const,
  },
  {
    target: 'settings',
    title: 'Settings',
    description: "Manage API keys and integrations. You're all set!",
    position: 'bottom' as const,
  },
];

interface FirstTimeTourProps {
  onComplete?: () => void;
}

export default function FirstTimeTour({ onComplete }: FirstTimeTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const completed = localStorage.getItem('tourCompleted');
    if (!completed) {
      // Small delay so DOM elements are mounted
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const updateTargetRect = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!isVisible) return;
    updateTargetRect();

    const handleResize = () => updateTargetRect();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isVisible, currentStep, updateTargetRect]);

  const dismiss = useCallback(() => {
    localStorage.setItem('tourCompleted', 'true');
    setIsVisible(false);
    onComplete?.();
  }, [onComplete]);

  const next = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      dismiss();
    }
  };

  const back = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentStep];
  const isCenter = step.position === 'center';
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const padding = 8;

  // Calculate tooltip style
  const getTooltipStyle = (): React.CSSProperties => {
    if (isCenter || !targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const style: React.CSSProperties = { position: 'fixed' };
    const gap = 12;

    switch (step.position) {
      case 'bottom':
        style.top = targetRect.bottom + gap;
        style.left = targetRect.left + targetRect.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'top':
        style.bottom = window.innerHeight - targetRect.top + gap;
        style.left = targetRect.left + targetRect.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'left':
        style.top = targetRect.top + targetRect.height / 2;
        style.right = window.innerWidth - targetRect.left + gap;
        style.transform = 'translateY(-50%)';
        break;
    }

    return style;
  };

  return (
    <div className="fixed inset-0 z-[200]" aria-modal="true" role="dialog">
      {/* Backdrop — click to dismiss */}
      <div className="fixed inset-0" onClick={dismiss} />

      {/* Spotlight cutout */}
      {targetRect && !isCenter && (
        <div
          className="fixed rounded-lg pointer-events-none"
          style={{
            top: targetRect.top - padding,
            left: targetRect.left - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)',
            zIndex: 200,
          }}
        />
      )}

      {/* Dark overlay for center modal */}
      {isCenter && (
        <div className="fixed inset-0 bg-black/70 pointer-events-none" />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={getTooltipStyle()}
        className="z-[201] bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 w-[320px] max-w-[90vw]"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {isCenter && <Sparkles className="w-5 h-5 text-blue-500" />}
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {step.title}
            </h3>
          </div>
          <button
            onClick={dismiss}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          {step.description}
        </p>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentStep
                  ? 'bg-blue-500'
                  : i < currentStep
                    ? 'bg-blue-300 dark:bg-blue-700'
                    : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={dismiss}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={back}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1 px-4 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
