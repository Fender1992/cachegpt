import chalk from 'chalk';
import inquirer from 'inquirer';
import { CacheService } from '../lib/cache-service';
import { table } from 'table';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string;
  variables: string[];
  tags: string[];
  usage_count?: number;
  created?: string;
}

export async function templatesCommand(action?: string, ...args: string[]): Promise<void> {
  const cacheService = new CacheService();

  if (!action) {
    await showTemplatesMenu(cacheService);
    return;
  }

  switch (action.toLowerCase()) {
    case 'list':
      await listTemplates(args[0]);
      break;
    case 'use':
      await useTemplate(cacheService, args[0]);
      break;
    case 'create':
      await createTemplate();
      break;
    case 'edit':
      await editTemplate(args[0]);
      break;
    case 'delete':
      await deleteTemplate(args[0]);
      break;
    case 'import':
      await importTemplates();
      break;
    case 'export':
      await exportTemplates();
      break;
    default:
      console.log(chalk.red('Unknown action. Use: list, use, create, edit, delete, import, export'));
  }
}

async function showTemplatesMenu(cacheService: CacheService): Promise<void> {
  console.log(chalk.cyan('📝 Prompt Templates\n'));

  const templates = await loadTemplates();
  console.log(chalk.gray(`Available templates: ${templates.length}`));
  console.log();

  const { action } = await inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: '📋 Browse templates', value: 'browse' },
      { name: '🚀 Use a template', value: 'use' },
      { name: '➕ Create new template', value: 'create' },
      { name: '✏️  Edit template', value: 'edit' },
      { name: '📊 Template statistics', value: 'stats' },
      { name: '📥 Import templates', value: 'import' },
      { name: '📤 Export templates', value: 'export' },
      { name: '⬅️  Back', value: 'back' }
    ]
  });

  switch (action) {
    case 'browse':
      await browseTemplates();
      break;
    case 'use':
      await interactiveUseTemplate(cacheService);
      break;
    case 'create':
      await createTemplate();
      break;
    case 'edit':
      await interactiveEditTemplate();
      break;
    case 'stats':
      await showTemplateStats();
      break;
    case 'import':
      await importTemplates();
      break;
    case 'export':
      await exportTemplates();
      break;
    case 'back':
      return;
  }
}

async function listTemplates(category?: string): Promise<void> {
  const templates = await loadTemplates();

  const filteredTemplates = category && typeof category === 'string'
    ? templates.filter(t => t.category && t.category.toLowerCase() === category.toLowerCase())
    : templates;

  if (filteredTemplates.length === 0) {
    console.log(chalk.yellow(category ? `No templates found in category "${category}"` : 'No templates available'));
    return;
  }

  console.log(chalk.cyan(`📝 ${category ? `${category} ` : ''}Templates\n`));

  const templateData = [['ID', 'Name', 'Category', 'Variables', 'Usage']];
  filteredTemplates.forEach(template => {
    templateData.push([
      template.id,
      template.name,
      template.category,
      template.variables.join(', ') || 'None',
      (template.usage_count || 0).toString()
    ]);
  });

  console.log(table(templateData));
}

async function browseTemplates(): Promise<void> {
  const templates = await loadTemplates();

  if (templates.length === 0) {
    console.log(chalk.yellow('No templates available. Create your first template!'));
    return;
  }

  // Group by category
  const categories = [...new Set(templates.map(t => t.category))];

  const { selectedCategory } = await inquirer.prompt({
    type: 'list',
    name: 'selectedCategory',
    message: 'Select a category to browse:',
    choices: [
      { name: 'All Templates', value: 'all' },
      ...categories.map(cat => ({ name: cat, value: cat }))
    ]
  });

  const categoryTemplates = selectedCategory === 'all'
    ? templates
    : templates.filter(t => t.category === selectedCategory);

  const { selectedTemplate } = await inquirer.prompt({
    type: 'list',
    name: 'selectedTemplate',
    message: 'Select a template to view:',
    choices: categoryTemplates.map(template => ({
      name: `${template.name} - ${template.description}`,
      value: template.id
    }))
  });

  const template = templates.find(t => t.id === selectedTemplate);
  if (template) {
    showTemplateDetails(template);
  }
}

