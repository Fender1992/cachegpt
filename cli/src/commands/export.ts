import chalk from 'chalk';
import inquirer from 'inquirer';
import { CacheService } from '../lib/cache-service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function exportCommand(format?: string, outputPath?: string): Promise<void> {
  const cacheService = new CacheService();

  if (!format) {
    await showExportMenu(cacheService);
    return;
  }

  const supportedFormats = ['markdown', 'json', 'csv', 'txt'];
  if (!supportedFormats.includes(format.toLowerCase())) {
    console.log(chalk.red(`Unsupported format. Use: ${supportedFormats.join(', ')}`));
    return;
  }

  await exportChats(cacheService, format.toLowerCase(), outputPath);
}

async function showExportMenu(cacheService: CacheService): Promise<void> {
  console.log(chalk.cyan('📄 Export Chat History\n'));

  const stats = await cacheService.getCacheStats();
  console.log(chalk.gray(`Total chats available: ${stats.total_entries}`));
  console.log();

  const { exportType } = await inquirer.prompt({
    type: 'list',
    name: 'exportType',
    message: 'What would you like to export?',
    choices: [
      { name: '📝 All chats (Markdown)', value: 'all-markdown' },
      { name: '📊 All chats (JSON)', value: 'all-json' },
      { name: '📋 All chats (CSV)', value: 'all-csv' },
      { name: '📄 All chats (Plain Text)', value: 'all-txt' },
      { name: '🏷️  Chats by tag', value: 'by-tag' },
      { name: '📅 Chats by date range', value: 'by-date' },
      { name: '⬅️  Back', value: 'back' }
    ]
  });

  if (exportType === 'back') return;

  const [scope, format] = exportType.split('-');

  let filterOptions = {};
  if (scope === 'by') {
    if (format === 'tag') {
      filterOptions = await selectTagFilter(cacheService);
    } else if (format === 'date') {
      filterOptions = await selectDateRange();
    }
  }

  const { outputPath } = await inquirer.prompt({
    type: 'input',
    name: 'outputPath',
    message: 'Output file path (leave empty for desktop):',
    default: ''
  });

  const finalFormat = scope === 'all' ? format : 'markdown';
  await exportChats(cacheService, finalFormat, outputPath, filterOptions);
}

async function selectTagFilter(cacheService: CacheService) {
  const tags = await cacheService.getAllTags();

  if (tags.length === 0) {
    console.log(chalk.yellow('No tags available.'));
    return {};
  }

  const { selectedTag } = await inquirer.prompt({
    type: 'list',
    name: 'selectedTag',
    message: 'Select tag to export:',
    choices: tags.map(tag => ({
      name: `${tag.name} (${tag.chatCount} chats)`,
      value: tag.name
    }))
  });

  return { tag: selectedTag };
}

async function selectDateRange() {
  const { startDate, endDate } = await inquirer.prompt([
    {
      type: 'input',
      name: 'startDate',
      message: 'Start date (YYYY-MM-DD):',
      validate: (input) => {
        const date = new Date(input);
        return !isNaN(date.getTime()) || 'Please enter a valid date (YYYY-MM-DD)';
      }
    },
    {
      type: 'input',
      name: 'endDate',
      message: 'End date (YYYY-MM-DD):',
      validate: (input) => {
        const date = new Date(input);
        return !isNaN(date.getTime()) || 'Please enter a valid date (YYYY-MM-DD)';
      }
    }
  ]);

  return { startDate, endDate };
}

