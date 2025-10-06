# File Operations in CacheGPT CLI

The CacheGPT CLI now supports full file operations (read, write, edit, delete) similar to Claude Code.

## Features

### 1. Automatic File Reading
When you mention a file in your message, it's automatically read and added to context:

```bash
❯ what's in package.json?
📄 Read file: /path/to/package.json (92 lines, 2156 chars)
```

### 2. Writing/Creating Files
The AI can create new files or overwrite existing ones:

**User:** "Create a hello.js file that prints Hello World"

**AI Response:**
```
I'll create a simple hello.js file for you.

WRITE_FILE: hello.js
```javascript
console.log('Hello, World!');
```
```

**Output:**
```
✓ Created: /path/to/hello.js
  1 lines written
```

### 3. Editing Files
The AI can find and replace text in existing files:

**User:** "Change debug to true in config.json"

**AI Response:**
```
EDIT_FILE: config.json REPLACE "debug": false WITH "debug": true
```

**Output:**
```
✓ Edited: config.json (1 lines changed)
  Changes:
  - "debug": false
  + "debug": true
```

### 4. Deleting Files
The AI can delete files when asked:

**User:** "Delete the old-script.js file"

**AI Response:**
```
DELETE_FILE: old-script.js
```

**Output:**
```
✓ Deleted: /path/to/old-script.js
```

## Syntax Reference

### Write File
```
WRITE_FILE: path/to/file.txt
```language
content here
```
```

### Edit File
```
EDIT_FILE: path/to/file.txt REPLACE "old text" WITH "new text"
```

### Delete File
```
DELETE_FILE: path/to/file.txt
```

## Examples

### Create a React Component
```bash
❯ create a simple React button component in src/Button.jsx
```

The AI will respond with:
```
WRITE_FILE: src/Button.jsx
```jsx
export function Button({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
}
```
```

### Update Configuration
```bash
❯ change the port to 4000 in server.js
```

The AI reads server.js, finds the port configuration, and responds:
```
EDIT_FILE: server.js REPLACE "const PORT = 3000" WITH "const PORT = 4000"
```

### Refactor Code
```bash
❯ read app.js and move the helper functions to utils.js
```

The AI will:
1. Read app.js automatically
2. Create utils.js with the helper functions
3. Update app.js to import from utils.js

## Path Resolution

The CLI supports various path formats:

- **Relative paths**: `./src/file.js`, `../config.json`
- **Absolute paths**: `/home/user/project/file.js`
- **Home directory**: `~/Documents/file.txt`
- **Current directory**: `file.js` (resolved to current working directory)

## Safety Features

- **Automatic directory creation**: Parent directories are created automatically when writing files
- **Clear feedback**: All operations show success/failure status
- **Diff preview**: For edits, you can see what changed
- **Error handling**: Clear error messages for failed operations

## Working Directory

The CLI displays your current working directory at the start:

```
──────────────────────────────────────────────────
  CacheGPT · Free AI Chat
──────────────────────────────────────────────────

  Working directory: /home/user/project
```

All relative paths are resolved from this directory.

## Tips

1. **Be specific**: "Create a TypeScript config file" is better than "make a config"
2. **Mention files**: Just mention a file name and it will be read automatically
3. **Ask for explanations**: "What does this code do?" after mentioning a file
4. **Batch operations**: "Read all .js files and add JSDoc comments"
5. **Review before accepting**: The AI shows what it will do before performing destructive operations

## Comparison with Claude Code

| Feature | CacheGPT CLI | Claude Code |
|---------|--------------|-------------|
| Read files | ✓ Automatic | ✓ Manual tool |
| Write files | ✓ Via AI syntax | ✓ Via tool |
| Edit files | ✓ Via AI syntax | ✓ Via tool |
| Delete files | ✓ Via AI syntax | ✓ Via tool |
| Diff preview | ✓ Built-in | ✓ Built-in |
| Zero setup | ✓ Just login | ✗ Requires API keys |

## Getting Started

1. Install and login:
```bash
npm install -g cachegpt-cli
cachegpt login
```

2. Start chatting:
```bash
cachegpt chat
```

3. Try file operations:
```bash
❯ create a README.md file explaining this project
❯ what files are in the current directory?
❯ update package.json to add a new script
```

That's it! The AI will handle file operations automatically based on your natural language requests.
