import { initUnifiedCommand } from './init-unified';

/**
 * Main initialization command - uses unified auth with Playwright + API key fallback
 */
export async function initCommand(): Promise<void> {
  return await initUnifiedCommand();
}