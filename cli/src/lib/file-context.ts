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
 * Supports: ./file.txt, /abs/path.txt, ~/file.txt, file.txt
 */
export function detectFilePaths(message: string): string[] {
  const patterns = [
    // Absolute paths
    /(?:^|\s)(\/[\w\-\.\/]+)/g,
    // Relative paths with ./
    /(?:^|\s)(\.\/[\w\-\.\/]+)/g,
    // Home directory paths
    /(?:^|\s)(~\/[\w\-\.\/]+)/g,
    // Just filename with extension
    /(?:^|\s)([\w\-]+\.[\w]+)/g,
  ];

  const matches = new Set<string>();

  for (const pattern of patterns) {
    const found = message.match(pattern);
    if (found) {
      found.forEach(match => matches.add(match.trim()));
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
 * Process user message and add file context
 */
export async function enrichMessageWithFiles(message: string): Promise<{
  originalMessage: string;
  enrichedMessage: string;
  fileContexts: FileContext[];
}> {
  const filePaths = detectFilePaths(message);

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
