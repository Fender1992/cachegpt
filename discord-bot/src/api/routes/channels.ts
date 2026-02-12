import { Router, Request, Response } from 'express';
import { getClient } from '../../gateway/client';
import { ChannelType, TextChannel, NewsChannel } from 'discord.js';

const router = Router();

/**
 * GET /api/channels/:channelId/messages
 * Fetch messages from a Discord channel using the bot's connection.
 * Query params: ?limit=50&before=<snowflake>&after=<snowflake>
 */
router.get('/:channelId/messages', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const before = req.query.before as string | undefined;
    const after = req.query.after as string | undefined;

    const client = getClient();
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
      // Try to fetch the channel if not cached
      try {
        const fetchedChannel = await client.channels.fetch(channelId);
        if (!fetchedChannel) {
          res.status(404).json({ error: 'Channel not found' });
          return;
        }
        // Continue with fetched channel below
      } catch {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }
    }

    const resolvedChannel = client.channels.cache.get(channelId);
    if (!resolvedChannel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    // Ensure it's a text-based channel
    if (!resolvedChannel.isTextBased()) {
      res.status(400).json({ error: 'Channel is not text-based' });
      return;
    }

    const fetchOptions: { limit: number; before?: string; after?: string } = { limit };
    if (before) fetchOptions.before = before;
    if (after) fetchOptions.after = after;

    const messages = await resolvedChannel.messages.fetch(fetchOptions);

    const result = messages.map((msg) => ({
      id: msg.id,
      content: msg.content,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        discriminator: msg.author.discriminator,
        avatar: msg.author.avatarURL({ size: 64 }),
        bot: msg.author.bot,
      },
      timestamp: msg.createdAt.toISOString(),
      editedTimestamp: msg.editedAt?.toISOString() ?? null,
      attachments: msg.attachments.map((a) => ({
        id: a.id,
        filename: a.name,
        url: a.url,
        size: a.size,
        contentType: a.contentType,
      })),
      embeds: msg.embeds.map((e) => ({
        title: e.title,
        description: e.description,
        url: e.url,
        color: e.color,
        fields: e.fields,
        thumbnail: e.thumbnail,
        image: e.image,
      })),
      reactions: msg.reactions.cache.map((r) => ({
        emoji: r.emoji.name,
        count: r.count,
      })),
      referencedMessage: msg.reference
        ? {
            messageId: msg.reference.messageId,
            channelId: msg.reference.channelId,
            guildId: msg.reference.guildId,
          }
        : null,
      pinned: msg.pinned,
      type: msg.type,
    }));

    res.json(result);
  } catch (err) {
    console.error('[API] Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /api/channels/:channelId/messages
 * Send a message to a Discord channel.
 * Body: { content: string }
 */
router.post('/:channelId/messages', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Message content is required and must be a string' });
      return;
    }

    if (content.length > 2000) {
      res.status(400).json({ error: 'Message content must be 2000 characters or fewer' });
      return;
    }

    const client = getClient();
    let channel = client.channels.cache.get(channelId);

    if (!channel) {
      try {
        channel = (await client.channels.fetch(channelId)) ?? undefined;
      } catch {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }
    }

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    if (!channel.isTextBased()) {
      res.status(400).json({ error: 'Channel is not text-based' });
      return;
    }

    // Type assertion for send capability
    if (!('send' in channel)) {
      res.status(400).json({ error: 'Cannot send messages to this channel type' });
      return;
    }

    const sentMessage = await (channel as TextChannel | NewsChannel).send({ content });

    res.status(201).json({
      id: sentMessage.id,
      content: sentMessage.content,
      author: {
        id: sentMessage.author.id,
        username: sentMessage.author.username,
        discriminator: sentMessage.author.discriminator,
        avatar: sentMessage.author.avatarURL({ size: 64 }),
        bot: sentMessage.author.bot,
      },
      timestamp: sentMessage.createdAt.toISOString(),
      channelId: sentMessage.channelId,
    });
  } catch (err) {
    console.error('[API] Error sending message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
