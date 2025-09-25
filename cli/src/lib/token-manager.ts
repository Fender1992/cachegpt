/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to CLI token management, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * This system handles all CLI authentication - changes affect all CLI users.
 * After making changes, update STATUS file with:
 * - Changes to token storage format
 * - Impact on CLI authentication flow
 * - Any breaking changes requiring user action
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Strongly typed token definitions to prevent confusion
 */

// Base token interface
interface BaseToken {
  type: string;
  value: string;
  createdAt: number;
}

// Supabase JWT for CacheGPT API authentication
export interface SupabaseJWT extends BaseToken {
  type: 'supabase_jwt';
  expiresAt: number;
  refreshToken?: string;
  userId: string;
  userEmail?: string;
}

// Claude web session for claude.ai
export interface ClaudeWebSession extends BaseToken {
  type: 'claude_web_session';
  organizationId?: string;
  conversationId?: string;
  // Claude sessions are long-lived (weeks)
}

// ChatGPT web session for chat.openai.com
export interface ChatGPTWebSession extends BaseToken {
  type: 'chatgpt_web_session';
  // Session token from chat.openai.com
}

// Gemini web session for gemini.google.com
export interface GeminiWebSession extends BaseToken {
  type: 'gemini_web_session';
  // SAPISID or other Google session token
}

// API keys for direct provider access
export interface ProviderAPIKey extends BaseToken {
  type: 'provider_api_key';
  provider: 'openai' | 'anthropic' | 'google' | 'perplexity';
  // Never expires unless revoked
}

// OAuth temporary tokens (during login flow)
export interface OAuthToken extends BaseToken {
  type: 'oauth_token';
  provider: 'google' | 'github';
  expiresAt: number;
  scopes?: string[];
}

// Union type of all possible tokens
export type AuthToken =
  | SupabaseJWT
  | ClaudeWebSession
  | ChatGPTWebSession
  | GeminiWebSession
  | ProviderAPIKey
  | OAuthToken;

/**
 * Namespace-based token storage organized by purpose
 */
export interface TokenStorage {
  // CacheGPT backend authentication
  cachegpt_auth?: SupabaseJWT;

  // Provider web sessions
  web_sessions: {
    claude?: ClaudeWebSession;
    chatgpt?: ChatGPTWebSession;
    gemini?: GeminiWebSession;
    perplexity?: never; // Perplexity doesn't have web sessions yet
  };

  // Provider API keys
  api_keys: {
    openai?: ProviderAPIKey;
    anthropic?: ProviderAPIKey;
    google?: ProviderAPIKey;
    perplexity?: ProviderAPIKey;
  };

  // Temporary OAuth tokens (not persisted)
  oauth_temp?: OAuthToken;
}

/**
 * Type-safe token manager with clear namespacing
 */
export class TokenManager {
  private storage: TokenStorage;
  private storageDir: string;
  private storageFile: string;

  constructor() {
    this.storageDir = path.join(os.homedir(), '.cachegpt', 'tokens');
    this.storageFile = path.join(this.storageDir, 'tokens.json');
    this.storage = this.loadStorage();
  }

  /**
   * CacheGPT backend authentication
   */
  setCacheGPTAuth(jwt: string, refreshToken?: string, userId?: string, userEmail?: string): void {
    if (!this.isValidJWT(jwt)) {
      throw new Error('Invalid JWT format');
    }

    const decoded = this.decodeJWT(jwt);
    const expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + 3600000; // 1 hour default

    this.storage.cachegpt_auth = {
      type: 'supabase_jwt',
      value: jwt,
      createdAt: Date.now(),
      expiresAt,
      refreshToken,
      userId: userId || decoded.sub || 'unknown',
      userEmail: userEmail || decoded.email
    };

    this.saveStorage();
  }

  getCacheGPTAuth(): SupabaseJWT {
    const auth = this.storage.cachegpt_auth;
    if (!auth) {
      throw new Error('No CacheGPT authentication found. Please run "cachegpt init"');
    }

    if (Date.now() > auth.expiresAt) {
      throw new Error('CacheGPT authentication expired. Please re-authenticate.');
    }

    return auth;
  }

  /**
   * Web session management
   */
  setClaudeWebSession(sessionKey: string, organizationId?: string): void {
    if (!this.isValidClaudeSessionKey(sessionKey)) {
      throw new Error('Invalid Claude session key format');
    }

    this.storage.web_sessions.claude = {
      type: 'claude_web_session',
      value: sessionKey,
      createdAt: Date.now(),
      organizationId
    };

    this.saveStorage();
  }

  getClaudeWebSession(): ClaudeWebSession {
    const session = this.storage.web_sessions.claude;
    if (!session) {
      throw new Error('No Claude web session found. Please authenticate with Claude.');
    }

    return session;
  }

  setChatGPTWebSession(sessionToken: string): void {
    this.storage.web_sessions.chatgpt = {
      type: 'chatgpt_web_session',
      value: sessionToken,
      createdAt: Date.now()
    };

    this.saveStorage();
  }

  getChatGPTWebSession(): ChatGPTWebSession {
    const session = this.storage.web_sessions.chatgpt;
    if (!session) {
      throw new Error('No ChatGPT web session found. Please authenticate with ChatGPT.');
    }

    return session;
  }

  /**
   * API key management
   */
  setAPIKey(provider: 'openai' | 'anthropic' | 'google' | 'perplexity', apiKey: string): void {
    if (!this.isValidAPIKey(provider, apiKey)) {
      throw new Error(`Invalid API key format for ${provider}`);
    }

    this.storage.api_keys[provider] = {
      type: 'provider_api_key',
      value: apiKey,
      provider,
      createdAt: Date.now()
    };

    this.saveStorage();
  }

