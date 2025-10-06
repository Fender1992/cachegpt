import * as fs from 'fs';
import * as path from 'path';

export interface FileContext {
  type: 'file' | 'directory';
  path: string;
  content?: string;
  files?: string[];
  error?: string;
}

/**
 * Detect file paths in user message
 * Supports: ./file.txt, /abs/path.txt, ~/file.txt, file.txt, package.json, etc.
 */
export function detectFilePaths(message: string): string[] {
  const matches = new Set<string>();

  // More permissive patterns to catch various file references
  const patterns = [
    // Absolute paths: /path/to/file.txt
    /(?:^|\s)(\/[^\s]+)/g,
    // Relative paths with ./: ./src/file.js
    /(?:^|\s)(\.\.[^\s]*)/g,
    /(?:^|\s)(\.[^\s]+)/g,
    // Home directory: ~/Documents/file.txt
    /(?:^|\s)(~\/[^\s]+)/g,
    // Common filenames: package.json, README.md, etc.
    /(?:^|\s)([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+)/g,
  ];

  for (const pattern of patterns) {
    const found = message.match(pattern);
    if (found) {
      found.forEach(match => {
        const cleaned = match.trim();
        // Filter out false positives (like URLs with dots)
        if (!cleaned.includes('http://') && !cleaned.includes('https://')) {
          matches.add(cleaned);
        }
      });
    }
  }

  return Array.from(matches);
}

/**
 * Read file or directory and return context
 */
export async function readFileContext(filePath: string): Promise<FileContext> {
  try {
    // Resolve home directory
    let resolvedPath = filePath;
    if (filePath.startsWith('~')) {
      resolvedPath = path.join(process.env.HOME || process.env.USERPROFILE || '', filePath.slice(1));
    }

    // Get absolute path
    resolvedPath = path.resolve(resolvedPath);

    // Check if exists
    if (!fs.existsSync(resolvedPath)) {
      return {
        type: 'file',
        path: filePath,
        error: 'File not found'
      };
    }

    const stats = fs.statSync(resolvedPath);

    if (stats.isDirectory()) {
      // Read directory
      const files = fs.readdirSync(resolvedPath);
      return {
        type: 'directory',
        path: resolvedPath,
        files: files.slice(0, 100) // Limit to first 100 files
      };
    } else {
      // Read file
      const content = fs.readFileSync(resolvedPath, 'utf-8');

      // Limit file size to 50KB
      if (content.length > 50000) {
        return {
          type: 'file',
          path: resolvedPath,
          content: content.slice(0, 50000) + '\n\n[... truncated, file too large]'
        };
      }

      return {
        type: 'file',
        path: resolvedPath,
        content
      };
    }
  } catch (error: any) {
    return {
      type: 'file',
      path: filePath,
      error: error.message
    };
  }
}

/**
 * Format file context for LLM
 */
export function formatFileContext(contexts: FileContext[]): string {
  if (contexts.length === 0) return '';

  let formatted = '\n\n=== FILE CONTEXT ===\n';
  formatted += `Working directory: ${process.cwd()}\n\n`;

  for (const ctx of contexts) {
    if (ctx.error) {
      formatted += `❌ ${ctx.path}: ${ctx.error}\n\n`;
      continue;
    }

    if (ctx.type === 'directory') {
      formatted += `📁 Directory: ${ctx.path}\n`;
      formatted += `Files (${ctx.files?.length || 0}):\n`;
      ctx.files?.forEach(file => {
        formatted += `  - ${file}\n`;
      });
      formatted += '\n';
    } else {
      formatted += `📄 File: ${ctx.path}\n`;
      formatted += '```\n';
      formatted += ctx.content || '';
      formatted += '\n```\n\n';
    }
  }

  formatted += '=== END FILE CONTEXT ===\n';

  return formatted;
}

/**
 * Check if message is asking about current directory
 */
export function isAskingAboutCurrentDir(message: string): boolean {
  const patterns = [
    /current\s+(directory|dir|folder|location)/i,
    /what\s+(directory|dir|folder)/i,
    /where\s+am\s+i/i,
    /list\s+(files|directories|this\s+directory|current\s+directory)/i,
    /scan\s+(this\s+directory|current\s+directory|here|\.|current\s+dir)/i,
    /show\s+(files|this\s+directory|current\s+directory)/i,
    /what'?s\s+in\s+(this\s+directory|here|current\s+directory)/i,
  ];

  return patterns.some(pattern => pattern.test(message));
}

/**
 * Process user message and add file context
 */
export async function enrichMessageWithFiles(message: string): Promise<{
  originalMessage: string;
  enrichedMessage: string;
  fileContexts: FileContext[];
}> {
  let filePaths = detectFilePaths(message);

  // If asking about current directory, add '.' to scan it
  if (isAskingAboutCurrentDir(message) && !filePaths.includes('.')) {
    filePaths.push('.');
  }

  if (filePaths.length === 0) {
    return {
      originalMessage: message,
      enrichedMessage: message,
      fileContexts: []
    };
  }

  // Read all detected files
  const contexts = await Promise.all(
    filePaths.map(fp => readFileContext(fp))
  );

  // Filter out errors and format
  const validContexts = contexts.filter(ctx => !ctx.error || ctx.error !== 'File not found');

  if (validContexts.length === 0) {
    return {
      originalMessage: message,
      enrichedMessage: message,
      fileContexts: []
    };
  }

  const fileContext = formatFileContext(validContexts);
  const enrichedMessage = message + fileContext;

  return {
    originalMessage: message,
    enrichedMessage,
    fileContexts: validContexts
  };
}
