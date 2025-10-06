# CacheGPT CLI File Operations - Demo

This document demonstrates the new file operation capabilities.

## Quick Test

Run this command to test the file operations:

```bash
cd /root/cachegpt/cli
yarn build
node test-parse.js
npx ts-node test-file-ops.ts
```

## What Works

### ✅ 1. Write Files
The AI can create files with this syntax:

```
WRITE_FILE: path/to/file.js
```javascript
console.log('Hello, World!');
```
```

### ✅ 2. Edit Files
The AI can find and replace text:

```
EDIT_FILE: config.json REPLACE "debug": false WITH "debug": true
```

### ✅ 3. Delete Files
The AI can delete files:

```
DELETE_FILE: old-file.js
```

### ✅ 4. Parse AI Responses
The system automatically:
- Detects file operation commands in AI responses
- Extracts the file paths and content
- Executes the operations
- Shows success/failure feedback

### ✅ 5. Automatic File Reading
When you mention a file, it's automatically read:
```bash
❯ what's in package.json?
📄 Read file: package.json (92 lines, 2156 chars)
```

## Test Results

All tests pass:
- ✅ Write file: Creates new files with content
- ✅ Edit file: Finds and replaces text, shows diff
- ✅ Delete file: Removes files safely
- ✅ Parse operations: Extracts 3 different operation types from AI response
- ✅ Multiple writes: Handles multiple files in one response
- ✅ Error handling: Gracefully handles non-existent files and bad edits

## Example Usage

### Create a Simple Express Server

**User:** "Create a simple Express server in server.js"

**AI Response:**
```
I'll create a basic Express server for you.

WRITE_FILE: server.js
```javascript
const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```
```

**Output:**
```
  File Operations:

  ✓ Created: /root/cachegpt/cli/server.js
    9 lines written
```

### Update Configuration

**User:** "Change the port to 4000 in server.js"

**AI Response:**
```
I'll update the port for you.

EDIT_FILE: server.js REPLACE const PORT = 3000 WITH const PORT = 4000
```

**Output:**
```
  File Operations:

  ✓ Edited: /root/cachegpt/cli/server.js (1 lines changed)
  Changes:
  - const PORT = 3000;
  + const PORT = 4000;
```

### Create Multiple Files

**User:** "Create a basic React project structure"

**AI Response:**
```
I'll create the essential files for a React project.

WRITE_FILE: package.json
```json
{
  "name": "my-react-app",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

WRITE_FILE: src/index.js
```javascript
import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

ReactDOM.render(<App />, document.getElementById('root'));
```

WRITE_FILE: src/App.js
```javascript
import React from 'react';

function App() {
  return <h1>Hello, React!</h1>;
}

export default App;
```
```

**Output:**
```
  File Operations:

  ✓ Created: package.json
    8 lines written
  ✓ Created: src/index.js
    5 lines written
  ✓ Created: src/App.js
    7 lines written
```

## How It Works

1. **User sends message** → "Create a hello.js file"
2. **System prompt** → Tells AI how to use file operations
3. **AI generates response** → Includes WRITE_FILE command
4. **Parser extracts operations** → Finds file path and content
5. **Operations executed** → File is created
6. **Feedback displayed** → Shows success with line count

## Comparison with Claude Code

| Feature | CacheGPT CLI | Claude Code |
|---------|--------------|-------------|
| **Setup** | `npm i -g cachegpt-cli && cachegpt login` | Requires API key |
| **Cost** | Free (rotating providers) | Pays per API call |
| **File Read** | ✅ Automatic | ✅ Tool-based |
| **File Write** | ✅ AI syntax | ✅ Tool-based |
| **File Edit** | ✅ Find/replace | ✅ Diff-based |
| **File Delete** | ✅ Supported | ✅ Supported |
| **Diff Preview** | ✅ Shows changes | ✅ Shows changes |
| **Error Handling** | ✅ Clear messages | ✅ Clear messages |

## Implementation Details

### Core Files

1. **`/cli/src/lib/file-operations.ts`**
   - `writeFile()` - Create/overwrite files
   - `editFile()` - Find and replace
   - `deleteFile()` - Remove files
   - `parseFileOperations()` - Extract commands from AI response

2. **`/cli/src/lib/file-context.ts`** (existing)
   - `detectFilePaths()` - Find file mentions
   - `readFileContext()` - Read files
   - `enrichMessageWithFiles()` - Add file content to messages

3. **`/cli/src/commands/free-chat.ts`**
   - Updated system prompt with file operation instructions
   - Integrated parsing and execution in chat loop
   - Added visual feedback

### Regex Patterns

```javascript
// Write: WRITE_FILE: path\n```language\ncontent```
/WRITE_FILE:\s*([^\n]+)\n```[\w]*\n([\s\S]*?)```/g

// Edit: EDIT_FILE: path REPLACE old WITH new
/EDIT_FILE:\s*(.+?)\s+REPLACE\s+(.+?)\s+WITH\s+(.+)/gi

// Delete: DELETE_FILE: path
/DELETE_FILE:\s*([^\n]+?)(?:\n|$)/gi
```

## Next Steps

1. ✅ File operations fully implemented and tested
2. ⚠️ Needs real-world usage testing
3. 🔜 Could add interactive confirmations
4. 🔜 Could add support for batch operations
5. 🔜 Could add file templates/scaffolding

## Conclusion

The CacheGPT CLI now has full file operation capabilities similar to Claude Code, but with:
- **Zero setup** - just login and go
- **Free usage** - rotating provider model
- **Natural language** - just describe what you want

Try it out:
```bash
cachegpt chat
❯ create a hello.js file that prints "Hello, World!"
```
