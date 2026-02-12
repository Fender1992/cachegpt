/**
 * Discord Gateway WebSocket Client
 * Handles real-time Discord events and messages
 */

import EventEmitter from 'events';

const DISCORD_GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: {
    id: string;
    username: string;
    discriminator?: string;
    global_name?: string;
    avatar?: string;
    bot?: boolean;
  };
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  mentions: any[];
  mention_everyone: boolean;
  attachments: any[];
  embeds: any[];
  type: number;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  topic?: string | null;
  last_message_id?: string | null;
  parent_id?: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string | null;
  channels?: DiscordChannel[];
  member_count?: number;
}

interface GatewayPayload {
  op: number;
  d: any;
  s?: number;
  t?: string;
}

export class DiscordGatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private lastSequence: number | null = null;
  private token: string;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(token: string) {
    super();
    this.token = token;
  }

  /**
   * Connect to Discord Gateway
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(DISCORD_GATEWAY_URL);

    this.ws.onopen = () => {
      console.log('[Discord Gateway] Connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const payload: GatewayPayload = JSON.parse(event.data);
        this.handlePayload(payload);
      } catch (error) {
        console.error('[Discord Gateway] Failed to parse message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Discord Gateway] WebSocket error:', error);
      this.emit('error', error);
    };

    this.ws.onclose = (event) => {
      console.log('[Discord Gateway] Disconnected:', event.code, event.reason);
      this.cleanup();
      
      // Attempt reconnection
      if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnect();
      } else {
        this.emit('disconnected', event.code);
      }
    };
  }

  /**
   * Handle incoming gateway payloads
   */
  private handlePayload(payload: GatewayPayload): void {
    const { op, d, s, t } = payload;

    // Update sequence number
    if (s) {
      this.lastSequence = s;
    }

    switch (op) {
      // Dispatch event
      case 0:
        this.handleDispatch(t!, d);
        break;

      // Heartbeat request
      case 1:
        this.sendHeartbeat();
        break;

      // Reconnect request
      case 7:
        this.reconnect();
        break;

      // Invalid session
      case 9:
        if (d) {
          // Session is resumable
          this.resume();
        } else {
          // Need to re-identify
          this.identify();
        }
        break;

      // Hello (contains heartbeat interval)
      case 10:
        this.startHeartbeat(d.heartbeat_interval);
        if (this.sessionId && this.lastSequence !== null) {
          this.resume();
        } else {
          this.identify();
        }
        break;

      // Heartbeat ACK
      case 11:
        // Heartbeat acknowledged
        break;
    }
  }

  /**
   * Handle dispatch events
   */
  private handleDispatch(eventType: string, data: any): void {
    switch (eventType) {
      case 'READY':
        this.sessionId = data.session_id;
        this.resumeGatewayUrl = data.resume_gateway_url;
        this.emit('ready', data);
        break;

      case 'MESSAGE_CREATE':
        this.emit('messageCreate', data as DiscordMessage);
        break;

      case 'MESSAGE_UPDATE':
        this.emit('messageUpdate', data as DiscordMessage);
        break;

      case 'MESSAGE_DELETE':
        this.emit('messageDelete', data);
        break;

      case 'TYPING_START':
        this.emit('typingStart', data);
        break;

      case 'CHANNEL_CREATE':
      case 'CHANNEL_UPDATE':
        this.emit('channelUpdate', data as DiscordChannel);
        break;

      case 'GUILD_CREATE':
      case 'GUILD_UPDATE':
        this.emit('guildUpdate', data as DiscordGuild);
        break;

      case 'PRESENCE_UPDATE':
        this.emit('presenceUpdate', data);
        break;

      default:
        // Emit other events for extensibility
        this.emit(eventType.toLowerCase(), data);
    }
  }

  /**
   * Send identify payload
   */
  private identify(): void {
    this.send({
      op: 2,
      d: {
        token: this.token,
        intents: 0x1 | 0x200 | 0x800 | 0x1000 | 0x2000 | 0x4000 | 0x8000, // Guilds, messages, typing, etc.
        properties: {
          os: 'browser',
          browser: 'CacheGPT',
          device: 'CacheGPT',
        },
      },
    });
  }

  /**
   * Send resume payload
   */
  private resume(): void {
    if (!this.sessionId || this.lastSequence === null) {
      this.identify();
      return;
    }

    this.send({
      op: 6,
      d: {
        token: this.token,
        session_id: this.sessionId,
        seq: this.lastSequence,
      },
    });
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(interval: number): void {
    this.stopHeartbeat();
    
    // Send first heartbeat
    this.sendHeartbeat();
    
    // Set up interval
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send heartbeat
   */
  private sendHeartbeat(): void {
    this.send({
      op: 1,
      d: this.lastSequence,
    });
  }

  /**
   * Send payload to gateway
   */
  private send(payload: GatewayPayload): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Reconnect to gateway
   */
  private reconnect(): void {
    if (this.isReconnecting) return;

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[Discord Gateway] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.isReconnecting = false;
      this.connect();
    }, delay);
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws = null;
    }
  }

  /**
   * Disconnect from gateway
   */
  disconnect(): void {
    this.cleanup();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Client disconnect');
    }
    this.emit('disconnected', 1000);
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(channelId: string, content: string): Promise<void> {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch messages from a channel
   */
  async fetchMessages(channelId: string, limit: number = 50): Promise<DiscordMessage[]> {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch user's guilds
   */
  async fetchGuilds(): Promise<DiscordGuild[]> {
    const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch guilds: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch channels for a guild
   */
  async fetchChannels(guildId: string): Promise<DiscordChannel[]> {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch channels: ${response.statusText}`);
    }

    return response.json();
  }
}