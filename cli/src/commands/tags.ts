import chalk from 'chalk';
import inquirer from 'inquirer';
import { CacheService } from '../lib/cache-service';
import { table } from 'table';

export async function tagsCommand(action?: string, ...args: string[]): Promise<void> {
  const cacheService = new CacheService();

  if (!action) {
    await showTagsMenu(cacheService);
    return;
  }

  switch (action.toLowerCase()) {
    case 'list':
      await listTags(cacheService);
      break;
    case 'add':
      await addTag(cacheService, args[0], args[1]);
      break;
    case 'remove':
      await removeTagFromChat(cacheService, args[0], args[1]);
      break;
    case 'search':
      await searchByTag(cacheService, args[0]);
      break;
    case 'organize':
      await organizeChats(cacheService);
      break;
    default:
      console.log(chalk.red('Unknown action. Use: list, add, remove, search, organize'));
  }
}

async function showTagsMenu(cacheService: CacheService): Promise<void> {
  console.log(chalk.cyan('🏷️  Chat Organization & Tagging\n'));

  const { action } = await inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: '📋 List all tags', value: 'list' },
      { name: '🔍 Search chats by tag', value: 'search' },
      { name: '➕ Add tag to chat', value: 'add' },
      { name: '🗂️  Auto-organize chats', value: 'organize' },
      { name: '📊 Tag statistics', value: 'stats' },
      { name: '⬅️  Back', value: 'back' }
    ]
  });

  switch (action) {
    case 'list':
      await listTags(cacheService);
      break;
    case 'search':
      await interactiveSearchByTag(cacheService);
      break;
    case 'add':
      await interactiveAddTag(cacheService);
      break;
    case 'organize':
      await organizeChats(cacheService);
      break;
    case 'stats':
      await showTagStats(cacheService);
      break;
    case 'back':
      return;
  }
}

async function listTags(cacheService: CacheService): Promise<void> {
  const tags = await cacheService.getAllTags();

  if (tags.length === 0) {
    console.log(chalk.yellow('No tags found. Start organizing your chats with `cachegpt tags add`'));
    return;
  }

  console.log(chalk.cyan('📋 All Tags:\n'));

  const tagData = [['Tag', 'Chat Count', 'Created', 'Last Used']];
  tags.forEach(tag => {
    tagData.push([
      tag.name,
      tag.chatCount.toString(),
      new Date(tag.created).toLocaleDateString(),
      new Date(tag.lastUsed).toLocaleDateString()
    ]);
  });

  console.log(table(tagData));
}

async function searchByTag(cacheService: CacheService, tagName?: string): Promise<void> {
  if (!tagName) {
    console.log(chalk.red('Please provide a tag name: cachegpt tags search <tagname>'));
    return;
  }

  const chats = await cacheService.getChatsByTag(tagName);

  if (chats.length === 0) {
    console.log(chalk.yellow(`No chats found with tag "${tagName}"`));
    return;
  }

  console.log(chalk.cyan(`🔍 Chats tagged with "${tagName}":\n`));

  chats.forEach((chat, index) => {
    console.log(chalk.white(`${index + 1}. ${chat.prompt.substring(0, 80)}...`));
    console.log(chalk.gray(`   ${new Date(chat.timestamp).toLocaleString()}`));
    console.log();
  });
}

async function interactiveSearchByTag(cacheService: CacheService): Promise<void> {
  const tags = await cacheService.getAllTags();

  if (tags.length === 0) {
    console.log(chalk.yellow('No tags available. Create some tags first!'));
    return;
  }

  const { selectedTag } = await inquirer.prompt({
    type: 'list',
    name: 'selectedTag',
    message: 'Select a tag to search:',
    choices: tags.map(tag => ({
      name: `${tag.name} (${tag.chatCount} chats)`,
      value: tag.name
    }))
  });

  await searchByTag(cacheService, selectedTag);
}

async function addTag(cacheService: CacheService, chatId?: string, tagName?: string): Promise<void> {
  if (!chatId || !tagName) {
    console.log(chalk.red('Usage: cachegpt tags add <chat-id> <tag-name>'));
    return;
  }

  try {
    await cacheService.addTagToChat(chatId, tagName);
    console.log(chalk.green(`✓ Added tag "${tagName}" to chat`));
  } catch (error) {
    console.log(chalk.red('Failed to add tag:', error));
  }
}

