const readline = require('readline');
const chalk = require('chalk');

// Simulate the chat interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(chalk.cyan('Testing readline event-based approach'));

const promptNext = () => {
  rl.setPrompt(chalk.green('You: '));
  rl.prompt();
};

rl.on('line', (input) => {
  if (input === 'exit') {
    console.log(chalk.yellow('Goodbye!'));
    rl.close();
    return;
  }

  if (!input.trim()) {
    promptNext();
    return;
  }

  console.log(chalk.blue('Bot: ') + 'Test response to: ' + input);

  // This is the critical part - prompt for next input
  promptNext();
});

rl.on('close', () => {
  process.exit(0);
});

// Start the first prompt
promptNext();