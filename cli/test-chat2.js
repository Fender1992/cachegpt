const readline = require('readline');
const chalk = require('chalk');

// Test the exact same pattern we're using
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

console.log('Testing Promise-based readline');

const promptNext = () => {
  rl.setPrompt(chalk.green('You: '));
  rl.prompt();
};

// Simulate async API call
const fakeAPICall = (message) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Response to: ${message}`);
    }, 100);
  });
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

  console.log('Processing...');

  fakeAPICall(input)
    .then(response => {
      console.log(chalk.blue('Bot: ') + response);
      // This is the critical part - must call promptNext() after async work
      promptNext();
    })
    .catch(err => {
      console.error('Error:', err);
      promptNext();
    });
});

rl.on('close', () => {
  process.exit(0);
});

// Start the first prompt
promptNext();