function showTemplateDetails(template: PromptTemplate): void {
  console.log(chalk.cyan(`\n📝 ${template.name}\n`));
  console.log(chalk.yellow('Description:'));
  console.log(`   ${template.description}\n`);

  console.log(chalk.yellow('Category:'), template.category);
  console.log(chalk.yellow('Variables:'), template.variables.join(', ') || 'None');
  console.log(chalk.yellow('Tags:'), template.tags.join(', ') || 'None');
  console.log(chalk.yellow('Usage Count:'), template.usage_count || 0);
  console.log();

  console.log(chalk.yellow('Template:'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(template.template);
  console.log(chalk.gray('─'.repeat(50)));
  console.log();
}

async function useTemplate(cacheService: CacheService, templateId?: string): Promise<void> {
  const templates = await loadTemplates();

  let template: PromptTemplate | undefined;

  if (templateId) {
    template = templates.find(t => t.id === templateId);
    if (!template) {
      console.log(chalk.red(`Template "${templateId}" not found`));
      return;
    }
  } else {
    // Interactive selection handled in menu
    return;
  }

  await executeTemplate(cacheService, template);
}

async function interactiveUseTemplate(cacheService: CacheService): Promise<void> {
  const templates = await loadTemplates();

  if (templates.length === 0) {
    console.log(chalk.yellow('No templates available. Create your first template!'));
    return;
  }

  const { selectedTemplate } = await inquirer.prompt({
    type: 'list',
    name: 'selectedTemplate',
    message: 'Select a template to use:',
    choices: templates.map(template => ({
      name: `${template.name} (${template.category}) - ${template.description}`,
      value: template.id
    }))
  });

  const template = templates.find(t => t.id === selectedTemplate);
  if (template) {
    await executeTemplate(cacheService, template);
  }
}

async function executeTemplate(cacheService: CacheService, template: PromptTemplate): Promise<void> {
  console.log(chalk.cyan(`\n🚀 Using template: ${template.name}\n`));

  let prompt = template.template;

  // Collect variable values
  if (template.variables.length > 0) {
    console.log(chalk.yellow('Please provide values for the following variables:\n'));

    for (const variable of template.variables) {
      const { value } = await inquirer.prompt({
        type: 'input',
        name: 'value',
        message: `${variable}:`,
        validate: (input) => input.length > 0 || 'This field is required'
      });

      prompt = prompt.replace(new RegExp(`\\{\\{${variable}\\}\\}`, 'g'), value);
    }
  }

  console.log(chalk.cyan('\n📝 Generated Prompt:\n'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(prompt);
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  const { executeNow } = await inquirer.prompt({
    type: 'confirm',
    name: 'executeNow',
    message: 'Execute this prompt now?',
    default: true
  });

  if (executeNow) {
    // Update usage count
    await incrementTemplateUsage(template.id);

    // This would integrate with the chat command
    console.log(chalk.green('✓ Prompt ready for execution'));
    console.log(chalk.gray('Run: cachegpt chat'));
    console.log(chalk.gray('Then paste the generated prompt above'));
  } else {
    console.log(chalk.gray('Prompt ready. Copy the text above when needed.'));
  }
}

async function createTemplate(): Promise<void> {
  console.log(chalk.cyan('➕ Create New Template\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Template name:',
      validate: (input) => input.length > 0 || 'Name is required'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description:',
      validate: (input) => input.length > 0 || 'Description is required'
    },
    {
      type: 'list',
      name: 'category',
      message: 'Category:',
      choices: [
        'Code Generation',
        'Content Writing',
        'Analysis',
        'Planning',
        'Learning',
        'Debugging',
        'Documentation',
        'Custom'
      ]
    },
    {
      type: 'editor',
      name: 'template',
      message: 'Template content (use {{variable}} for placeholders):',
      validate: (input) => input.length > 0 || 'Template content is required'
    },
    {
      type: 'input',
      name: 'variables',
      message: 'Variable names (comma-separated, leave empty if none):',
      default: ''
    },
    {
      type: 'input',
      name: 'tags',
      message: 'Tags (comma-separated, leave empty if none):',
      default: ''
    }
  ]);

  const template: PromptTemplate = {
    id: generateTemplateId(),
    name: answers.name,
    description: answers.description,
    category: answers.category,
    template: answers.template,
    variables: answers.variables ? answers.variables.split(',').map((v: string) => v.trim()).filter(Boolean) : [],
    tags: answers.tags ? answers.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    usage_count: 0,
    created: new Date().toISOString()
  };

  await saveTemplate(template);
  console.log(chalk.green(`✓ Template "${template.name}" created successfully!`));
}

async function interactiveEditTemplate(): Promise<void> {
  const templates = await loadTemplates();

  if (templates.length === 0) {
    console.log(chalk.yellow('No templates available to edit.'));
    return;
  }

  const { selectedTemplate } = await inquirer.prompt({
    type: 'list',
    name: 'selectedTemplate',
    message: 'Select a template to edit:',
    choices: templates.map(template => ({
      name: `${template.name} (${template.category})`,
      value: template.id
    }))
  });

  await editTemplate(selectedTemplate);
}

async function editTemplate(templateId?: string): Promise<void> {
  if (!templateId) {
    console.log(chalk.red('Please provide a template ID'));
    return;
  }

  const templates = await loadTemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    console.log(chalk.red(`Template "${templateId}" not found`));
    return;
  }

  console.log(chalk.cyan(`✏️  Editing template: ${template.name}\n`));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Template name:',
      default: template.name
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description:',
      default: template.description
    },
    {
      type: 'list',
      name: 'category',
      message: 'Category:',
      choices: [
        'Code Generation',
        'Content Writing',
        'Analysis',
        'Planning',
        'Learning',
        'Debugging',
        'Documentation',
        'Custom'
      ],
      default: template.category
    },
    {
      type: 'editor',
      name: 'template',
      message: 'Template content:',
      default: template.template
    }
  ]);

  const updatedTemplate = {
    ...template,
    ...answers,
    variables: extractVariables(answers.template)
  };

  await saveTemplate(updatedTemplate);
  console.log(chalk.green(`✓ Template "${updatedTemplate.name}" updated successfully!`));
}

