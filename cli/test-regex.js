// Test the regex patterns directly

const testString = 'EDIT_FILE: config.json REPLACE "debug": false WITH "debug": true';

console.log('Testing string:', testString);
console.log();

// Try different patterns
const patterns = [
  {
    name: 'With quotes required',
    regex: /EDIT_FILE:\s*([^\n]+)\s+REPLACE\s+"([^"]*)"\s+WITH\s+"([^"]*)"/gi
  },
  {
    name: 'With optional quotes',
    regex: /EDIT_FILE:\s*([^\n]+?)\s+REPLACE\s+["']?([^"'\n]+?)["']?\s+WITH\s+["']?([^"'\n]+?)["']?(?:\n|$)/gi
  },
  {
    name: 'Greedy version',
    regex: /EDIT_FILE:\s+(.+?)\s+REPLACE\s+(.+?)\s+WITH\s+(.+?)$/gim
  },
  {
    name: 'Simple version',
    regex: /EDIT_FILE:\s*(.+?)\s+REPLACE\s+(.+?)\s+WITH\s+(.+)/gi
  }
];

patterns.forEach(({ name, regex }) => {
  console.log(`Pattern: ${name}`);
  const match = regex.exec(testString);
  if (match) {
    console.log('  ✓ Matched!');
    console.log('  Path:', match[1]);
    console.log('  Search:', match[2]);
    console.log('  Replace:', match[3]);
  } else {
    console.log('  ✗ No match');
  }
  console.log();
});
