#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Path to the actual Next.js CLI file
const nextPath = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');

// Start the development server
const child = spawn('node', [nextPath, 'dev'], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env }
});

child.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code);
});