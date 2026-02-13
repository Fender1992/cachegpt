'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Mail,
  Tag,
  Send,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Inbox,
  PenSquare,
} from 'lucide-react';
import { useGmail } from '@/hooks/useGmail';
import { GmailLabel } from '@/lib/gmail/gmail-client';
import { cn } from '@/lib/utils';

interface GmailPanelProps {
  className?: string;
}

type PanelView = 'labels' | 'messages' | 'message' | 'compose';

export default function GmailPanel({ className }: GmailPanelProps) {
  const gmail = useGmail();
  const [view, setView] = useState<PanelView>('labels');
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyThreadId, setReplyThreadId] = useState<string | undefined>();
  const [replyInReplyTo, setReplyInReplyTo] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset view when panel closes
  useEffect(() => {
    if (!gmail.isPanelOpen) {
      setView('labels');
    }
  }, [gmail.isPanelOpen]);

  const handleLabelSelect = useCallback(async (label: GmailLabel) => {
    await gmail.selectLabel(label);
    setView('messages');
  }, [gmail.selectLabel]);

  const handleMessageSelect = useCallback(async (messageId: string) => {
    await gmail.selectMessage(messageId);
    setView('message');
  }, [gmail.selectMessage]);

  const handleBack = useCallback(() => {
    if (view === 'message') {
      gmail.clearSelectedMessage();
      setView('messages');
    } else if (view === 'messages' || view === 'compose') {
      setView('labels');
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setReplyThreadId(undefined);
      setReplyInReplyTo(undefined);
    }
  }, [view, gmail.clearSelectedMessage]);

  const handleCompose = useCallback(() => {
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    setReplyThreadId(undefined);
    setReplyInReplyTo(undefined);
    setView('compose');
  }, []);

  const handleReply = useCallback(() => {
    if (!gmail.selectedMessage) return;
    setComposeTo(gmail.selectedMessage.from);
    setComposeSubject(`Re: ${gmail.selectedMessage.subject}`);
    setComposeBody('');
    setReplyThreadId(gmail.selectedMessage.threadId);
    setReplyInReplyTo(gmail.selectedMessage.messageId);
    setView('compose');
  }, [gmail.selectedMessage]);

  const handleSend = useCallback(async () => {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim() || isSending) return;

    setIsSending(true);
    try {
      const success = await gmail.sendEmail(
        composeTo.trim(),
        composeSubject.trim(),
        composeBody.trim(),
        replyThreadId,
        replyInReplyTo
      );
      if (success) {
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        setReplyThreadId(undefined);
        setReplyInReplyTo(undefined);
        setView('labels');
      }
    } finally {
      setIsSending(false);
    }
  }, [composeTo, composeSubject, composeBody, isSending, gmail.sendEmail, replyThreadId, replyInReplyTo]);

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const extractName = (from: string): string => {
    const match = from.match(/^"?([^"<]+)"?\s*</);
    return match ? match[1].trim() : from.split('@')[0];
  };

  // System labels to show prominently
  const SYSTEM_LABELS = ['INBOX', 'SENT', 'DRAFT', 'STARRED', 'IMPORTANT', 'SPAM', 'TRASH'];
  const LABEL_DISPLAY: Record<string, string> = {
    INBOX: 'Inbox',
    SENT: 'Sent',
    DRAFT: 'Drafts',
    STARRED: 'Starred',
    IMPORTANT: 'Important',
    SPAM: 'Spam',
    TRASH: 'Trash',
  };

  const systemLabels = gmail.labels.filter(l => SYSTEM_LABELS.includes(l.id));
  const userLabels = gmail.labels.filter(l => l.type === 'user');

  if (!gmail.isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={gmail.closePanel}
      />
      <div className={cn(
        'fixed top-[85px] left-0 h-[calc(100%-85px-4rem)] w-96 max-w-[85vw] bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col rounded-br-xl',
        'transform transition-transform duration-300 ease-in-out',
        className
      )}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          {view !== 'labels' && (
            <button
              onClick={handleBack}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <Mail className="w-5 h-5 text-red-600 dark:text-red-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Gmail
          </h2>
          {gmail.isConnected && gmail.email && (
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
              {gmail.email}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {gmail.isConnected && (
            <button
              onClick={handleCompose}
              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              aria-label="Compose email"
            >
              <PenSquare className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={gmail.closePanel}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close Gmail panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error state */}
      {gmail.error && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{gmail.error}</span>
          </div>
          <button
            onClick={() => gmail.connect()}
            className="mt-2 px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {gmail.isConnecting && (
        <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Connecting to Gmail...</span>
          </div>
        </div>
      )}

      {!gmail.isConnected && !gmail.isConnecting && !gmail.error && (
        <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            Connect to Gmail to access your emails
          </p>
          <button
            onClick={() => gmail.connect()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Connect Gmail
          </button>
        </div>
      )}

      {/* Main Content */}
      {gmail.isConnected && (
        <div className="flex-1 overflow-y-auto">
          {/* Labels View */}
          {view === 'labels' && (
            <div className="p-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Labels
              </h3>
              <div className="space-y-1">
                {systemLabels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => handleLabelSelect(label)}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-lg text-left text-sm transition-colors',
                      gmail.selectedLabel?.id === label.id
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {label.id === 'INBOX' ? (
                        <Inbox className="w-4 h-4" />
                      ) : (
                        <Tag className="w-4 h-4" />
                      )}
                      <span>{LABEL_DISPLAY[label.id] || label.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {label.messagesUnread > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500 text-white font-medium">
                          {label.messagesUnread}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {label.messagesTotal}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {userLabels.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-4 mb-2">
                    Custom Labels
                  </h3>
                  <div className="space-y-1">
                    {userLabels.map((label) => (
                      <button
                        key={label.id}
                        onClick={() => handleLabelSelect(label)}
                        className={cn(
                          'w-full flex items-center justify-between p-2 rounded-lg text-left text-sm transition-colors',
                          gmail.selectedLabel?.id === label.id
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5" />
                          <span className="truncate">{label.name}</span>
                        </div>
                        {label.messagesUnread > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500 text-white font-medium">
                            {label.messagesUnread}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Messages List View */}
          {view === 'messages' && (
            <div>
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {gmail.selectedLabel ? (LABEL_DISPLAY[gmail.selectedLabel.id] || gmail.selectedLabel.name) : 'Messages'}
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {gmail.messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => handleMessageSelect(msg.id)}
                    className={cn(
                      'w-full p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800',
                      msg.isUnread && 'bg-blue-50/50 dark:bg-blue-900/10'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={cn(
                        'text-sm truncate',
                        msg.isUnread
                          ? 'font-semibold text-gray-900 dark:text-white'
                          : 'text-gray-700 dark:text-gray-300'
                      )}>
                        {extractName(msg.from)}
                      </span>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                        {formatDate(msg.date)}
                      </span>
                    </div>
                    <div className={cn(
                      'text-sm truncate',
                      msg.isUnread
                        ? 'font-medium text-gray-800 dark:text-gray-200'
                        : 'text-gray-600 dark:text-gray-400'
                    )}>
                      {msg.subject || '(no subject)'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 truncate mt-0.5">
                      {msg.snippet}
                    </div>
                  </button>
                ))}
              </div>
              {gmail.nextPageToken && (
                <div className="p-3 text-center">
                  <button
                    onClick={() => gmail.loadMoreMessages()}
                    className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Load more
                  </button>
                </div>
              )}
              {gmail.messages.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No messages in this label
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Single Message View */}
          {view === 'message' && gmail.selectedMessage && (
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {gmail.selectedMessage.subject || '(no subject)'}
              </h3>
              <div className="space-y-1 mb-4 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 dark:text-gray-400">From:</span>
                  <span className="text-gray-900 dark:text-white">{gmail.selectedMessage.from}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 dark:text-gray-400">To:</span>
                  <span className="text-gray-900 dark:text-white">{gmail.selectedMessage.to}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Date:</span>
                  <span className="text-gray-900 dark:text-white">
                    {new Date(gmail.selectedMessage.date).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                  {gmail.selectedMessage.body}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleReply}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Reply
                </button>
              </div>
            </div>
          )}

          {/* Compose View */}
          {view === 'compose' && (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Message</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your email..."
                  rows={10}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSend}
                  disabled={!composeTo.trim() || !composeSubject.trim() || !composeBody.trim() || isSending}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isSending ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={handleBack}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
