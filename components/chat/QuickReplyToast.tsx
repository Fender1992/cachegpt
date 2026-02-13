'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, MessageCircle, Mail } from 'lucide-react';
import { useDiscord } from '@/hooks/useDiscord';
import { useGmail } from '@/hooks/useGmail';
import { cn } from '@/lib/utils';

interface QuickNotification {
  id: string;
  type: 'discord' | 'gmail';
  title: string;
  preview: string;
  timestamp: number;
}

const TOAST_DURATION = 15_000; // 15 seconds before auto-dismiss

export default function QuickReplyToast() {
  const discord = useDiscord();
  const gmail = useGmail();
  const [notifications, setNotifications] = useState<QuickNotification[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevDiscordCount = useRef(discord.messages.length);
  const prevGmailCount = useRef(gmail.messages?.length || 0);

  // Watch for new Discord messages
  useEffect(() => {
    const currentCount = discord.messages.length;
    if (currentCount > prevDiscordCount.current && !discord.isPanelOpen && discord.selectedChannel) {
      const newMsg = discord.messages[currentCount - 1];
      // Don't notify for own messages
      if (newMsg && newMsg.author?.id !== discord.user?.id) {
        const notification: QuickNotification = {
          id: `discord-${newMsg.id}`,
          type: 'discord',
          title: `#${discord.selectedChannel.name} — ${newMsg.author?.username || 'Someone'}`,
          preview: newMsg.content?.slice(0, 120) || '(attachment)',
          timestamp: Date.now(),
        };
        setNotifications(prev => [...prev.slice(-2), notification]); // Keep max 3
      }
    }
    prevDiscordCount.current = currentCount;
  }, [discord.messages.length, discord.isPanelOpen, discord.selectedChannel, discord.user?.id]);

  // Watch for new Gmail messages
  useEffect(() => {
    const currentCount = gmail.messages?.length || 0;
    if (currentCount > prevGmailCount.current && !gmail.isPanelOpen) {
      const newMsg = gmail.messages?.[0]; // Gmail shows newest first
      if (newMsg) {
        const notification: QuickNotification = {
          id: `gmail-${newMsg.id}`,
          type: 'gmail',
          title: newMsg.from || 'New email',
          preview: newMsg.subject?.slice(0, 120) || '(no subject)',
          timestamp: Date.now(),
        };
        setNotifications(prev => [...prev.slice(-2), notification]);
      }
    }
    prevGmailCount.current = currentCount;
  }, [gmail.messages?.length, gmail.isPanelOpen]);

  // Auto-dismiss old notifications
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications(prev =>
        prev.filter(n => Date.now() - n.timestamp < TOAST_DURATION)
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Focus input when replying
  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (replyingTo === id) {
      setReplyingTo(null);
      setReplyText('');
    }
  }, [replyingTo]);

  const handleReply = useCallback(async (notification: QuickNotification) => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      if (notification.type === 'discord') {
        await discord.sendMessage(replyText.trim());
      }
      // Gmail reply would need more context (to, subject, threadId), so just open the panel
      setReplyText('');
      setReplyingTo(null);
      dismiss(notification.id);
    } catch (err) {
      console.error('[QuickReply] Failed to send:', err);
    } finally {
      setSending(false);
    }
  }, [replyText, discord, dismiss]);

  const openPanel = useCallback((notification: QuickNotification) => {
    dismiss(notification.id);
    if (notification.type === 'discord') {
      discord.openPanel();
    } else {
      gmail.openPanel();
    }
  }, [discord, gmail, dismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden animate-in slide-in-from-right"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50">
            {notification.type === 'discord' ? (
              <MessageCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
            ) : (
              <Mail className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
              {notification.title}
            </span>
            <button
              onClick={() => dismiss(notification.id)}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Preview */}
          <div className="px-3 py-2">
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {notification.preview}
            </p>
          </div>

          {/* Actions */}
          {replyingTo === notification.id ? (
            <div className="flex items-center gap-2 px-3 pb-2">
              <input
                ref={inputRef}
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleReply(notification);
                  }
                  if (e.key === 'Escape') {
                    setReplyingTo(null);
                    setReplyText('');
                  }
                }}
                placeholder="Type a reply..."
                disabled={sending}
                className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => handleReply(notification)}
                disabled={sending || !replyText.trim()}
                className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 pb-2">
              {notification.type === 'discord' && discord.selectedChannel && (
                <button
                  onClick={() => setReplyingTo(notification.id)}
                  className="text-xs px-2.5 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                >
                  Quick Reply
                </button>
              )}
              <button
                onClick={() => openPanel(notification)}
                className="text-xs px-2.5 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                Open
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
