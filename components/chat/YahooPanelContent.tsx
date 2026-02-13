'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Tag,
  Send,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Inbox,
  PenSquare,
} from 'lucide-react';
import { useYahoo } from '@/hooks/useYahoo';
import { YahooLabel } from '@/lib/yahoo/yahoo-client';
import { cn } from '@/lib/utils';

interface YahooPanelContentProps {
  isActive: boolean;
}

type PanelView = 'labels' | 'messages' | 'message' | 'compose';

export default function YahooPanelContent({ isActive }: YahooPanelContentProps) {
  const yahoo = useYahoo();
  const [view, setView] = useState<PanelView>('labels');
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyThreadId, setReplyThreadId] = useState<string | undefined>();
  const [replyInReplyTo, setReplyInReplyTo] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleLabelSelect = useCallback(async (label: YahooLabel) => {
    await yahoo.selectLabel(label);
    setView('messages');
  }, [yahoo.selectLabel]);

  const handleMessageSelect = useCallback(async (messageId: string) => {
    await yahoo.selectMessage(messageId);
    setView('message');
  }, [yahoo.selectMessage]);

  const handleBack = useCallback(() => {
    if (view === 'message') {
      yahoo.clearSelectedMessage();
      setView('messages');
    } else if (view === 'messages' || view === 'compose') {
      setView('labels');
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setReplyThreadId(undefined);
      setReplyInReplyTo(undefined);
    }
  }, [view, yahoo.clearSelectedMessage]);

  const handleCompose = useCallback(() => {
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    setReplyThreadId(undefined);
    setReplyInReplyTo(undefined);
    setView('compose');
  }, []);

  const handleReply = useCallback(() => {
    if (!yahoo.selectedMessage) return;
    setComposeTo(yahoo.selectedMessage.from);
    setComposeSubject(`Re: ${yahoo.selectedMessage.subject}`);
    setComposeBody('');
    setReplyThreadId(yahoo.selectedMessage.threadId);
    setReplyInReplyTo(yahoo.selectedMessage.messageId);
    setView('compose');
  }, [yahoo.selectedMessage]);

  const handleSend = useCallback(async () => {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim() || isSending) return;
    setIsSending(true);
    try {
      const success = await yahoo.sendEmail(
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
  }, [composeTo, composeSubject, composeBody, isSending, yahoo.sendEmail, replyThreadId, replyInReplyTo]);

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

  const STANDARD_FOLDERS = ['INBOX', 'Sent', 'Draft', 'Bulk Mail', 'Trash', 'Archive'];
  const FOLDER_DISPLAY: Record<string, string> = {
    INBOX: 'Inbox',
    Sent: 'Sent',
    Draft: 'Drafts',
    'Bulk Mail': 'Spam',
    Trash: 'Trash',
    Archive: 'Archive',
  };

  const standardFolders = yahoo.labels.filter(l =>
    STANDARD_FOLDERS.includes(l.id) || STANDARD_FOLDERS.includes(l.name)
  );
  const userFolders = yahoo.labels.filter(l =>
    !STANDARD_FOLDERS.includes(l.id) && !STANDARD_FOLDERS.includes(l.name)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Error state */}
      {yahoo.error && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{yahoo.error}</span>
          </div>
          <button
            onClick={() => yahoo.connect()}
            className="mt-2 px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {yahoo.isConnecting && (
        <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Connecting to Yahoo Mail...</span>
          </div>
        </div>
      )}

      {!yahoo.isConnected && !yahoo.isConnecting && !yahoo.error && (
        <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            Connect to Yahoo Mail to access your emails
          </p>
          <button
            onClick={() => yahoo.connect()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Connect Yahoo Mail
          </button>
        </div>
      )}

      {/* Navigation header for sub-views */}
      {yahoo.isConnected && view !== 'labels' && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleBack}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {view === 'compose' ? 'Compose' : view === 'message' ? 'Message' : 'Messages'}
          </span>
          <div className="ml-auto">
            {view !== 'compose' && (
              <button
                onClick={handleCompose}
                className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                aria-label="Compose email"
              >
                <PenSquare className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compose button on labels view */}
      {yahoo.isConnected && view === 'labels' && (
        <div className="flex-shrink-0 flex items-center justify-end px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleCompose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
          >
            <PenSquare className="w-4 h-4" />
            Compose
          </button>
        </div>
      )}

      {/* Main Content */}
      {yahoo.isConnected && (
        <div className="flex-1 overflow-y-auto">
          {view === 'labels' && (
            <div className="p-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Folders
              </h3>
              <div className="space-y-1">
                {standardFolders.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => handleLabelSelect(label)}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-lg text-left text-sm transition-colors',
                      yahoo.selectedLabel?.id === label.id
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {label.id === 'INBOX' || label.name === 'Inbox' ? (
                        <Inbox className="w-4 h-4" />
                      ) : (
                        <Tag className="w-4 h-4" />
                      )}
                      <span>{FOLDER_DISPLAY[label.id] || FOLDER_DISPLAY[label.name] || label.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {label.messagesUnread > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500 text-white font-medium">
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

              {userFolders.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-4 mb-2">
                    Custom Folders
                  </h3>
                  <div className="space-y-1">
                    {userFolders.map((label) => (
                      <button
                        key={label.id}
                        onClick={() => handleLabelSelect(label)}
                        className={cn(
                          'w-full flex items-center justify-between p-2 rounded-lg text-left text-sm transition-colors',
                          yahoo.selectedLabel?.id === label.id
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5" />
                          <span className="truncate">{label.name}</span>
                        </div>
                        {label.messagesUnread > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500 text-white font-medium">
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

          {view === 'messages' && (
            <div>
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {yahoo.selectedLabel ? (FOLDER_DISPLAY[yahoo.selectedLabel.id] || FOLDER_DISPLAY[yahoo.selectedLabel.name] || yahoo.selectedLabel.name) : 'Messages'}
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {yahoo.messages.map((msg) => (
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
              {yahoo.nextPageToken && (
                <div className="p-3 text-center">
                  <button
                    onClick={() => yahoo.loadMoreMessages()}
                    className="px-4 py-2 text-sm text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                  >
                    Load more
                  </button>
                </div>
              )}
              {yahoo.messages.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No messages in this folder
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {view === 'message' && yahoo.selectedMessage && (
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {yahoo.selectedMessage.subject || '(no subject)'}
              </h3>
              <div className="space-y-1 mb-4 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 dark:text-gray-400">From:</span>
                  <span className="text-gray-900 dark:text-white">{yahoo.selectedMessage.from}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 dark:text-gray-400">To:</span>
                  <span className="text-gray-900 dark:text-white">{yahoo.selectedMessage.to}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Date:</span>
                  <span className="text-gray-900 dark:text-white">
                    {new Date(yahoo.selectedMessage.date).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                  {yahoo.selectedMessage.body}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleReply}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Reply
                </button>
              </div>
            </div>
          )}

          {view === 'compose' && (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Message</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your email..."
                  rows={10}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSend}
                  disabled={!composeTo.trim() || !composeSubject.trim() || !composeBody.trim() || isSending}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
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
  );
}
