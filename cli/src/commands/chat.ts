import { chatUnifiedCommand } from './chat-unified';

/**
 * Main chat command - uses unified authentication
 */
export async function chatCommand(): Promise<void> {
  return await chatUnifiedCommand();
}