  getAPIKey(provider: 'openai' | 'anthropic' | 'google' | 'perplexity'): ProviderAPIKey {
    const key = this.storage.api_keys[provider];
    if (!key) {
      throw new Error(`No API key found for ${provider}. Please add your API key.`);
    }

    return key;
  }

  /**
   * Provider-agnostic credential retrieval
   */
  getCredentialForProvider(provider: string, preferWebSession: boolean = true): AuthToken {
    switch (provider) {
      case 'claude':
        if (preferWebSession) {
          try {
            return this.getClaudeWebSession();
          } catch {
            return this.getAPIKey('anthropic');
          }
        } else {
          return this.getAPIKey('anthropic');
        }

      case 'chatgpt':
        if (preferWebSession) {
          try {
            return this.getChatGPTWebSession();
          } catch {
            return this.getAPIKey('openai');
          }
        } else {
          return this.getAPIKey('openai');
        }

      case 'gemini':
        // Gemini web sessions not implemented yet, use API key
        return this.getAPIKey('google');

      case 'perplexity':
        // Perplexity only has API keys
        return this.getAPIKey('perplexity');

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Check what authentication methods are available
   */
  getAvailableAuthMethods(provider: string): { webSession: boolean; apiKey: boolean } {
    const result = { webSession: false, apiKey: false };

    switch (provider) {
      case 'claude':
        result.webSession = !!this.storage.web_sessions.claude;
        result.apiKey = !!this.storage.api_keys.anthropic;
        break;
      case 'chatgpt':
        result.webSession = !!this.storage.web_sessions.chatgpt;
        result.apiKey = !!this.storage.api_keys.openai;
        break;
      case 'gemini':
        result.webSession = !!this.storage.web_sessions.gemini;
        result.apiKey = !!this.storage.api_keys.google;
        break;
      case 'perplexity':
        result.apiKey = !!this.storage.api_keys.perplexity;
        break;
    }

    return result;
  }

  /**
   * Clear specific credential types
   */
  clearCacheGPTAuth(): void {
    delete this.storage.cachegpt_auth;
    this.saveStorage();
  }

  clearWebSession(provider: string): void {
    switch (provider) {
      case 'claude':
        delete this.storage.web_sessions.claude;
        break;
      case 'chatgpt':
        delete this.storage.web_sessions.chatgpt;
        break;
      case 'gemini':
        delete this.storage.web_sessions.gemini;
        break;
    }
    this.saveStorage();
  }

  clearAPIKey(provider: 'openai' | 'anthropic' | 'google' | 'perplexity'): void {
    delete this.storage.api_keys[provider];
    this.saveStorage();
  }

  clearAllCredentials(): void {
    this.storage = {
      web_sessions: {},
      api_keys: {}
    };
    this.saveStorage();
  }

  /**
   * Storage management
   */
  private loadStorage(): TokenStorage {
    try {
      if (fs.existsSync(this.storageFile)) {
        const encrypted = fs.readFileSync(this.storageFile, 'utf8');
        const decrypted = this.decrypt(encrypted);
        return JSON.parse(decrypted);
      }
    } catch (error) {
      console.warn('Failed to load token storage:', error);
    }

    return { web_sessions: {}, api_keys: {} };
  }

  private saveStorage(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
      }

      const json = JSON.stringify(this.storage, null, 2);
      const encrypted = this.encrypt(json);
      fs.writeFileSync(this.storageFile, encrypted, { mode: 0o600 });
    } catch (error) {
      console.error('Failed to save token storage:', error);
      throw new Error('Failed to save authentication data');
    }
  }

  /**
   * Token validation
   */
  private isValidJWT(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every(part => part.length > 0);
  }

  private isValidClaudeSessionKey(sessionKey: string): boolean {
    // Claude session keys can have various formats - be very permissive
    // Accept UUIDs, sk-ant-* keys, or any reasonably long string
    // The actual validation happens when trying to use the key with Claude's API
    return !!sessionKey && sessionKey.length >= 20;
  }

  private isValidAPIKey(provider: string, apiKey: string): boolean {
    switch (provider) {
      case 'openai':
        return apiKey.startsWith('sk-') && apiKey.length > 40;
      case 'anthropic':
        return apiKey.startsWith('sk-ant-') && apiKey.length > 40;
      case 'google':
        return apiKey.startsWith('AIza') && apiKey.length > 30;
      case 'perplexity':
        return apiKey.startsWith('pplx-') && apiKey.length > 40;
      default:
        return apiKey.length > 10; // Basic check
    }
  }

  private decodeJWT(jwt: string): any {
    try {
      const payload = jwt.split('.')[1];
      const decoded = Buffer.from(payload, 'base64').toString();
      return JSON.parse(decoded);
    } catch {
      return {};
    }
  }

  /**
   * Encryption for stored tokens
   */
  private encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(os.hostname() + 'cachegpt', 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return JSON.stringify({
      data: encrypted,
      iv: iv.toString('hex')
    });
  }

  private decrypt(encryptedData: string): string {
    try {
      const { data, iv } = JSON.parse(encryptedData);
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(os.hostname() + 'cachegpt', 'salt', 32);

      const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      // If decryption fails, assume it's not encrypted (legacy format)
      return encryptedData;
    }
  }

  /**
   * Debug and status methods
   */
  getStorageStatus(): Record<string, any> {
    return {
      hasCacheGPTAuth: !!this.storage.cachegpt_auth,
      webSessions: Object.keys(this.storage.web_sessions).filter(k => this.storage.web_sessions[k as keyof typeof this.storage.web_sessions]),
      apiKeys: Object.keys(this.storage.api_keys).filter(k => this.storage.api_keys[k as keyof typeof this.storage.api_keys]),
      storageFile: this.storageFile
    };
  }
}