import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables?: string[];
}

const BASIC_TEMPLATES: PromptTemplate[] = [
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review code for best practices',
    template: 'Please review this code:\n\n{{code}}\n\nFocus on: performance, security, and maintainability.',
    variables: ['code']
  },
  {
    id: 'explain-code',
    name: 'Explain Code',
    description: 'Get explanation of code',
    template: 'Please explain what this code does:\n\n{{code}}',
    variables: ['code']
  },
  {
    id: 'debug',
    name: 'Debug Issue',
    description: 'Help debug an issue',
    template: 'I\'m getting this error:\n\n{{error}}\n\nFrom this code:\n\n{{code}}\n\nHow do I fix it?',
    variables: ['error', 'code']
  }
];

export async function templatesCommand(action?: string, templateId?: string): Promise<void> {
  if (!action) {
    await listTemplates();
    return;
  }

  switch (action.toLowerCase()) {
    case 'list':
      await listTemplates();
      break;
    case 'use':
      await useTemplate(templateId);
      break;
    default:
      console.log(chalk.yellow('Available commands: list, use <template-id>'));
  }
}

async function listTemplates(): Promise<void> {
  console.log(chalk.cyan('\n📝 Available Templates:\n'));

  BASIC_TEMPLATES.forEach(t => {
    console.log(chalk.bold(`  ${t.id}`) + chalk.gray(` - ${t.description}`));
  });

  console.log(chalk.gray('\nUse: cachegpt templates use <template-id>\n'));
}

async function useTemplate(templateId?: string): Promise<void> {
  if (!templateId) {
    const { selected } = await inquirer.prompt({
      type: 'list',
      name: 'selected',
      message: 'Select a template:',
      choices: BASIC_TEMPLATES.map(t => ({
        name: `${t.name} - ${t.description}`,
        value: t.id
      }))
    });
    templateId = selected;
  }

  const template = BASIC_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    console.log(chalk.red(`Template '${templateId}' not found`));
    return;
  }

  let prompt = template.template;

  // Fill in variables
  if (template.variables && template.variables.length > 0) {
    const values: Record<string, string> = {};

    for (const variable of template.variables) {
      const { value } = await inquirer.prompt({
        type: 'editor',
        name: 'value',
        message: `Enter value for {{${variable}}}:`
      });
      values[variable] = value;
    }

    // Replace variables in template
    for (const [key, value] of Object.entries(values)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
  }

  console.log(chalk.green('\n✅ Generated Prompt:\n'));
  console.log(prompt);

  // Copy to clipboard if possible
  try {
    const { exec } = require('child_process');
    exec(`echo "${prompt.replace(/"/g, '\\"')}" | pbcopy`);
    console.log(chalk.gray('\n(Copied to clipboard)'));
  } catch {
    // Clipboard not available
  }
}