async function deleteTemplate(templateId?: string): Promise<void> {
  if (!templateId) {
    console.log(chalk.red('Please provide a template ID'));
    return;
  }

  const templates = await loadTemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    console.log(chalk.red(`Template "${templateId}" not found`));
    return;
  }

  const { confirm } = await inquirer.prompt({
    type: 'confirm',
    name: 'confirm',
    message: `Delete template "${template.name}"?`,
    default: false
  });

  if (confirm) {
    const updatedTemplates = templates.filter(t => t.id !== templateId);
    await saveTemplates(updatedTemplates);
    console.log(chalk.green(`✓ Template "${template.name}" deleted`));
  }
}

async function showTemplateStats(): Promise<void> {
  const templates = await loadTemplates();

  if (templates.length === 0) {
    console.log(chalk.yellow('No templates available.'));
    return;
  }

  console.log(chalk.cyan('📊 Template Statistics\n'));

  // Overall stats
  const totalUsage = templates.reduce((sum, t) => sum + (t.usage_count || 0), 0);
  const categories = [...new Set(templates.map(t => t.category))];

  console.log(`Total Templates: ${templates.length}`);
  console.log(`Categories: ${categories.length}`);
  console.log(`Total Usage: ${totalUsage}`);
  console.log();

  // Top templates
  const topTemplates = templates
    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
    .slice(0, 5);

  if (topTemplates.length > 0) {
    console.log(chalk.yellow('🔥 Most Used Templates'));
    const topData = [['Rank', 'Name', 'Category', 'Usage']];
    topTemplates.forEach((template, index) => {
      topData.push([
        (index + 1).toString(),
        template.name,
        template.category,
        (template.usage_count || 0).toString()
      ]);
    });
    console.log(table(topData));
  }

  // Category breakdown
  console.log(chalk.yellow('📂 By Category'));
  const categoryStats = categories.map(cat => {
    const categoryTemplates = templates.filter(t => t.category === cat);
    const categoryUsage = categoryTemplates.reduce((sum, t) => sum + (t.usage_count || 0), 0);
    return { category: cat, count: categoryTemplates.length, usage: categoryUsage };
  });

  const categoryData = [['Category', 'Templates', 'Total Usage']];
  categoryStats.forEach(stat => {
    categoryData.push([stat.category, stat.count.toString(), stat.usage.toString()]);
  });
  console.log(table(categoryData));
}

