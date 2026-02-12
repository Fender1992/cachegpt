import { Router, Request, Response } from 'express';
import { getClient, guildCache, channelCache } from '../../gateway/client';
import {
  computePermissions,
  canViewChannel,
  filterChannelsByPermission,
  Role,
  Channel,
} from '../../services/permissions';

const router = Router();

/**
 * GET /api/guilds
 * Return all guilds the bot is in (from discord.js client cache).
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const guilds = Array.from(guildCache.values()).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      memberCount: g.memberCount,
    }));

    res.json(guilds);
  } catch (err) {
    console.error('[API] Error fetching guilds:', err);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

/**
 * GET /api/guilds/:guildId/channels
 * Get channels for a guild. If ?userId= is provided, filter by VIEW_CHANNEL permission.
 */
router.get('/:guildId/channels', async (req: Request, res: Response) => {
  try {
    const { guildId } = req.params;
    const userId = req.query.userId as string | undefined;

    const client = getClient();
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    // Get all cached channels for this guild
    const guildChannels: Channel[] = [];
    for (const [, ch] of channelCache) {
      if (ch.guildId === guildId) {
        guildChannels.push({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          parentId: ch.parentId,
          topic: ch.topic,
          position: ch.position,
          permissionOverwrites: ch.permissionOverwrites,
        });
      }
    }

    // If no userId, return all channels
    if (!userId) {
      const result = guildChannels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        parentId: ch.parentId,
        topic: ch.topic,
        position: ch.position,
      }));
      res.json(result);
      return;
    }

    // Fetch the member to get their roles
    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch {
      res.status(404).json({ error: 'Member not found in guild' });
      return;
    }

    const memberRoles = member.roles.cache.map((r) => r.id);
    const guildRoles: Role[] = guild.roles.cache.map((r) => ({
      id: r.id,
      permissions: r.permissions.bitfield.toString(),
      position: r.position,
    }));

    const filtered = filterChannelsByPermission(
      guildChannels,
      memberRoles,
      guildRoles,
      guild.ownerId,
      userId
    );

    const result = filtered.map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      parentId: ch.parentId,
      topic: ch.topic,
      position: ch.position,
    }));

    res.json(result);
  } catch (err) {
    console.error('[API] Error fetching channels:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

/**
 * GET /api/guilds/:guildId/members/:userId
 * Get a guild member with their roles.
 */
router.get('/:guildId/members/:userId', async (req: Request, res: Response) => {
  try {
    const { guildId, userId } = req.params;

    const client = getClient();
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch {
      res.status(404).json({ error: 'Member not found in guild' });
      return;
    }

    res.json({
      id: member.id,
      username: member.user.username,
      discriminator: member.user.discriminator,
      displayName: member.displayName,
      avatar: member.user.avatarURL({ size: 128 }),
      roles: member.roles.cache.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.hexColor,
        position: r.position,
        permissions: r.permissions.bitfield.toString(),
      })),
      joinedAt: member.joinedAt?.toISOString() ?? null,
      isOwner: guild.ownerId === userId,
    });
  } catch (err) {
    console.error('[API] Error fetching member:', err);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

/**
 * GET /api/guilds/:guildId/roles
 * Get all roles in a guild.
 */
router.get('/:guildId/roles', (_req: Request, res: Response) => {
  try {
    const { guildId } = _req.params;

    const client = getClient();
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    const roles = guild.roles.cache.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.hexColor,
      position: r.position,
      permissions: r.permissions.bitfield.toString(),
      managed: r.managed,
      mentionable: r.mentionable,
      hoist: r.hoist,
    }));

    // Sort by position descending (highest role first)
    roles.sort((a, b) => b.position - a.position);

    res.json(roles);
  } catch (err) {
    console.error('[API] Error fetching roles:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

export default router;
