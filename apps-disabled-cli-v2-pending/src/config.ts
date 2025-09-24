import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CLIConfig {
  issuerUrl: string;
  clientId: string;
  apiUrl: string;
  scopes: string[];
}

const DEFAULT_CONFIG: CLIConfig = {
  issuerUrl: process.env.CACHEGPT_ISSUER_URL || 'https://cachegpt.app',
  clientId: process.env.CACHEGPT_CLIENT_ID || 'cachegpt-cli',
  apiUrl: process.env.CACHEGPT_API_URL || 'https://cachegpt.app/api',
  scopes: ['openid', 'profile', 'email', 'offline_access']
};

export function loadConfig(): CLIConfig {
  const config = { ...DEFAULT_CONFIG };

  // Try to load from config file
  const configPaths = [
    path.join(os.homedir(), '.cachegpt', 'config.json'),
    path.join(process.cwd(), '.cachegpt.json')
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        Object.assign(config, fileConfig);
        break;
      }
    } catch (error) {
      // Ignore and continue
    }
  }

  // Environment variables override file config
  if (process.env.CACHEGPT_ISSUER_URL) {
    config.issuerUrl = process.env.CACHEGPT_ISSUER_URL;
  }
  if (process.env.CACHEGPT_CLIENT_ID) {
    config.clientId = process.env.CACHEGPT_CLIENT_ID;
  }
  if (process.env.CACHEGPT_API_URL) {
    config.apiUrl = process.env.CACHEGPT_API_URL;
  }

  return config;
}

export async function getIssuerMetadata(config: CLIConfig): Promise<any> {
  // First try the API endpoint
  try {
    const { request } = await import('undici');
    const { body } = await request(`${config.apiUrl}/auth/issuer`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return await body.json();
  } catch {
    // Fallback to constructing from Supabase URL
    const supabaseUrl = config.issuerUrl;
    const authUrl = supabaseUrl.replace('https://', 'https://').replace('.supabase.co', '.supabase.co/auth/v1');

    return {
      issuer: supabaseUrl,
      authorization_endpoint: `${authUrl}/authorize`,
      token_endpoint: `${authUrl}/token`,
      userinfo_endpoint: `${config.apiUrl}/me`,
      jwks_uri: `${authUrl}/jwks`,
      revocation_endpoint: `${authUrl}/logout`,
      device_authorization_endpoint: null // Supabase doesn't support device flow
    };
  }
}