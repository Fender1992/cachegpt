'use client'

import { useState, useRef } from 'react'
import { Paperclip, X, File, Image as ImageIcon, Code, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase-client'

export interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
  preview: string
  content: string
  uploadedAt: string
}

interface FileUploadProps {
  onFilesChange: (files: UploadedFile[]) => void
  maxFiles?: number
  disabled?: boolean
}

export default function FileUpload({
  onFilesChange,
  maxFiles = 5,
  disabled = false
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    // Reset file input to allow re-selecting the same files
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // Check file limit
    if (uploadedFiles.length + files.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed per conversation`)
      setTimeout(() => setError(null), 3000)
      return
    }

    setIsUploading(true)
    setError(null)

    const newFiles: UploadedFile[] = []
    const errors: string[] = []

    // Get session token for authentication
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      try {
        // Upload file
        const formData = new FormData()
        formData.append('file', file)

        const headers: HeadersInit = token
          ? { 'Authorization': `Bearer ${token}` }
          : {}

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          headers,
          credentials: 'include' // Ensure cookies are sent
        })

        if (!response.ok) {
          // Read response as text first (stream can only be consumed once)
          const text = await response.text()
          let errorMessage = `${file.name}: Upload failed (${response.status})`
          try {
            // Try to parse as JSON
            const errorData = JSON.parse(text)
            errorMessage = `${file.name}: ${errorData.error || 'Upload failed'}`
          } catch {
            // Not JSON (e.g., HTML error page), use text directly
            errorMessage = `${file.name}: ${text.substring(0, 50) || 'Upload failed'}`
          }
          errors.push(errorMessage)
          continue // Continue with next file instead of stopping
        }

        const data = await response.json()
        newFiles.push({
          id: data.file.id,
          name: data.file.name,
          type: data.file.type,
          size: data.file.size,
          preview: data.file.preview,
          content: data.content,
          uploadedAt: data.file.uploadedAt
        })
      } catch (error) {
        console.error('[FILE-UPLOAD] Error uploading file:', file.name, error)
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed'}`)
        continue // Continue with next file
      }
    }

    // Update state with successfully uploaded files
    if (newFiles.length > 0) {
      const updatedFiles = [...uploadedFiles, ...newFiles]
      setUploadedFiles(updatedFiles)
      onFilesChange(updatedFiles)
    }

    // Show error if any files failed
    if (errors.length > 0) {
      const successCount = newFiles.length
      const totalCount = files.length
      if (successCount > 0) {
        setError(`Uploaded ${successCount}/${totalCount} files. Failed: ${errors.join('; ')}`)
      } else {
        setError(errors.join('; '))
      }
      setTimeout(() => setError(null), 5000)
    }

    setIsUploading(false)
  }

  const removeFile = (fileId: string) => {
    const updatedFiles = uploadedFiles.filter(f => f.id !== fileId)
    setUploadedFiles(updatedFiles)
    onFilesChange(updatedFiles)
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4" />
    if (type.includes('javascript') || type.includes('typescript') || type.includes('python'))
      return <Code className="w-4 h-4" />
    if (type === 'application/pdf') return <FileText className="w-4 h-4" />
    return <File className="w-4 h-4" />
  }

  return (
    <div className="relative">
      {/* Upload Button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isUploading || uploadedFiles.length >= maxFiles}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={`Upload files (${uploadedFiles.length}/${maxFiles})`}
        aria-label="Upload files"
      >
        <Paperclip className={`w-5 h-5 ${isUploading ? 'animate-pulse' : ''}`} />
      </button>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.gif,.webp,.js,.ts,.py"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-80 max-w-[90vw] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 space-y-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Attached Files ({uploadedFiles.length}/{maxFiles})
            </span>
          </div>

          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
            >
              <div className="flex-shrink-0 text-gray-600 dark:text-gray-400">
                {getFileIcon(file.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {file.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {(file.size / 1024).toFixed(2)}KB
                </div>
              </div>
              <button
                onClick={() => removeFile(file.id)}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                aria-label="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute bottom-full left-0 mb-2 w-80 max-w-[90vw] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
    </div>
  )
}
