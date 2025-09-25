import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { createInterface } from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Super simple - just store the key and use it
interface SimpleAuth {
  apiKey: string;
}

export async function claudeCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan('🤖 Claude Chat (Simple Mode)\n'));

  // Check for stored key
  const authPath = path.join(os.homedir(), '.cachegpt', 'claude-key.json');
  let auth: SimpleAuth | null = null;

  if (fs.existsSync(authPath)) {
    try {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      console.log(chalk.green('✅ Using stored API key\n'));
    } catch {}
  }

  if (!auth) {
    console.log(chalk.yellow('No API key found. Let\'s set one up:\n'));
    console.log('Get your key from: https://console.anthropic.com/settings/keys');
    console.log('(Keys start with sk-ant-api03-...)\n');

    const { apiKey } = await inquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: 'Paste your Claude API key:',
      validate: (input) => {
        if (!input) return 'API key is required';
        if (!input.startsWith('sk-ant-')) return 'Invalid key format (should start with sk-ant-)';
        return true;
      }
    });

    // Save the key
    const dir = path.dirname(authPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    auth = { apiKey };
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    console.log(chalk.green('\n✅ API key saved!\n'));
  }

  // Start chatting
  console.log(chalk.cyan('💬 Type your message (or "exit" to quit):\n'));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const chat = async () => {
    rl.question(chalk.green('You: '), async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log(chalk.yellow('\nBye! 👋\n'));
        rl.close();
        return;
      }

      if (!input.trim()) {
        chat();
        return;
      }

      const spinner = ora('Claude is thinking...').start();

      try {
        // Direct API call to Anthropic
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': auth!.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-opus-20240229',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: input
            }]
          })
        });

        spinner.stop();

        if (!response.ok) {
          const error = await response.text();
          if (response.status === 401) {
            console.log(chalk.red('\n❌ Invalid API key. Delete ~/.cachegpt/claude-key.json and try again.\n'));
            // Clear the bad key
            fs.unlinkSync(authPath);
            rl.close();
            return;
          }
          throw new Error(error);
        }

        const data = await response.json();
        const message = data.content[0].text;

        console.log(chalk.blue('\nClaude: ') + message + '\n');

      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red('\n❌ Error: ') + error.message + '\n');
      }

      chat();
    });
  };

  chat();
}