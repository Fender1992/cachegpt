'use client';

import React, { useState, useCallback } from 'react';
import {
  Bug,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Search,
  ExternalLink,
  FolderKanban,
  CircleDot,
  User,
  Tag,
  MessageSquare,
} from 'lucide-react';
import { useJira } from '@/hooks/useJira';
import { JiraProject } from '@/lib/jira/jira-client';
import { cn } from '@/lib/utils';

interface JiraPanelContentProps {
  isActive: boolean;
}

type PanelView = 'projects' | 'issues' | 'issue_detail';

function getStatusColor(statusCategory: string): string {
  switch (statusCategory) {
    case 'new': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'indeterminate': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'done': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }
}

export default function JiraPanelContent({ isActive }: JiraPanelContentProps) {
  const jira = useJira();
  const [view, setView] = useState<PanelView>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleProjectSelect = useCallback(async (project: JiraProject) => {
    await jira.selectProject(project);
    setView('issues');
  }, [jira.selectProject]);

  const handleIssueSelect = useCallback(async (issueKey: string) => {
    await jira.selectIssue(issueKey);
    setView('issue_detail');
  }, [jira.selectIssue]);

  const handleBack = useCallback(() => {
    if (view === 'issue_detail') {
      jira.clearSelectedIssue();
      setView('issues');
    } else if (view === 'issues') {
      setView('projects');
    }
  }, [view, jira.clearSelectedIssue]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      await jira.searchIssues(`text ~ "${searchQuery.trim()}" ORDER BY updated DESC`);
      setView('issues');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, jira.searchIssues]);

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

  return (
    <div className="flex flex-col h-full">
      {/* Error state */}
      {jira.error && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{jira.error}</span>
          </div>
          <button
            onClick={() => jira.connect()}
            className="mt-2 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {jira.isConnecting && (
        <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Connecting to Jira...</span>
          </div>
        </div>
      )}

      {!jira.isConnected && !jira.isConnecting && !jira.error && (
        <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            Connect to Jira to browse your projects and issues
          </p>
          <button
            onClick={() => jira.connect()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Connect Jira
          </button>
        </div>
      )}

      {/* Navigation header */}
      {jira.isConnected && view !== 'projects' && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleBack}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {view === 'issue_detail' ? 'Issue Details' : jira.selectedProject?.name || 'Issues'}
          </span>
        </div>
      )}

      {/* Main Content */}
      {jira.isConnected && (
        <div className="flex-1 overflow-y-auto">
          {view === 'projects' && (
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
                      placeholder="Search Jira issues..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </button>
                </div>
              </div>

              {/* Site info */}
              {jira.siteName && (
                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  Site: {jira.siteName}
                </div>
              )}

              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {jira.projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleProjectSelect(project)}
                    className="w-full p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div className="flex items-center gap-3">
                      {project.avatarUrl ? (
                        <img src={project.avatarUrl} alt="" className="w-8 h-8 rounded" />
                      ) : (
                        <FolderKanban className="w-8 h-8 text-blue-500" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {project.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {project.key} | {project.projectTypeKey}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {jira.projects.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <FolderKanban className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">No projects found</p>
                </div>
              )}
            </div>
          )}

          {view === 'issues' && (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {jira.issues.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => handleIssueSelect(issue.key)}
                  className="w-full p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0">
                      {issue.key}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {issue.summary}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', getStatusColor(issue.statusCategory))}>
                          {issue.status}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {issue.issueType}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDate(issue.updated)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              {jira.issues.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <CircleDot className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">No issues found</p>
                </div>
              )}
            </div>
          )}

          {view === 'issue_detail' && jira.selectedIssue && (
            <div className="p-4">
              <div className="mb-4">
                <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{jira.selectedIssue.key}</span>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                  {jira.selectedIssue.summary}
                </h3>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs px-2 py-1 rounded-full font-medium', getStatusColor(jira.selectedIssue.statusCategory))}>
                    {jira.selectedIssue.status}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {jira.selectedIssue.issueType} | {jira.selectedIssue.priority}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">Assignee:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{jira.selectedIssue.assignee}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">Reporter:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{jira.selectedIssue.reporter}</span>
                </div>

                {jira.selectedIssue.labels.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Tag className="w-4 h-4 text-gray-400" />
                    {jira.selectedIssue.labels.map((label) => (
                      <span key={label} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {jira.selectedIssue.description && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</h4>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {jira.selectedIssue.description}
                  </div>
                </div>
              )}

              {jira.selectedIssue.comments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" />
                    Comments ({jira.selectedIssue.comments.length})
                  </h4>
                  <div className="space-y-3">
                    {jira.selectedIssue.comments.map((comment) => (
                      <div key={comment.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-900 dark:text-white">{comment.author}</span>
                          <span className="text-xs text-gray-400">{formatDate(comment.created)}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {comment.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 text-xs text-gray-400">
                Created: {formatDate(jira.selectedIssue.created)} | Updated: {formatDate(jira.selectedIssue.updated)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
