'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  File,
  Image as ImageIcon,
  Code,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  preview: string;
  uploadedAt: string;
  conversationId: string | null;
}

interface FileDetail {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  preview: string;
  uploadedAt: string;
  conversationId: string | null;
}

interface FilesPanelContentProps {
  isActive: boolean;
}

type PanelView = 'list' | 'detail';

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-purple-500" />;
  if (type.includes('javascript') || type.includes('typescript') || type.includes('python'))
    return <Code className="w-5 h-5 text-yellow-500" />;
  if (type === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
  if (type.includes('word') || type.includes('document')) return <FileText className="w-5 h-5 text-blue-500" />;
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
    return <FileText className="w-5 h-5 text-green-500" />;
  return <File className="w-5 h-5 text-gray-400" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function FilesPanelContent({ isActive }: FilesPanelContentProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null);
  const [view, setView] = useState<PanelView>('list');
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }, []);

  const loadFiles = useCallback(async () => {
    try {
      setError(null);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/files', { headers });

      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      } else if (res.status === 401) {
        setFiles([]);
      } else {
        setError('Failed to load files');
      }
    } catch {
      setError('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isActive) {
      loadFiles();
    }
  }, [isActive, loadFiles]);

  const handleFileSelect = useCallback(async (fileId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/files/${fileId}`, { headers });

      if (res.ok) {
        const data = await res.json();
        setSelectedFile(data.file);
        setView('detail');
      }
    } catch (err) {
      console.error('[Files Panel] Error loading file:', err);
    }
  }, [getAuthHeaders]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirmId) return;

    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/files/${deleteConfirmId}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        setFiles(prev => prev.filter(f => f.id !== deleteConfirmId));
        if (selectedFile?.id === deleteConfirmId) {
          setSelectedFile(null);
          setView('list');
        }
      }
    } catch (err) {
      console.error('[Files Panel] Error deleting file:', err);
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  }, [deleteConfirmId, getAuthHeaders, selectedFile]);

  const handleBack = useCallback(() => {
    setSelectedFile(null);
    setView('list');
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Navigation header for detail view */}
      {view === 'detail' && (
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

      <div className="flex-1 overflow-y-auto">
        {view === 'list' && (
          <div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 group relative"
                >
                  <button
                    onClick={() => handleFileSelect(file.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getFileIcon(file.type)}
                      </div>
                      <div className="flex-1 min-w-0 pr-8">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {file.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatSize(file.size)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDate(file.uploadedAt)}
                          </span>
                        </div>
                        {file.preview && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                            {file.preview}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(file.id)}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {files.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-sm">No uploaded files</p>
                <p className="text-xs text-gray-400 mt-1">
                  Upload files by clicking the paperclip icon or dragging files onto the chat
                </p>
              </div>
            )}
          </div>
        )}

        {view === 'detail' && selectedFile && (
          <div className="p-4">
            <div className="flex items-start gap-2 mb-4">
              {getFileIcon(selectedFile.type)}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedFile.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedFile.type} | {formatSize(selectedFile.size)} | {formatDate(selectedFile.uploadedAt)}
                </p>
              </div>
            </div>

            {selectedFile.content ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <pre className="p-4 text-sm text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto bg-gray-50 dark:bg-gray-800">
                  {selectedFile.content.substring(0, 10000)}
                  {selectedFile.content.length > 10000 && '\n\n[Content truncated]'}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                Content preview not available.
              </p>
            )}

            <div className="mt-4">
              <button
                onClick={() => setDeleteConfirmId(selectedFile.id)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 transition"
              >
                <Trash2 className="w-4 h-4" />
                Delete File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-5 mx-4 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
              Delete File
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
