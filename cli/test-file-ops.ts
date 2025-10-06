/**
 * Test script for file operations
 * This simulates what the AI would output and tests the parsing/execution
 */

import {
  parseFileOperations,
  writeFile,
  editFile,
  deleteFile,
  formatOperationResult,
  showDiff
} from './src/lib/file-operations';
import * as fs from 'fs';
import * as path from 'path';

const testDir = path.join(__dirname, 'test-files');

// Clean up and create test directory
function setup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  console.log('✓ Test directory created:', testDir);
}

function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  console.log('✓ Test directory cleaned up');
}

async function testWriteFile() {
  console.log('\n=== Test 1: Write File ===');

  const testPath = path.join(testDir, 'hello.js');
  const content = `console.log('Hello, World!');\n`;

  const result = await writeFile(testPath, content);

  console.log(formatOperationResult(result));

  if (result.success && fs.existsSync(testPath)) {
    const written = fs.readFileSync(testPath, 'utf-8');
    if (written === content) {
      console.log('✓ Content matches');
    } else {
      console.log('✗ Content mismatch');
    }
  }
}

async function testEditFile() {
  console.log('\n=== Test 2: Edit File ===');

  // First create a file
  const testPath = path.join(testDir, 'config.json');
  const originalContent = `{\n  "debug": false,\n  "port": 3000\n}\n`;

  await writeFile(testPath, originalContent);
  console.log('✓ Created test file');

  // Now edit it
  const result = await editFile(testPath, 'replace', '"debug": false', '"debug": true');

  console.log(formatOperationResult(result));

  if (result.success && result.oldContent && result.newContent) {
    console.log(showDiff(result.oldContent, result.newContent, 5));

    const edited = fs.readFileSync(testPath, 'utf-8');
    if (edited.includes('"debug": true')) {
      console.log('✓ Edit successful');
    } else {
      console.log('✗ Edit failed');
    }
  }
}

async function testDeleteFile() {
  console.log('\n=== Test 3: Delete File ===');

  // First create a file
  const testPath = path.join(testDir, 'temp.txt');
  await writeFile(testPath, 'temporary content');
  console.log('✓ Created test file');

  // Now delete it
  const result = await deleteFile(testPath);

  console.log(formatOperationResult(result));

  if (result.success && !fs.existsSync(testPath)) {
    console.log('✓ File deleted successfully');
  } else {
    console.log('✗ File still exists');
  }
}

async function testParseOperations() {
  console.log('\n=== Test 4: Parse AI Response ===');

  const aiResponse = `I'll create a simple React component for you.

WRITE_FILE: src/Button.jsx
\`\`\`jsx
export function Button({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
}
\`\`\`

And update the config:

EDIT_FILE: config.json REPLACE "debug": false WITH "debug": true

Let me also clean up:

DELETE_FILE: old-file.js

That's all done!`;

  const { cleanResponse, operations } = parseFileOperations(aiResponse);

  console.log('Operations found:', operations.length);
  console.log('1. Write operation:', operations[0]?.type === 'write' ? '✓' : '✗');
  console.log('2. Edit operation:', operations[1]?.type === 'edit' ? '✓' : '✗');
  console.log('3. Delete operation:', operations[2]?.type === 'delete' ? '✓' : '✗');

  console.log('\nClean response (should not include operation syntax):');
  console.log(cleanResponse.substring(0, 200));
}

async function testMultipleWrites() {
  console.log('\n=== Test 5: Multiple File Writes ===');

  const aiResponse = `I'll create a simple project structure:

WRITE_FILE: test-files/package.json
\`\`\`json
{
  "name": "test-project",
  "version": "1.0.0"
}
\`\`\`

WRITE_FILE: test-files/index.js
\`\`\`javascript
console.log('Starting app...');
\`\`\`

WRITE_FILE: test-files/README.md
\`\`\`markdown
# Test Project
This is a test
\`\`\`
`;

  const { operations } = parseFileOperations(aiResponse);

  console.log('Operations found:', operations.length);

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    if (op.type === 'write' && op.content) {
      const result = await writeFile(op.path, op.content);
      console.log(`${i + 1}. ${formatOperationResult(result)}`);
    }
  }

  // Verify all files exist
  const files = ['test-files/package.json', 'test-files/index.js', 'test-files/README.md'];
  const allExist = files.every(f => fs.existsSync(f));
  console.log(allExist ? '✓ All files created' : '✗ Some files missing');
}

async function testErrorHandling() {
  console.log('\n=== Test 6: Error Handling ===');

  // Test edit on non-existent file
  const result1 = await editFile('/nonexistent/file.txt', 'replace', 'old', 'new');
  console.log('1. Edit non-existent file:', result1.success ? '✗ Should fail' : '✓ Correctly failed');
  console.log('   Error:', result1.error);

  // Test delete on non-existent file
  const result2 = await deleteFile('/nonexistent/file.txt');
  console.log('2. Delete non-existent file:', result2.success ? '✗ Should fail' : '✓ Correctly failed');
  console.log('   Error:', result2.error);

  // Test edit with non-matching search text
  const testPath = path.join(testDir, 'test-edit.txt');
  await writeFile(testPath, 'Hello World');
  const result3 = await editFile(testPath, 'replace', 'Goodbye', 'Hi');
  console.log('3. Edit with wrong search text:', result3.success ? '✗ Should fail' : '✓ Correctly failed');
  console.log('   Error:', result3.error);
}

async function runAllTests() {
  console.log('Starting File Operations Tests...\n');

  try {
    setup();

    await testWriteFile();
    await testEditFile();
    await testDeleteFile();
    await testParseOperations();
    await testMultipleWrites();
    await testErrorHandling();

    console.log('\n✓ All tests completed!\n');
  } catch (error: any) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    cleanup();
  }
}

runAllTests();