async function importTemplates(): Promise<void> {
  console.log(chalk.cyan('📥 Import Templates\n'));

  const { source } = await inquirer.prompt({
    type: 'list',
    name: 'source',
    message: 'Import from:',
    choices: [
      { name: 'File (JSON)', value: 'file' },
      { name: 'Built-in templates', value: 'builtin' },
      { name: 'URL', value: 'url' }
    ]
  });

  switch (source) {
    case 'file':
      await importFromFile();
      break;
    case 'builtin':
      await importBuiltinTemplates();
      break;
    case 'url':
      await importFromUrl();
      break;
  }
}

async function exportTemplates(): Promise<void> {
  const templates = await loadTemplates();

  if (templates.length === 0) {
    console.log(chalk.yellow('No templates to export.'));
    return;
  }

  const { outputPath } = await inquirer.prompt({
    type: 'input',
    name: 'outputPath',
    message: 'Output file path (leave empty for desktop):',
    default: ''
  });

  const finalPath = outputPath || path.join(os.homedir(), 'Desktop', 'cachegpt-templates.json');

  try {
    fs.writeFileSync(finalPath, JSON.stringify(templates, null, 2), 'utf-8');
    console.log(chalk.green(`✓ Exported ${templates.length} templates to:`));
    console.log(chalk.white(`  ${finalPath}`));
  } catch (error) {
    console.error(chalk.red('❌ Export failed:'), error);
  }
}

