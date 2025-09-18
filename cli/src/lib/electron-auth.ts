import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import express from 'express';

/**
 * This creates a simple Electron app (like Claude Code) to handle authentication
 * The Electron app won't be detected as automation by Cloudflare
 */
export async function createElectronAuthHelper(): Promise<string> {
  // Create a minimal Electron app that opens Claude
  const electronAppCode = `
const { app, BrowserWindow, session } = require('electron');
const path = require('path');

let mainWindow;

async function createWindow() {
  // Create persistent user data directory
  const userDataPath = path.join(app.getPath('userData'), 'claude-session');
  app.setPath('userData', userDataPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:claude' // Persistent session like Claude Code
    },
    title: 'Claude Login - CacheGPT'
  });

  // Clear any automation flags
  await session.defaultSession.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Load Claude
  mainWindow.loadURL('https://claude.ai/login');

  // Wait for successful login then extract cookies
  mainWindow.webContents.on('did-navigate', async (event, url) => {
    if (url.includes('/chat') || url === 'https://claude.ai/') {
      // User has logged in successfully
      setTimeout(async () => {
        const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
        const sessionCookie = cookies.find(c =>
          c.name.toLowerCase().includes('session') ||
          c.name.includes('auth')
        );

        if (sessionCookie) {
          // Send cookie back to CLI
          console.log('SESSION_COOKIE:' + sessionCookie.value);
          setTimeout(() => app.quit(), 1000);
        }
      }, 2000);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
`;

  // Create temp directory for mini Electron app
  const tempDir = path.join(os.tmpdir(), `cachegpt-electron-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Write package.json
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
    name: 'cachegpt-auth',
    version: '1.0.0',
    main: 'main.js',
    dependencies: {
      electron: '^28.0.0'
    }
  }, null, 2));

  // Write main.js
  fs.writeFileSync(path.join(tempDir, 'main.js'), electronAppCode);

  // Install electron locally
  const installProcess = spawn('npm', ['install'], {
    cwd: tempDir,
    stdio: 'ignore'
  });

  await new Promise(resolve => installProcess.on('close', resolve));

  // Run the Electron app
  return new Promise((resolve, reject) => {
    const electronProcess = spawn('npx', ['electron', '.'], {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let sessionCookie = '';

    electronProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('SESSION_COOKIE:')) {
        sessionCookie = output.split('SESSION_COOKIE:')[1].trim();
        electronProcess.kill();
      }
    });

    electronProcess.on('close', () => {
      // Cleanup
      try {
        fs.rmSync(tempDir, { recursive: true });
      } catch {}

      if (sessionCookie) {
        resolve(sessionCookie);
      } else {
        reject(new Error('Failed to capture session'));
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      electronProcess.kill();
      reject(new Error('Authentication timeout'));
    }, 5 * 60 * 1000);
  });
}