/**
 * Discord Permission Calculator
 *
 * Implements the full Discord permission resolution algorithm as documented at:
 * https://discord.com/developers/docs/topics/permissions#permission-hierarchy
 *
 * Permission bits reference:
 *   VIEW_CHANNEL = 0x400 (1 << 10)
 *   ADMINISTRATOR = 0x8 (1 << 3)
 *   ALL_PERMISSIONS = 0x3FFFFFFFFFF
 */

export interface Role {
  id: string;
  permissions: string; // Discord sends permissions as string-encoded bigint
  position: number;
}

export interface PermissionOverwrite {
  id: string;
  type: number; // 0 = role, 1 = member
  allow: string; // string-encoded bigint
  deny: string;  // string-encoded bigint
}

export interface Channel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  topic: string | null;
  position: number;
  permissionOverwrites: PermissionOverwrite[];
}

const VIEW_CHANNEL = BigInt(0x400);       // 1 << 10
const ADMINISTRATOR = BigInt(0x8);        // 1 << 3
const ALL_PERMISSIONS = BigInt('0x3FFFFFFFFFF');

/**
 * Compute the effective permissions for a guild member in a specific channel.
 *
 * Algorithm:
 * 1. Guild owner gets ALL permissions
 * 2. Start with @everyone role permissions
 * 3. OR in permissions from all of the member's roles
 * 4. If ADMINISTRATOR is set, return ALL permissions
 * 5. Apply channel-specific permission overwrites:
 *    a. Apply @everyone overwrite (deny then allow)
 *    b. Collect all role overwrites, OR denies together, OR allows together, apply
 *    c. Apply member-specific overwrite (deny then allow)
 * 6. Return final permission bitfield
 */
export function computePermissions(
  memberRoles: string[],
  guildRoles: Role[],
  guildOwnerId: string,
  userId: string,
  channelOverwrites?: PermissionOverwrite[]
): bigint {
  // Step 1: Owner gets everything
  if (userId === guildOwnerId) {
    return ALL_PERMISSIONS;
  }

  // Build a role lookup map
  const roleMap = new Map<string, Role>();
  let everyoneRole: Role | undefined;

  for (const role of guildRoles) {
    roleMap.set(role.id, role);
  }

  // The @everyone role has the same ID as the guild
  // We identify it by checking guildRoles — it's the one where role.id matches the guild id
  // Since we don't have guild id here, find the role that is in guildRoles but not in memberRoles
  // Actually, Discord always includes @everyone implicitly. The @everyone role id === guild id.
  // We'll look for a role whose id matches the guild id. But we don't have guild id here.
  // The conventional approach: the first role or the one with position 0.
  // In discord.js, guild.roles.everyone gives us that role.
  // For our purposes, the @everyone role is the role whose id is not in memberRoles
  // but is present in guildRoles. Actually, Discord DOES include @everyone in the guild roles
  // and its id equals the guild id. We'll find it by position 0.
  for (const role of guildRoles) {
    if (role.position === 0) {
      everyoneRole = role;
      break;
    }
  }

  // Step 2: Start with @everyone permissions
  let permissions = everyoneRole ? BigInt(everyoneRole.permissions) : BigInt(0);

  // Step 3: OR in all member role permissions
  for (const roleId of memberRoles) {
    const role = roleMap.get(roleId);
    if (role) {
      permissions |= BigInt(role.permissions);
    }
  }

  // Step 4: Administrator gets everything
  if ((permissions & ADMINISTRATOR) === ADMINISTRATOR) {
    return ALL_PERMISSIONS;
  }

  // Step 5: Apply channel overwrites (if provided)
  if (channelOverwrites && channelOverwrites.length > 0) {
    // 5a: Apply @everyone overwrite
    if (everyoneRole) {
      const everyoneOverwrite = channelOverwrites.find(
        (ow) => ow.id === everyoneRole!.id && ow.type === 0
      );
      if (everyoneOverwrite) {
        permissions &= ~BigInt(everyoneOverwrite.deny);
        permissions |= BigInt(everyoneOverwrite.allow);
      }
    }

    // 5b: Collect all role overwrites and merge
    let roleDeny = BigInt(0);
    let roleAllow = BigInt(0);

    for (const roleId of memberRoles) {
      const overwrite = channelOverwrites.find(
        (ow) => ow.id === roleId && ow.type === 0
      );
      if (overwrite) {
        roleDeny |= BigInt(overwrite.deny);
        roleAllow |= BigInt(overwrite.allow);
      }
    }

    permissions &= ~roleDeny;
    permissions |= roleAllow;

    // 5c: Apply member-specific overwrite
    const memberOverwrite = channelOverwrites.find(
      (ow) => ow.id === userId && ow.type === 1
    );
    if (memberOverwrite) {
      permissions &= ~BigInt(memberOverwrite.deny);
      permissions |= BigInt(memberOverwrite.allow);
    }
  }

  // Step 6: Return final bitfield
  return permissions;
}

/**
 * Check if a permission bitfield includes VIEW_CHANNEL (0x400).
 */
export function canViewChannel(permissions: bigint): boolean {
  return (permissions & VIEW_CHANNEL) === VIEW_CHANNEL;
}

/**
 * Filter a list of channels to only those the user can view, based on
 * their roles and the guild's role list and channel permission overwrites.
 */
export function filterChannelsByPermission(
  channels: Channel[],
  memberRoles: string[],
  guildRoles: Role[],
  guildOwnerId: string,
  userId: string
): Channel[] {
  return channels.filter((channel) => {
    const perms = computePermissions(
      memberRoles,
      guildRoles,
      guildOwnerId,
      userId,
      channel.permissionOverwrites
    );
    return canViewChannel(perms);
  });
}
