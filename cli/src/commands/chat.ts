import { freeChatCommand } from './free-chat';

/**
 * Main chat command - now uses free providers with OAuth (zero setup!)
 */
export async function chatCommand(): Promise<void> {
  return await freeChatCommand();
}