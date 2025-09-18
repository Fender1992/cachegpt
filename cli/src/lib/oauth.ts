import crypto from 'crypto';
import express from 'express';
import { Server } from 'http';
import open from 'open';
import fetch from 'node-fetch';

interface OAuthConfig {
  provider: string;
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string;
  redirectUri?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

interface OAuthProvider {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: string;
  clientSecret?: string;
  usesPKCE: boolean;
  customHeaders?: Record<string, string>;
}

// OAuth configurations for different providers
export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  // Note: Most LLM providers don't actually support OAuth 2.0 for public use
  // These are examples - you'll need to register your app with each provider

  google: {
    name: 'Google',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    clientId: process.env.GOOGLE_CLIENT_ID || '', // You must provide your own client ID
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    usesPKCE: true
  },
  microsoft: {
    name: 'Microsoft (Azure OpenAI)',
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'openid email profile offline_access',
    clientId: process.env.AZURE_CLIENT_ID || '', // You must provide your own client ID
    usesPKCE: true
  }
  // OpenAI, Anthropic, Perplexity, and Cohere don't provide public OAuth endpoints
  // Use API keys for these providers instead
};

export class OAuth2Client {
  private config: OAuthConfig;
  private codeVerifier?: string;
  private codeChallenge?: string;
  private state?: string;
  private server?: Server;
  private authorizationCode?: string;
  private port?: number;

  constructor(provider: string) {
    const providerConfig = OAUTH_PROVIDERS[provider];
    if (!providerConfig) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    this.config = {
      provider,
      clientId: providerConfig.clientId,
      clientSecret: providerConfig.clientSecret,
      authorizationUrl: providerConfig.authorizationUrl,
      tokenUrl: providerConfig.tokenUrl,
      scope: providerConfig.scope
    };

    // Generate PKCE parameters if provider supports it
    if (providerConfig.usesPKCE) {
      this.generatePKCEParams();
    }

    // Generate state for CSRF protection
    this.state = this.generateRandomString(32);
  }

  private generateRandomString(length: number): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  private generatePKCEParams(): void {
    // Generate code verifier (43-128 characters)
    this.codeVerifier = this.generateRandomString(96);

    // Generate code challenge (SHA256 hash of verifier)
    const hash = crypto.createHash('sha256').update(this.codeVerifier).digest();
    this.codeChallenge = hash.toString('base64url');
  }

  private async findAvailablePort(startPort: number = 3000, endPort: number = 9999): Promise<number> {
    for (let port = startPort; port <= endPort; port++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const testServer = express().listen(port, () => {
            testServer.close(() => resolve());
          }).on('error', reject);
        });
        return port;
      } catch {
        continue;
      }
    }
    throw new Error('No available ports found');
  }

  private async startCallbackServer(): Promise<string> {
    const app = express();
    this.port = await this.findAvailablePort();

    return new Promise((resolve, reject) => {
      // Setup callback endpoint
      app.get('/callback', (req, res) => {
        const { code, state, error, error_description } = req.query;

        if (error) {
          res.send(`
            <html>
              <head>
                <style>
                  body { font-family: system-ui; padding: 40px; text-align: center; }
                  .error { color: #dc3545; }
                </style>
              </head>
              <body>
                <h1 class="error">Authentication Failed</h1>
                <p>${error_description || error}</p>
                <p>You can close this window and return to your terminal.</p>
              </body>
            </html>
          `);
          reject(new Error(`OAuth error: ${error_description || error}`));
          return;
        }

        // Verify state parameter for CSRF protection
        if (state !== this.state) {
          res.send(`
            <html>
              <head>
                <style>
                  body { font-family: system-ui; padding: 40px; text-align: center; }
                  .error { color: #dc3545; }
                </style>
              </head>
              <body>
                <h1 class="error">Security Validation Failed</h1>
                <p>The authentication state did not match. Please try again.</p>
              </body>
            </html>
          `);
          reject(new Error('State parameter mismatch - possible CSRF attack'));
          return;
        }

        // Success response
        this.authorizationCode = code as string;
        res.send(`
          <html>
            <head>
              <style>
                body {
                  font-family: system-ui;
                  padding: 40px;
                  text-align: center;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                }
                .success {
                  font-size: 48px;
                  margin-bottom: 20px;
                }
                .message {
                  font-size: 18px;
                  opacity: 0.9;
                }
              </style>
            </head>
            <body>
              <div class="success">✅</div>
              <h1>Authentication Successful!</h1>
              <p class="message">You can close this window and return to your terminal.</p>
              <script>
                setTimeout(() => {
                  window.close();
                }, 2000);
              </script>
            </body>
          </html>
        `);

        resolve(this.authorizationCode);
      });

      // Start server
      this.server = app.listen(this.port, () => {
        console.log(`Callback server listening on port ${this.port}`);
      });

      // Set timeout for authentication (5 minutes)
      setTimeout(() => {
        if (!this.authorizationCode) {
          this.cleanup();
          reject(new Error('Authentication timeout - no response received within 5 minutes'));
        }
      }, 5 * 60 * 1000);
    });
  }

  public async authenticate(): Promise<TokenResponse> {
    try {
      // Start callback server
      const redirectUri = `http://localhost:${await this.findAvailablePort()}/callback`;
      this.config.redirectUri = redirectUri;

      const authCodePromise = this.startCallbackServer();

      // Build authorization URL
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: this.config.scope,
        state: this.state!,
        access_type: 'offline', // Request refresh token
        prompt: 'consent' // Force consent to get refresh token
      });

      // Add PKCE parameters if available
      if (this.codeChallenge && this.codeVerifier) {
        params.append('code_challenge', this.codeChallenge);
        params.append('code_challenge_method', 'S256');
      }

      const authUrl = `${this.config.authorizationUrl}?${params.toString()}`;

      console.log('\n🌐 Opening browser for authentication...');
      console.log(`If the browser doesn't open automatically, visit:\n${authUrl}\n`);

      // Open browser
      await open(authUrl);

      console.log('⏳ Waiting for authentication...\n');

      // Wait for authorization code
      const authCode = await authCodePromise;

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(authCode);

      // Cleanup
      this.cleanup();

      return tokens;

    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri!
    });

    // Add client secret if available
    if (this.config.clientSecret) {
      params.append('client_secret', this.config.clientSecret);
    }

    // Add PKCE verifier if available
    if (this.codeVerifier) {
      params.append('code_verifier', this.codeVerifier);
    }

    const providerConfig = OAUTH_PROVIDERS[this.config.provider];
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...providerConfig.customHeaders
    };

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await response.json() as TokenResponse;
    return tokens;
  }

  public async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId
    });

    if (this.config.clientSecret) {
      params.append('client_secret', this.config.clientSecret);
    }

    const providerConfig = OAUTH_PROVIDERS[this.config.provider];
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...providerConfig.customHeaders
    };

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens = await response.json() as TokenResponse;
    return tokens;
  }

  private cleanup(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
    this.authorizationCode = undefined;
    this.codeVerifier = undefined;
    this.codeChallenge = undefined;
    this.state = undefined;
  }
}

// Helper function to validate token expiry
export function isTokenExpired(expiresAt: number): boolean {
  // Add 5 minute buffer to refresh before actual expiry
  return Date.now() >= (expiresAt - 5 * 60 * 1000);
}