// Helper functions
function generateTemplateId(): string {
  return `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];

  return [...new Set(matches.map(match => match.slice(2, -2)))];
}

async function loadTemplates(): Promise<PromptTemplate[]> {
  const templatesPath = path.join(os.homedir(), '.cachegpt', 'templates.json');

  if (!fs.existsSync(templatesPath)) {
    // Create default templates
    const defaultTemplates = createDefaultTemplates();
    await saveTemplates(defaultTemplates);
    return defaultTemplates;
  }

  try {
    const content = fs.readFileSync(templatesPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(chalk.yellow('Warning: Could not load templates, using defaults'));
    return createDefaultTemplates();
  }
}

async function saveTemplates(templates: PromptTemplate[]): Promise<void> {
  const configDir = path.join(os.homedir(), '.cachegpt');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const templatesPath = path.join(configDir, 'templates.json');
  fs.writeFileSync(templatesPath, JSON.stringify(templates, null, 2), 'utf-8');
}

async function saveTemplate(template: PromptTemplate): Promise<void> {
  const templates = await loadTemplates();
  const existingIndex = templates.findIndex(t => t.id === template.id);

  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    templates.push(template);
  }

  await saveTemplates(templates);
}

async function incrementTemplateUsage(templateId: string): Promise<void> {
  const templates = await loadTemplates();
  const template = templates.find(t => t.id === templateId);

  if (template) {
    template.usage_count = (template.usage_count || 0) + 1;
    await saveTemplates(templates);
  }
}

function createDefaultTemplates(): PromptTemplate[] {
  return [
    {
      id: 'code_review',
      name: 'Code Review',
      description: 'Review code for best practices, bugs, and improvements',
      category: 'Code Generation',
      template: 'Please review this {{language}} code and provide feedback on:\n\n1. Code quality and best practices\n2. Potential bugs or issues\n3. Performance improvements\n4. Security considerations\n\nCode:\n```{{language}}\n{{code}}\n```',
      variables: ['language', 'code'],
      tags: ['code', 'review', 'quality'],
      usage_count: 0
    },
    {
      id: 'bug_debugging',
      name: 'Bug Debugging Assistant',
      description: 'Help debug and fix code issues',
      category: 'Debugging',
      template: 'I\'m having trouble with this {{language}} code. The issue is: {{problem_description}}\n\nCode:\n```{{language}}\n{{code}}\n```\n\nError message (if any):\n```\n{{error_message}}\n```\n\nPlease help me identify and fix the issue.',
      variables: ['language', 'problem_description', 'code', 'error_message'],
      tags: ['debug', 'fix', 'error'],
      usage_count: 0
    },
    {
      id: 'documentation',
      name: 'Documentation Generator',
      description: 'Generate comprehensive documentation for code',
      category: 'Documentation',
      template: 'Generate comprehensive documentation for this {{language}} code:\n\n```{{language}}\n{{code}}\n```\n\nPlease include:\n- Function/class description\n- Parameters and return values\n- Usage examples\n- Any important notes or considerations',
      variables: ['language', 'code'],
      tags: ['documentation', 'comments', 'explain'],
      usage_count: 0
    },
    {
      id: 'content_outline',
      name: 'Content Outline Creator',
      description: 'Create structured outlines for articles or presentations',
      category: 'Content Writing',
      template: 'Create a detailed outline for {{content_type}} about "{{topic}}".\n\nTarget audience: {{audience}}\nEstimated length: {{length}}\nTone: {{tone}}\n\nPlease provide:\n1. Main sections with subsections\n2. Key points to cover in each section\n3. Suggested introduction and conclusion approaches',
      variables: ['content_type', 'topic', 'audience', 'length', 'tone'],
      tags: ['writing', 'outline', 'structure'],
      usage_count: 0
    },
    {
      id: 'learning_plan',
      name: 'Learning Plan Creator',
      description: 'Create personalized learning plans for new topics',
      category: 'Learning',
      template: 'Create a comprehensive learning plan for mastering {{subject}}.\n\nCurrent level: {{current_level}}\nTime commitment: {{time_per_week}} hours per week\nLearning style preference: {{learning_style}}\nSpecific goals: {{goals}}\n\nPlease provide:\n1. Learning path with phases\n2. Recommended resources for each phase\n3. Practical projects or exercises\n4. Milestones and assessment criteria',
      variables: ['subject', 'current_level', 'time_per_week', 'learning_style', 'goals'],
      tags: ['learning', 'education', 'plan'],
      usage_count: 0
    }
  ];
}

async function importBuiltinTemplates(): Promise<void> {
  const templates = await loadTemplates();
  const builtinTemplates = createDefaultTemplates();

  // Add built-in templates that don't already exist
  let addedCount = 0;
  for (const builtinTemplate of builtinTemplates) {
    if (!templates.find(t => t.id === builtinTemplate.id)) {
      templates.push(builtinTemplate);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    await saveTemplates(templates);
    console.log(chalk.green(`✓ Imported ${addedCount} built-in templates`));
  } else {
    console.log(chalk.yellow('All built-in templates are already available'));
  }
}

async function importFromFile(): Promise<void> {
  const { filePath } = await inquirer.prompt({
    type: 'input',
    name: 'filePath',
    message: 'Path to JSON file:',
    validate: (input) => fs.existsSync(input) || 'File does not exist'
  });

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const importedTemplates: PromptTemplate[] = JSON.parse(content);

    const templates = await loadTemplates();
    let addedCount = 0;

    for (const importedTemplate of importedTemplates) {
      if (!templates.find(t => t.id === importedTemplate.id)) {
        templates.push(importedTemplate);
        addedCount++;
      }
    }

    await saveTemplates(templates);
    console.log(chalk.green(`✓ Imported ${addedCount} templates from file`));
  } catch (error) {
    console.error(chalk.red('❌ Import failed:'), error);
  }
}

async function importFromUrl(): Promise<void> {
  console.log(chalk.yellow('URL import feature coming soon!'));
}