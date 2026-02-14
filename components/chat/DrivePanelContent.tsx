'use client';

import React, { useState, useCallback } from 'react';
import {
  HardDrive,
  FileText,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Search,
  ExternalLink,
  File,
  Sheet,
  Presentation,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import { useDrive } from '@/hooks/useDrive';
import { cn } from '@/lib/utils';

interface DrivePanelContentProps {
  isActive: boolean;
}

type PanelView = 'files' | 'file_detail';

function getMimeIcon(mimeType: string) {
  if (mimeType.includes('document') || mimeType.includes('text')) return <FileText className="w-5 h-5 text-blue-500" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return <Sheet className="w-5 h-5 text-green-500" />;
  if (mimeType.includes('presentation')) return <Presentation className="w-5 h-5 text-orange-500" />;
  if (mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-purple-500" />;
  return <File className="w-5 h-5 text-gray-400" />;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function DrivePanelContent({ isActive }: DrivePanelContentProps) {
  const drive = useDrive();
  const [view, setView] = useState<PanelView>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (fileId: string) => {
    await drive.selectFile(fileId);
    setView('file_detail');
  }, [drive.selectFile]);

  const handleBack = useCallback(() => {
    drive.clearSelectedFile();
    setView('files');
  }, [drive.clearSelectedFile]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      await drive.searchFiles(searchQuery.trim());
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, drive.searchFiles]);

  const handleDelete = useCallback(async (fileId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirmDeleteId !== fileId) {
      setConfirmDeleteId(fileId);
      return;
    }
    setDeletingFileId(fileId);
    setConfirmDeleteId(null);
    try {
      const success = await drive.deleteFile(fileId);
      if (success && view === 'file_detail') {
        setView('files');
      }
    } finally {
      setDeletingFileId(null);
    }
  }, [confirmDeleteId, drive.deleteFile, view]);

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
      {drive.error && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{drive.error}</span>
          </div>
          <button
            onClick={() => drive.connect()}
            className="mt-2 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {drive.isConnecting && (
        <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Connecting to Google Drive...</span>
          </div>
        </div>
      )}

      {!drive.isConnected && !drive.isConnecting && !drive.error && (
        <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            Connect to Google Drive to browse your files
          </p>
          <button
            onClick={() => drive.connect()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Connect Drive
          </button>
        </div>
      )}

      {/* Navigation header for detail view */}
      {drive.isConnected && view === 'file_detail' && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleBack}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            File Preview
          </span>
        </div>
      )}

      {/* Main Content */}
      {drive.isConnected && (
        <div className="flex-1 overflow-y-auto">
          {view === 'files' && (
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
                      placeholder="Search Drive..."
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

              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {drive.files.map((file) => (
                  <div
                    key={file.id}
                    className="group w-full p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-start gap-3"
                    onClick={() => handleFileSelect(file.id)}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {getMimeIcon(file.mimeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {file.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {file.size && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatSize(file.size)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {formatDate(file.modifiedTime)}
                        </span>
                      </div>
                      {confirmDeleteId === file.id && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-red-500">Move to trash?</span>
                          <button
                            onClick={(e) => handleDelete(file.id, e)}
                            className="text-xs text-red-600 hover:text-red-700 font-medium"
                          >
                            Yes
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                          >
                            No
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDelete(file.id, e)}
                      disabled={deletingFileId === file.id}
                      className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all disabled:opacity-50"
                      title="Move to trash"
                    >
                      {deletingFileId === file.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              {drive.files.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <HardDrive className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">No files found</p>
                </div>
              )}
            </div>
          )}

          {view === 'file_detail' && drive.selectedFile && (
            <div className="p-4">
              <div className="flex items-start gap-2 mb-4">
                {getMimeIcon(drive.selectedFile.file.mimeType)}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {drive.selectedFile.file.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {drive.selectedFile.file.mimeType}
                    {drive.selectedFile.file.size && ` | ${formatSize(drive.selectedFile.file.size)}`}
                  </p>
                </div>
              </div>

              {drive.selectedFile.content ? (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <pre className="p-4 text-sm text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto bg-gray-50 dark:bg-gray-800">
                    {drive.selectedFile.content}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  Content preview not available for this file type.
                </p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
                {drive.selectedFile.file.webViewLink && (
                  <a
                    href={drive.selectedFile.file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in Drive
                  </a>
                )}
                {confirmDeleteId === drive.selectedFile.file.id ? (
                  <div className="inline-flex items-center gap-2">
                    <span className="text-sm text-red-500">Move to trash?</span>
                    <button
                      onClick={() => handleDelete(drive.selectedFile!.file.id)}
                      disabled={deletingFileId === drive.selectedFile.file.id}
                      className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deletingFileId === drive.selectedFile.file.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleDelete(drive.selectedFile!.file.id)}
                    disabled={deletingFileId === drive.selectedFile.file.id}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:text-red-700 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