async function removeTagFromChat(cacheService: CacheService, chatId?: string, tagName?: string): Promise<void> {
  if (!chatId || !tagName) {
    console.log(chalk.red('Usage: cachegpt tags remove <chat-id> <tag-name>'));
    return;
  }

  try {
    // Note: This would need to be implemented in CacheService
    console.log(chalk.yellow(`Remove tag functionality not yet implemented`));
    console.log(chalk.gray(`Would remove tag "${tagName}" from chat ${chatId}`));
  } catch (error) {
    console.log(chalk.red('Failed to remove tag:', error));
  }
}

async function interactiveAddTag(cacheService: CacheService): Promise<void> {
  const recentChats = await cacheService.getRecentChats(10);

  if (recentChats.length === 0) {
    console.log(chalk.yellow('No chats available to tag.'));
    return;
  }

  const { selectedChat } = await inquirer.prompt({
    type: 'list',
    name: 'selectedChat',
    message: 'Select a chat to tag:',
    choices: recentChats.map((chat, index) => ({
      name: `${chat.prompt.substring(0, 60)}... (${new Date(chat.timestamp).toLocaleDateString()})`,
      value: chat.id || index.toString()
    }))
  });

  const { tagName } = await inquirer.prompt({
    type: 'input',
    name: 'tagName',
    message: 'Enter tag name:',
    validate: (input) => input.length > 0 || 'Tag name cannot be empty'
  });

  await addTag(cacheService, selectedChat, tagName);
}

async function organizeChats(cacheService: CacheService): Promise<void> {
  console.log(chalk.cyan('🗂️  Auto-organizing chats...\n'));

  const untaggedChats = await cacheService.getUntaggedChats();

  if (untaggedChats.length === 0) {
    console.log(chalk.green('✓ All chats are already organized!'));
    return;
  }

  console.log(chalk.white(`Found ${untaggedChats.length} untagged chats. Analyzing...`));

  // Simple auto-tagging based on keywords
  const autoTags = new Map<string, string[]>([
    ['code', ['function', 'class', 'variable', 'debug', 'error', 'programming', 'javascript', 'python', 'code']],
    ['question', ['how', 'what', 'why', 'when', 'where', 'explain', '?']],
    ['task', ['create', 'build', 'make', 'generate', 'write', 'develop']],
    ['analysis', ['analyze', 'compare', 'evaluate', 'review', 'assess']],
    ['learning', ['learn', 'understand', 'tutorial', 'guide', 'example']]
  ]);

  let organized = 0;
  for (const chat of untaggedChats.slice(0, 20)) { // Limit to avoid overwhelming
    const prompt = chat.prompt.toLowerCase();

    for (const [tag, keywords] of autoTags) {
      if (keywords.some(keyword => prompt.includes(keyword))) {
        await cacheService.addTagToChat(chat.id || '', tag);
        organized++;
        break;
      }
    }
  }

  console.log(chalk.green(`✓ Auto-organized ${organized} chats`));
  if (untaggedChats.length > 20) {
    console.log(chalk.cyan(`Run again to organize the remaining ${untaggedChats.length - 20} chats`));
  }
}

async function showTagStats(cacheService: CacheService): Promise<void> {
  const tags = await cacheService.getAllTags();
  const totalChats = await cacheService.getTotalChatCount();
  const taggedChats = tags.reduce((sum, tag) => sum + tag.chatCount, 0);

  console.log(chalk.cyan('📊 Tagging Statistics\n'));
  console.log(`Total Chats: ${totalChats}`);
  console.log(`Tagged Chats: ${taggedChats}`);
  console.log(`Untagged Chats: ${totalChats - taggedChats}`);
  console.log(`Organization Rate: ${Math.round((taggedChats / totalChats) * 100)}%`);
  console.log();

  if (tags.length > 0) {
    console.log(chalk.yellow('Top Tags:'));
    tags
      .sort((a, b) => b.chatCount - a.chatCount)
      .slice(0, 5)
      .forEach((tag, index) => {
        console.log(`  ${index + 1}. ${tag.name} (${tag.chatCount} chats)`);
      });
  }
}