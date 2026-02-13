'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  BookOpen,
  FileText,
  Database,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Search,
  ExternalLink,
} from 'lucide-react';
import { useNotion } from '@/hooks/useNotion';
import { cn } from '@/lib/utils';

interface NotionPanelProps {
  className?: string;
}

type PanelView = 'pages' | 'page_detail';

export default function NotionPanel({ className }: NotionPanelProps) {
  const notion = useNotion();
  const [view, setView] = useState<PanelView>('pages');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Reset view when panel closes
  useEffect(() => {
    if (!notion.isPanelOpen) {
      setView('pages');
      setSearchQuery('');
    }
  }, [notion.isPanelOpen]);

  const handlePageSelect = useCallback(async (pageId: string) => {
    await notion.selectPage(pageId);
    setView('page_detail');
  }, [notion.selectPage]);

  const handleBack = useCallback(() => {
    if (view === 'page_detail') {
      notion.clearSelectedPage();
      setView('pages');
    }
  }, [view, notion.clearSelectedPage]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      await notion.search(searchQuery.trim());
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, notion.search]);

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

  const renderBlockContent = (block: any): React.ReactNode => {
    if (!block.content) return null;

    switch (block.type) {
      case 'heading_1':
        return <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-4 mb-2">{block.content}</h1>;
      case 'heading_2':
        return <h2 className="text-lg font-semibold text-gray-900 dark:text-white mt-3 mb-1.5">{block.content}</h2>;
      case 'heading_3':
        return <h3 className="text-base font-medium text-gray-900 dark:text-white mt-2 mb-1">{block.content}</h3>;
      case 'bulleted_list_item':
        return <li className="text-sm text-gray-700 dark:text-gray-300 ml-4 list-disc">{block.content}</li>;
      case 'numbered_list_item':
        return <li className="text-sm text-gray-700 dark:text-gray-300 ml-4 list-decimal">{block.content}</li>;
      case 'to_do':
        return <div className="text-sm text-gray-700 dark:text-gray-300 ml-2">{block.content}</div>;
      case 'code':
        return <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto my-2"><code>{block.content}</code></pre>;
      case 'quote':
        return <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-3 italic text-sm text-gray-600 dark:text-gray-400 my-2">{block.content}</blockquote>;
      case 'divider':
        return <hr className="my-3 border-gray-200 dark:border-gray-700" />;
      default:
        return <p className="text-sm text-gray-700 dark:text-gray-300 mb-1.5">{block.content}</p>;
    }
  };

  if (!notion.isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={notion.closePanel}
      />
      <div className={cn(
        'fixed top-[85px] left-0 h-[calc(100%-85px-4rem)] w-96 max-w-[85vw] bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col rounded-br-xl',
        'transform transition-transform duration-300 ease-in-out',
        className
      )}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            {view !== 'pages' && (
              <button
                onClick={handleBack}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <BookOpen className="w-5 h-5 text-gray-800 dark:text-gray-200" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Notion
            </h2>
            {notion.isConnected && notion.workspaceName && (
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                {notion.workspaceName}
              </span>
            )}
          </div>
          <button
            onClick={notion.closePanel}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close Notion panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error state */}
        {notion.error && (
          <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{notion.error}</span>
            </div>
            <button
              onClick={() => notion.connect()}
              className="mt-2 px-3 py-1 text-sm bg-gray-900 hover:bg-gray-800 dark:bg-gray-200 dark:hover:bg-gray-300 dark:text-gray-900 text-white rounded transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}

        {notion.isConnecting && (
          <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Connecting to Notion...</span>
            </div>
          </div>
        )}

        {!notion.isConnected && !notion.isConnecting && !notion.error && (
          <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              Connect to Notion to browse your pages
            </p>
            <button
              onClick={() => notion.connect()}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-200 dark:hover:bg-gray-300 dark:text-gray-900 text-white rounded-lg transition-colors"
            >
              Connect Notion
            </button>
          </div>
        )}

        {/* Main Content */}
        {notion.isConnected && (
          <div className="flex-1 overflow-y-auto">
            {/* Pages List View */}
            {view === 'pages' && (
              <div>
                {/* Search bar */}
                <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSearch();
                        }}
                        placeholder="Search Notion..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <button
                      onClick={handleSearch}
                      disabled={isSearching || !searchQuery.trim()}
                      className="px-3 py-2 text-sm bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
                    >
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {notion.pages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => handlePageSelect(page.id)}
                      className="w-full p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5 text-lg">
                          {page.icon || (page.type === 'database' ? (
                            <Database className="w-5 h-5 text-gray-400" />
                          ) : (
                            <FileText className="w-5 h-5 text-gray-400" />
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {page.title}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                              {page.type}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatDate(page.lastEditedTime)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {notion.hasMore && (
                  <div className="p-3 text-center">
                    <button
                      onClick={() => notion.loadMorePages()}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      Load more
                    </button>
                  </div>
                )}

                {notion.pages.length === 0 && (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm">No pages found</p>
                  </div>
                )}
              </div>
            )}

            {/* Page Detail View */}
            {view === 'page_detail' && notion.selectedPage && (
              <div className="p-4">
                {/* Page header */}
                {notion.selectedPage.page.cover && (
                  <div className="h-32 rounded-lg overflow-hidden mb-4 bg-gray-200 dark:bg-gray-700">
                    <img
                      src={notion.selectedPage.page.cover}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="flex items-start gap-2 mb-4">
                  {notion.selectedPage.page.icon && (
                    <span className="text-2xl">{notion.selectedPage.page.icon}</span>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {notion.selectedPage.page.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Last edited {formatDate(notion.selectedPage.page.lastEditedTime)}
                    </p>
                  </div>
                </div>

                {/* Page content */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  {notion.selectedPage.blocks.length > 0 ? (
                    notion.selectedPage.blocks.map((block) => (
                      <React.Fragment key={block.id}>
                        {renderBlockContent(block)}
                      </React.Fragment>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      This page has no visible content.
                    </p>
                  )}
                </div>

                {/* Open in Notion */}
                {notion.selectedPage.page.url && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <a
                      href={notion.selectedPage.page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 hover:bg-gray-800 dark:bg-gray-200 dark:hover:bg-gray-300 dark:text-gray-900 text-white rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in Notion
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
