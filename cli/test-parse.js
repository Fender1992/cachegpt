// Simple test for parsing (using plain JS to avoid template literal issues)
const { parseFileOperations } = require('./dist/lib/file-operations');

const testResponse = 'I will help you.\n\n' +
  'WRITE_FILE: src/test.js\n' +
  '```javascript\n' +
  'console.log("test");\n' +
  '```\n\n' +
  'EDIT_FILE: config.json REPLACE "debug": false WITH "debug": true\n\n' +
  'DELETE_FILE: old-file.js\n\n' +
  'All done!';

console.log('Testing AI response parsing...\n');
console.log('Input:', testResponse.substring(0, 100) + '...\n');

const result = parseFileOperations(testResponse);

console.log('Operations found:', result.operations.length);
console.log('\nOperations:');
result.operations.forEach((op, i) => {
  console.log(`${i + 1}. Type: ${op.type}, Path: ${op.path}`);
  if (op.content) console.log(`   Content: ${op.content.substring(0, 50)}...`);
  if (op.searchText) console.log(`   Search: "${op.searchText}" → "${op.replaceText}"`);
});

console.log('\nClean response:');
console.log(result.cleanResponse);

// Verify
const checks = [
  result.operations.length === 3,
  result.operations[0].type === 'write',
  result.operations[1].type === 'edit',
  result.operations[2].type === 'delete'
];

console.log('\n' + (checks.every(c => c) ? '✓ All checks passed!' : '✗ Some checks failed'));