async function exportChats(
  cacheService: CacheService,
  format: string,
  outputPath?: string,
  filters: any = {}
): Promise<void> {
  console.log(chalk.cyan('🔄 Preparing export...\n'));

  // Get chats based on filters
  let chats;
  if (filters.tag) {
    chats = await cacheService.getChatsByTag(filters.tag);
  } else if (filters.startDate && filters.endDate) {
    chats = await cacheService.getChatsByDateRange(filters.startDate, filters.endDate);
  } else {
    chats = await cacheService.getAllChats();
  }

  if (chats.length === 0) {
    console.log(chalk.yellow('No chats found matching the criteria.'));
    return;
  }

  // Generate filename
  const timestamp = new Date().toISOString().split('T')[0];
  const filterSuffix = filters.tag ? `_${filters.tag}` : filters.startDate ? `_${filters.startDate}_to_${filters.endDate}` : '';
  const filename = `cachegpt_export${filterSuffix}_${timestamp}.${format}`;

  // Determine output path
  const finalPath = outputPath || path.join(os.homedir(), 'Desktop', filename);

  // Generate content based on format
  let content: string;
  switch (format) {
    case 'markdown':
      content = generateMarkdown(chats, filters);
      break;
    case 'json':
      content = generateJSON(chats, filters);
      break;
    case 'csv':
      content = generateCSV(chats);
      break;
    case 'txt':
      content = generateText(chats, filters);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  // Write to file
  try {
    fs.writeFileSync(finalPath, content, 'utf-8');
    console.log(chalk.green(`✓ Exported ${chats.length} chats to:`));
    console.log(chalk.white(`  ${finalPath}`));
    console.log();

    // Show file size
    const stats = fs.statSync(finalPath);
    const sizeKB = Math.round(stats.size / 1024);
    console.log(chalk.gray(`File size: ${sizeKB} KB`));

  } catch (error) {
    console.error(chalk.red('❌ Export failed:'), error);
  }
}

function generateMarkdown(chats: any[], filters: any): string {
  const title = filters.tag ? `Chats Tagged: ${filters.tag}` : 'CacheGPT Chat History';
  const date = new Date().toLocaleDateString();

  let markdown = `# ${title}\n\n`;
  markdown += `*Exported on ${date}*\n\n`;
  markdown += `**Total conversations:** ${chats.length}\n\n`;

  if (filters.tag) {
    markdown += `**Filter:** Tag "${filters.tag}"\n\n`;
  }

  markdown += `---\n\n`;

  chats.forEach((chat, index) => {
    const chatDate = new Date(chat.timestamp).toLocaleString();
    markdown += `## Chat ${index + 1}\n\n`;
    markdown += `**Date:** ${chatDate}\n`;
    if (chat.model) markdown += `**Model:** ${chat.model}\n`;
    if (chat.tags && chat.tags.length > 0) {
      markdown += `**Tags:** ${chat.tags.join(', ')}\n`;
    }
    markdown += `\n### Question\n\n${chat.prompt}\n\n`;
    markdown += `### Response\n\n${chat.response}\n\n`;
    markdown += `---\n\n`;
  });

  return markdown;
}

function generateJSON(chats: any[], filters: any): string {
  const exportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      totalChats: chats.length,
      filters: filters,
      version: '7.1.0'
    },
    chats: chats.map(chat => ({
      timestamp: chat.timestamp,
      prompt: chat.prompt,
      response: chat.response,
      model: chat.model,
      provider: chat.provider,
      tags: chat.tags || [],
      tokens_used: chat.tokens_used,
      response_time_ms: chat.response_time_ms,
      cache_hit: chat.cache_hit
    }))
  };

  return JSON.stringify(exportData, null, 2);
}

function generateCSV(chats: any[]): string {
  const headers = ['Timestamp', 'Prompt', 'Response', 'Model', 'Provider', 'Tags', 'Tokens Used', 'Response Time (ms)', 'Cache Hit'];
  let csv = headers.join(',') + '\n';

  chats.forEach(chat => {
    const row = [
      `"${chat.timestamp}"`,
      `"${chat.prompt.replace(/"/g, '""')}"`,
      `"${chat.response.replace(/"/g, '""')}"`,
      `"${chat.model || ''}"`,
      `"${chat.provider || ''}"`,
      `"${(chat.tags || []).join(';')}"`,
      chat.tokens_used || '',
      chat.response_time_ms || '',
      chat.cache_hit || false
    ];
    csv += row.join(',') + '\n';
  });

  return csv;
}

function generateText(chats: any[], filters: any): string {
  const title = filters.tag ? `Chats Tagged: ${filters.tag}` : 'CacheGPT Chat History';
  const date = new Date().toLocaleDateString();

  let text = `${title}\n`;
  text += `${'='.repeat(title.length)}\n\n`;
  text += `Exported on: ${date}\n`;
  text += `Total conversations: ${chats.length}\n\n`;

  chats.forEach((chat, index) => {
    const chatDate = new Date(chat.timestamp).toLocaleString();
    text += `CHAT ${index + 1}\n`;
    text += `-`.repeat(20) + '\n';
    text += `Date: ${chatDate}\n`;
    if (chat.model) text += `Model: ${chat.model}\n`;
    if (chat.tags && chat.tags.length > 0) {
      text += `Tags: ${chat.tags.join(', ')}\n`;
    }
    text += `\nQUESTION:\n${chat.prompt}\n\n`;
    text += `RESPONSE:\n${chat.response}\n\n`;
    text += `${'='.repeat(50)}\n\n`;
  });

  return text;
}