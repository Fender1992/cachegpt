import { Message } from 'discord.js';

/**
 * Handle the messageCreate event.
 * For now, we log message metadata. In the future this will feed the
 * embedding pipeline for search and AI context.
 */
export async function handleMessageCreate(message: Message): Promise<void> {
  // Skip messages from bots (including ourselves)
  if (message.author.bot) {
    return;
  }

  // Log message metadata (not content, for privacy)
  console.log(
    `[Gateway] Message in #${message.channel.isTextBased() && 'name' in message.channel ? message.channel.name : message.channelId} ` +
    `by ${message.author.tag} ` +
    `(guild: ${message.guild?.name ?? 'DM'}, ` +
    `length: ${message.content.length}, ` +
    `attachments: ${message.attachments.size})`
  );

  // Future: Feed into embedding pipeline
  // await embeddingPipeline.process({
  //   guildId: message.guild?.id,
  //   channelId: message.channelId,
  //   messageId: message.id,
  //   authorId: message.author.id,
  //   content: message.content,
  //   timestamp: message.createdTimestamp,
  // });
}
