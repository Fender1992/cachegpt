'use client';

import { useState } from 'react';
import { Share2, Check, Loader2 } from 'lucide-react';

interface ShareButtonProps {
  prompt: string;
  content: string;
  isGuest?: boolean;
  onShare?: (url: string) => void;
}

/**
 * Share button for chat messages
 * Creates public shareable link and copies to clipboard
 */
export default function ShareButton({
  prompt,
  content,
  isGuest = false,
  onShare,
}: ShareButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    if (isSharing || shared) return;

    setIsSharing(true);

    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          contentMd: content,
          isGuest,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create share');
      }

      const data = await response.json();
      const shareUrl = `${window.location.origin}${data.url}`;

      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl);

      setShared(true);
      onShare?.(shareUrl);

      // Reset after 3 seconds
      setTimeout(() => setShared(false), 3000);

    } catch (error: any) {
      console.error('[SHARE] Error:', error);
      alert(error.message || 'Failed to create share link');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={isSharing || shared}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title={shared ? 'Link copied!' : 'Share this answer'}
      aria-label={shared ? 'Link copied to clipboard' : 'Share answer'}
    >
      {isSharing ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Sharing...</span>
        </>
      ) : shared ? (
        <>
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-green-600 dark:text-green-400">Link copied!</span>
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </>
      )}
    </button>
  );
}
