import { request } from 'undici';
import { createRemoteJWKSet, jwtVerify, JWTVerifyResult } from 'jose';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as http from 'http';
import { URL } from 'url';
import {
  TokenSet,
  UserInfo,
  IssuerMetadata,
  DeviceCodeResponse,
  PKCEParams,
  TokenClientConfig,
  AuthResult,
  Logger
} from './types';
import { StorageAdapter } from './storage/StorageAdapter';
import { createStorageAdapter } from './storage/createStorageAdapter';
import { generatePKCEChallenge } from './utils/pkce';
import { redactSecrets } from './utils/redaction';

const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access'];
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_CLOCK_SKEW = 120; // seconds
const REFRESH_BEFORE_EXPIRY = 120; // seconds

export class TokenClient extends EventEmitter {
  private config: Required<TokenClientConfig>;
  private metadata?: IssuerMetadata;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private refreshTimer?: NodeJS.Timeout;

  constructor(config: TokenClientConfig) {
    super();
    this.config = {
      ...config,
      scopes: config.scopes || DEFAULT_SCOPES,
      storageAdapter: config.storageAdapter || createStorageAdapter(),
      logger: config.logger || this.createDefaultLogger(),
      httpTimeout: config.httpTimeout || DEFAULT_TIMEOUT,
      clockSkew: config.clockSkew || DEFAULT_CLOCK_SKEW
    };
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, ...args) => this.emit('debug', msg, ...args),
      info: (msg, ...args) => this.emit('info', msg, ...args),
      warn: (msg, ...args) => this.emit('warn', msg, ...args),
      error: (msg, ...args) => this.emit('error', msg, ...args)
    };
  }

  async initialize(): Promise<void> {
    this.config.logger.info('Initializing TokenClient');
    await this.discoverMetadata();
    await this.config.storageAdapter.initialize();

    // Check for existing tokens and schedule refresh if needed
    const tokens = await this.config.storageAdapter.getTokens();
    if (tokens) {
      this.scheduleTokenRefresh(tokens);
    }
  }

  private async discoverMetadata(): Promise<IssuerMetadata> {
    if (this.metadata) return this.metadata;

    const wellKnownUrl = `${this.config.issuerUrl}/.well-known/openid-configuration`;
    this.config.logger.debug(`Discovering metadata from ${wellKnownUrl}`);

    try {
      const { body } = await request(wellKnownUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        bodyTimeout: this.config.httpTimeout,
        headersTimeout: this.config.httpTimeout
      });

      this.metadata = await body.json() as IssuerMetadata;
      this.jwks = createRemoteJWKSet(new URL(this.metadata.jwks_uri));

      this.config.logger.info('Metadata discovered successfully');
      return this.metadata;
    } catch (error) {
      this.config.logger.error('Failed to discover metadata', error);
      throw new Error(`Failed to discover OIDC metadata: ${error}`);
    }
  }

  async signInInteractivePkce(): Promise<AuthResult> {
    const metadata = await this.discoverMetadata();
    const pkceParams = await generatePKCEChallenge();

    // Start local callback server
    const { url, promise } = await this.startCallbackServer(pkceParams);

    // Build authorization URL
    const authUrl = new URL(metadata.authorization_endpoint);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', url);
    authUrl.searchParams.set('scope', this.config.scopes.join(' '));
    authUrl.searchParams.set('state', pkceParams.state);
    authUrl.searchParams.set('nonce', pkceParams.nonce);
    authUrl.searchParams.set('code_challenge', pkceParams.code_challenge);
    authUrl.searchParams.set('code_challenge_method', pkceParams.code_challenge_method);

    this.config.logger.info(`Opening browser to ${redactSecrets(authUrl.toString())}`);

    // Open browser
    const open = await this.openBrowser(authUrl.toString());
    if (!open) {
      throw new Error('Failed to open browser. Use --device flag for device code flow.');
    }

    // Wait for callback
    const code = await promise;

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code, url, pkceParams.code_verifier);

    // Validate and store tokens
    await this.validateAndStoreTokens(tokens, pkceParams.nonce);

    // Get user info
    const userInfo = await this.getUserInfo(tokens.access_token);

    return {
      method: 'pkce',
      tokens,
      userInfo
    };
  }

  async signInDeviceCode(): Promise<AuthResult> {
    const metadata = await this.discoverMetadata();

    if (!metadata.device_authorization_endpoint) {
      throw new Error('Device code flow not supported by this issuer');
    }

    // Request device code
    const deviceResponse = await this.requestDeviceCode(metadata.device_authorization_endpoint);

    this.config.logger.info('Device authorization initiated');
    this.emit('device_code', {
      user_code: deviceResponse.user_code,
      verification_uri: deviceResponse.verification_uri,
      verification_uri_complete: deviceResponse.verification_uri_complete
    });

    // Poll for token
    const tokens = await this.pollForDeviceToken(deviceResponse);

    // Store tokens
    await this.validateAndStoreTokens(tokens);

    // Get user info
    const userInfo = await this.getUserInfo(tokens.access_token);

    return {
      method: 'device_code',
      tokens,
      userInfo
    };
  }

  private async startCallbackServer(pkceParams: PKCEParams): Promise<{ url: string; promise: Promise<string> }> {
    const port = await this.findAvailablePort();
    const url = `http://127.0.0.1:${port}/callback`;

    const promise = new Promise<string>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.url?.startsWith('/callback')) {
          const searchParams = new URL(req.url, `http://127.0.0.1:${port}`).searchParams;
          const code = searchParams.get('code');
          const state = searchParams.get('state');
          const error = searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Failed</h1><p>You can close this window.</p>');
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (state !== pkceParams.state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Invalid State</h1><p>Authentication failed. Please try again.</p>');
            server.close();
            reject(new Error('State mismatch - possible CSRF attack'));
            return;
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Successful!</h1><p>You can close this window and return to the terminal.</p>');
            server.close();
            resolve(code);
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      server.listen(port, '127.0.0.1');

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout'));
      }, 300000);
    });

    return { url, promise };
  }

  private async findAvailablePort(): Promise<number> {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as any).port;
        server.close(() => resolve(port));
      });
    });
  }

  private async openBrowser(url: string): Promise<boolean> {
    try {
      const open = await import('open');
      await open.default(url);
      return true;
    } catch {
      return false;
    }
  }

  private async exchangeCodeForTokens(code: string, redirectUri: string, codeVerifier: string): Promise<TokenSet> {
    const metadata = await this.discoverMetadata();

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: this.config.clientId
    });

    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    const { body } = await request(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString(),
      bodyTimeout: this.config.httpTimeout,
      headersTimeout: this.config.httpTimeout
    });

    const tokens = await body.json() as TokenSet;

    // Calculate absolute expiry time
    if (tokens.expires_in) {
      tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
    }

    return tokens;
  }

  private async requestDeviceCode(endpoint: string): Promise<DeviceCodeResponse> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: this.config.scopes.join(' ')
    });

    const { body } = await request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString(),
      bodyTimeout: this.config.httpTimeout,
      headersTimeout: this.config.httpTimeout
    });

    return await body.json() as DeviceCodeResponse;
  }

  private async pollForDeviceToken(deviceResponse: DeviceCodeResponse): Promise<TokenSet> {
    const metadata = await this.discoverMetadata();
    const interval = (deviceResponse.interval || 5) * 1000;
    const expiry = Date.now() + (deviceResponse.expires_in * 1000);

    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceResponse.device_code,
      client_id: this.config.clientId
    });

    while (Date.now() < expiry) {
      await new Promise(resolve => setTimeout(resolve, interval));

      try {
        const { body } = await request(metadata.token_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: params.toString(),
          bodyTimeout: this.config.httpTimeout,
          headersTimeout: this.config.httpTimeout
        });

        const response = await body.json() as any;

        if (response.error) {
          if (response.error === 'authorization_pending') {
            continue;
          } else if (response.error === 'slow_down') {
            // Increase interval by 5 seconds
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          } else {
            throw new Error(`Device authorization failed: ${response.error}`);
          }
        }

        const tokens = response as TokenSet;
        if (tokens.expires_in) {
          tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
        }

        return tokens;
      } catch (error) {
        this.config.logger.warn('Device code polling error', error);
      }
    }

    throw new Error('Device authorization expired');
  }

  private async validateAndStoreTokens(tokens: TokenSet, nonce?: string): Promise<void> {
    // Validate ID token if present
    if (tokens.id_token && this.jwks) {
      try {
        const { payload } = await jwtVerify(tokens.id_token, this.jwks, {
          issuer: this.metadata?.issuer,
          audience: this.config.clientId,
          clockTolerance: this.config.clockSkew
        });

        if (nonce && payload.nonce !== nonce) {
          throw new Error('Nonce mismatch');
        }

        this.config.logger.info('ID token validated successfully');
      } catch (error) {
        this.config.logger.error('ID token validation failed', error);
        throw new Error(`Token validation failed: ${error}`);
      }
    }

    // Store tokens
    await this.config.storageAdapter.saveTokens(tokens);

    // Schedule refresh
    this.scheduleTokenRefresh(tokens);
  }

  private scheduleTokenRefresh(tokens: TokenSet): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!tokens.refresh_token || !tokens.expires_at) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const refreshAt = tokens.expires_at - REFRESH_BEFORE_EXPIRY;
    const delay = Math.max(0, (refreshAt - now) * 1000);

    this.refreshTimer = setTimeout(() => {
      this.refreshAccessToken().catch(error => {
        this.config.logger.error('Failed to refresh token', error);
      });
    }, delay);

    this.config.logger.debug(`Token refresh scheduled in ${delay / 1000} seconds`);
  }

  async getAccessToken(): Promise<string> {
    const tokens = await this.config.storageAdapter.getTokens();

    if (!tokens) {
      throw new Error('Not authenticated. Please run "cachegpt login" first.');
    }

    // Check if token needs refresh
    if (tokens.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= tokens.expires_at - REFRESH_BEFORE_EXPIRY) {
        if (tokens.refresh_token) {
          const newTokens = await this.refreshAccessToken();
          return newTokens.access_token;
        }
      }
    }

    return tokens.access_token;
  }

  async refreshAccessToken(): Promise<TokenSet> {
    const tokens = await this.config.storageAdapter.getTokens();

    if (!tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    const metadata = await this.discoverMetadata();

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: this.config.clientId
    });

    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    const { body } = await request(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString(),
      bodyTimeout: this.config.httpTimeout,
      headersTimeout: this.config.httpTimeout
    });

    const newTokens = await body.json() as TokenSet;

    if (newTokens.expires_in) {
      newTokens.expires_at = Math.floor(Date.now() / 1000) + newTokens.expires_in;
    }

    // Preserve refresh token if not returned
    if (!newTokens.refresh_token && tokens.refresh_token) {
      newTokens.refresh_token = tokens.refresh_token;
    }

    await this.config.storageAdapter.saveTokens(newTokens);
    this.scheduleTokenRefresh(newTokens);

    this.config.logger.info('Access token refreshed successfully');

    return newTokens;
  }

  async getUserInfo(accessToken?: string): Promise<UserInfo> {
    const metadata = await this.discoverMetadata();

    if (!metadata.userinfo_endpoint) {
      throw new Error('UserInfo endpoint not available');
    }

    const token = accessToken || await this.getAccessToken();

    const { body } = await request(metadata.userinfo_endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      bodyTimeout: this.config.httpTimeout,
      headersTimeout: this.config.httpTimeout
    });

    return await body.json() as UserInfo;
  }

  async revokeAndSignOut(): Promise<void> {
    const tokens = await this.config.storageAdapter.getTokens();

    if (!tokens) {
      return;
    }

    const metadata = await this.discoverMetadata();

    // Try to revoke tokens if endpoint available
    if (metadata.revocation_endpoint) {
      try {
        // Revoke refresh token first (cascades to access token)
        if (tokens.refresh_token) {
          await this.revokeToken(metadata.revocation_endpoint, tokens.refresh_token, 'refresh_token');
        } else if (tokens.access_token) {
          await this.revokeToken(metadata.revocation_endpoint, tokens.access_token, 'access_token');
        }

        this.config.logger.info('Tokens revoked successfully');
      } catch (error) {
        this.config.logger.warn('Failed to revoke tokens', error);
      }
    }

    // Clear local storage
    await this.config.storageAdapter.clearTokens();

    // Clear refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private async revokeToken(endpoint: string, token: string, tokenType: string): Promise<void> {
    const params = new URLSearchParams({
      token,
      token_type_hint: tokenType,
      client_id: this.config.clientId
    });

    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    await request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString(),
      bodyTimeout: this.config.httpTimeout,
      headersTimeout: this.config.httpTimeout
    });
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  async getStoredTokens(): Promise<TokenSet | null> {
    return await this.config.storageAdapter.getTokens();
  }
}