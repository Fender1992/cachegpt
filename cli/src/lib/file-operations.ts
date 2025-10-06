import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface FileOperation {
  type: 'read' | 'write' | 'edit' | 'delete' | 'create';
  path: string;
  content?: string;
  oldContent?: string;
  newContent?: string;
  success?: boolean;
  error?: string;
}

/**
 * Write content to a file (creates or overwrites)
 */
export async function writeFile(filePath: string, content: string): Promise<FileOperation> {
  try {
    const resolvedPath = resolvePath(filePath);

    // Create directory if it doesn't exist
    const dirPath = path.dirname(resolvedPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Check if file exists
    const exists = fs.existsSync(resolvedPath);

    // Write file
    fs.writeFileSync(resolvedPath, content, 'utf-8');

    return {
      type: exists ? 'write' : 'create',
      path: resolvedPath,
      content,
      success: true
    };
  } catch (error: any) {
    return {
      type: 'write',
      path: filePath,
      content,
      success: false,
      error: error.message
    };
  }
}

/**
 * Edit file content (find and replace, or append)
 */
export async function editFile(
  filePath: string,
  operation: 'replace' | 'append' | 'prepend',
  searchText?: string,
  replaceText?: string,
  appendText?: string
): Promise<FileOperation> {
  try {
    const resolvedPath = resolvePath(filePath);

    if (!fs.existsSync(resolvedPath)) {
      return {
        type: 'edit',
        path: resolvedPath,
        success: false,
        error: 'File not found'
      };
    }

    const currentContent = fs.readFileSync(resolvedPath, 'utf-8');
    let newContent = currentContent;

    if (operation === 'replace' && searchText !== undefined && replaceText !== undefined) {
      if (!currentContent.includes(searchText)) {
        return {
          type: 'edit',
          path: resolvedPath,
          oldContent: currentContent,
          success: false,
          error: 'Search text not found in file'
        };
      }
      newContent = currentContent.replace(searchText, replaceText);
    } else if (operation === 'append' && appendText) {
      newContent = currentContent + appendText;
    } else if (operation === 'prepend' && appendText) {
      newContent = appendText + currentContent;
    }

    fs.writeFileSync(resolvedPath, newContent, 'utf-8');

    return {
      type: 'edit',
      path: resolvedPath,
      oldContent: currentContent,
      newContent,
      success: true
    };
  } catch (error: any) {
    return {
      type: 'edit',
      path: filePath,
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<FileOperation> {
  try {
    const resolvedPath = resolvePath(filePath);

    if (!fs.existsSync(resolvedPath)) {
      return {
        type: 'delete',
        path: resolvedPath,
        success: false,
        error: 'File not found'
      };
    }

    const stats = fs.statSync(resolvedPath);

    if (stats.isDirectory()) {
      return {
        type: 'delete',
        path: resolvedPath,
        success: false,
        error: 'Path is a directory. Use rmdir to delete directories.'
      };
    }

    fs.unlinkSync(resolvedPath);

    return {
      type: 'delete',
      path: resolvedPath,
      success: true
    };
  } catch (error: any) {
    return {
      type: 'delete',
      path: filePath,
      success: false,
      error: error.message
    };
  }
}

/**
 * Resolve file path (handle ~, relative, absolute)
 */
function resolvePath(filePath: string): string {
  let resolvedPath = filePath;

  // Resolve home directory
  if (filePath.startsWith('~')) {
    resolvedPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      filePath.slice(1)
    );
  }

  // Get absolute path
  return path.resolve(resolvedPath);
}

/**
 * Parse AI response for file operation commands
 * Looks for special syntax like:
 * - WRITE_FILE: path/to/file.txt
 * - EDIT_FILE: path/to/file.txt
 * - DELETE_FILE: path/to/file.txt
 */
export function parseFileOperations(aiResponse: string): {
  cleanResponse: string;
  operations: Array<{
    type: 'write' | 'edit' | 'delete';
    path: string;
    content?: string;
    searchText?: string;
    replaceText?: string;
  }>;
} {
  const operations: Array<{
    type: 'write' | 'edit' | 'delete';
    path: string;
    content?: string;
    searchText?: string;
    replaceText?: string;
  }> = [];

  let cleanResponse = aiResponse;

  // Pattern: WRITE_FILE: path/to/file.txt\n```language\ncontent\n```
  const writePattern = /WRITE_FILE:\s*([^\n]+)\n```[\w]*\n([\s\S]*?)```/g;
  let match;

  while ((match = writePattern.exec(aiResponse)) !== null) {
    operations.push({
      type: 'write',
      path: match[1].trim(),
      content: match[2]
    });
    cleanResponse = cleanResponse.replace(match[0], '');
  }

  // Pattern: EDIT_FILE: path/to/file.txt REPLACE "old" WITH "new"
  // Simple greedy pattern that works with or without quotes
  const editPattern = /EDIT_FILE:\s*(.+?)\s+REPLACE\s+(.+?)\s+WITH\s+(.+)/gi;

  while ((match = editPattern.exec(aiResponse)) !== null) {
    operations.push({
      type: 'edit',
      path: match[1].trim(),
      searchText: match[2].trim(),
      replaceText: match[3].trim()
    });
    cleanResponse = cleanResponse.replace(match[0], '');
  }

  // Pattern: DELETE_FILE: path/to/file.txt
  const deletePattern = /DELETE_FILE:\s*([^\n]+?)(?:\n|$)/gi;

  while ((match = deletePattern.exec(aiResponse)) !== null) {
    operations.push({
      type: 'delete',
      path: match[1].trim()
    });
    cleanResponse = cleanResponse.replace(match[0], '');
  }

  return {
    cleanResponse: cleanResponse.trim(),
    operations
  };
}

/**
 * Format file operation result for display
 */
export function formatOperationResult(op: FileOperation): string {
  if (op.success) {
    switch (op.type) {
      case 'create':
        return chalk.green(`✓ Created: ${op.path}`);
      case 'write':
        return chalk.green(`✓ Updated: ${op.path}`);
      case 'edit':
        const changedLines = op.newContent && op.oldContent
          ? countChangedLines(op.oldContent, op.newContent)
          : 0;
        return chalk.green(`✓ Edited: ${op.path} (${changedLines} lines changed)`);
      case 'delete':
        return chalk.green(`✓ Deleted: ${op.path}`);
      default:
        return chalk.green(`✓ Operation completed: ${op.path}`);
    }
  } else {
    return chalk.red(`✗ Failed: ${op.path} - ${op.error}`);
  }
}

/**
 * Count changed lines between two texts
 */
function countChangedLines(oldText: string, newText: string): number {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  let changes = 0;
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    if (oldLines[i] !== newLines[i]) {
      changes++;
    }
  }

  return changes;
}

/**
 * Show diff preview (simple version)
 */
export function showDiff(oldContent: string, newContent: string, maxLines: number = 10): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  let diff = chalk.dim('  Changes:\n');
  let shownLines = 0;

  const maxLineCount = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLineCount && shownLines < maxLines; i++) {
    if (oldLines[i] !== newLines[i]) {
      if (oldLines[i] !== undefined) {
        diff += chalk.red(`  - ${oldLines[i]}\n`);
        shownLines++;
      }
      if (newLines[i] !== undefined) {
        diff += chalk.green(`  + ${newLines[i]}\n`);
        shownLines++;
      }
    }
  }

  const totalChanges = countChangedLines(oldContent, newContent);
  if (totalChanges > maxLines) {
    diff += chalk.dim(`  ... and ${totalChanges - shownLines} more changes\n`);
  }

  return diff;
}
