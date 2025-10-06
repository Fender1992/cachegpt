/**
 * Test script for shell operations
 */

import {
  parseShellOperations,
  executeCommand,
  formatShellResult,
  isDangerousCommand,
  isSafeCommand,
  getSafetyWarning
} from './src/lib/shell-operations';

async function testParseShellCommands() {
  console.log('=== Test 1: Parse Shell Commands ===\n');

  const aiResponse = `I'll help you check the directory and fetch some data.

First, let's see what's in the current directory:
EXECUTE: ls -la

Now let's fetch some data from GitHub:
EXECUTE: curl -s https://api.github.com/users/octocat

You can also use bash blocks:
\`\`\`bash
pwd
whoami
date
\`\`\`

That's all!`;

  const { cleanResponse, operations } = parseShellOperations(aiResponse);

  console.log('Operations found:', operations.length);
  operations.forEach((op, i) => {
    console.log(`${i + 1}. Command: ${op.command}`);
  });

  console.log('\nExpected: 5 operations (ls, curl, pwd, whoami, date)');
  console.log(operations.length === 5 ? '✓ Correct count' : '✗ Wrong count');
  console.log();
}

async function testSafetyChecks() {
  console.log('=== Test 2: Safety Checks ===\n');

  const testCases = [
    { cmd: 'ls -la', shouldBeSafe: true, shouldBeDangerous: false },
    { cmd: 'curl https://api.github.com', shouldBeSafe: true, shouldBeDangerous: false },
    { cmd: 'rm -rf /', shouldBeSafe: false, shouldBeDangerous: true },
    { cmd: 'mkfs.ext4 /dev/sda', shouldBeSafe: false, shouldBeDangerous: true },
    { cmd: 'npm install', shouldBeSafe: true, shouldBeDangerous: false },
    { cmd: 'shutdown -h now', shouldBeSafe: false, shouldBeDangerous: true },
  ];

  for (const test of testCases) {
    const isSafe = isSafeCommand(test.cmd);
    const isDangerous = isDangerousCommand(test.cmd);

    console.log(`Command: ${test.cmd}`);
    console.log(`  Safe: ${isSafe} (expected: ${test.shouldBeSafe}) ${isSafe === test.shouldBeSafe ? '✓' : '✗'}`);
    console.log(`  Dangerous: ${isDangerous} (expected: ${test.shouldBeDangerous}) ${isDangerous === test.shouldBeDangerous ? '✓' : '✗'}`);

    const warning = getSafetyWarning(test.cmd);
    if (warning) {
      console.log(`  Warning: ${warning.split('\n')[0]}`);
    }
    console.log();
  }
}

async function testCommandExecution() {
  console.log('=== Test 3: Execute Safe Commands ===\n');

  // Test 1: Simple echo
  console.log('1. Testing: echo "Hello, World!"');
  const result1 = await executeCommand('echo "Hello, World!"');
  console.log(formatShellResult(result1));

  // Test 2: pwd
  console.log('2. Testing: pwd');
  const result2 = await executeCommand('pwd');
  console.log(formatShellResult(result2));

  // Test 3: whoami
  console.log('3. Testing: whoami');
  const result3 = await executeCommand('whoami');
  console.log(formatShellResult(result3));

  // Test 4: ls (current directory)
  console.log('4. Testing: ls');
  const result4 = await executeCommand('ls');
  console.log(formatShellResult(result4));

  // Test 5: Command with error
  console.log('5. Testing: ls /nonexistent/path (should fail)');
  const result5 = await executeCommand('ls /nonexistent/path');
  console.log(formatShellResult(result5));
}

async function testCurlCommand() {
  console.log('=== Test 4: Test curl Command ===\n');

  console.log('Testing: curl -s https://api.github.com/users/octocat');
  const result = await executeCommand('curl -s https://api.github.com/users/octocat', {
    timeout: 10000
  });

  if (result.success && result.output) {
    console.log('✓ curl command succeeded');
    console.log('  Response size:', result.output.length, 'bytes');

    try {
      const json = JSON.parse(result.output);
      console.log('  Parsed JSON successfully');
      console.log('  User login:', json.login);
      console.log('  User type:', json.type);
    } catch (e) {
      console.log('  Could not parse as JSON');
    }
  } else {
    console.log('✗ curl command failed');
    console.log(formatShellResult(result));
  }

  console.log();
}

async function runAllTests() {
  console.log('Starting Shell Operations Tests...\n');

  try {
    await testParseShellCommands();
    await testSafetyChecks();
    await testCommandExecution();
    await testCurlCommand();

    console.log('✓ All tests completed!\n');
  } catch (error: any) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
  }
}

runAllTests();
