import { config, validateConfig } from './config';
import { createClient, loginClient } from './gateway/client';
import { startApiServer } from './api/server';

async function main(): Promise<void> {
  console.log('[Bot] CacheGPT Discord Bot Service starting...');
  console.log('[Bot] ─────────────────────────────────────────');

  // Step 1: Validate configuration
  try {
    validateConfig();
    console.log('[Bot] Configuration validated');
  } catch (err) {
    console.error('[Bot] Configuration error:', (err as Error).message);
    process.exit(1);
  }

  // Step 2: Create the Discord.js client and register event handlers
  try {
    createClient();
    console.log('[Bot] Discord client created');
  } catch (err) {
    console.error('[Bot] Failed to create Discord client:', err);
    process.exit(1);
  }

  // Step 3: Start the internal Express API server
  try {
    await startApiServer();
    console.log(`[Bot] API server running on port ${config.api.port}`);
  } catch (err) {
    console.error('[Bot] Failed to start API server:', err);
    process.exit(1);
  }

  // Step 4: Connect to Discord Gateway
  try {
    await loginClient();
    console.log('[Bot] Connected to Discord Gateway');
  } catch (err) {
    console.error('[Bot] Failed to connect to Discord Gateway:', err);
    process.exit(1);
  }

  console.log('[Bot] ─────────────────────────────────────────');
  console.log('[Bot] All systems operational');
}

// ── Graceful Shutdown ──────────────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\n[Bot] Received ${signal}, shutting down gracefully...`);

  try {
    const { getClient } = require('./gateway/client');
    const client = getClient();
    client.destroy();
    console.log('[Bot] Discord client destroyed');
  } catch {
    // Client may not have been initialized
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Bot] Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Bot] Uncaught exception:', err);
  process.exit(1);
});

// ── Start ──────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('[Bot] Fatal error during startup:', err);
  process.exit(1);
});
