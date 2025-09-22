import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Load default environment variables if not already set
function loadDefaults() {
  const defaultsPath = path.join(__dirname, '../../.env.defaults');
  if (fs.existsSync(defaultsPath) && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    const envContent = fs.readFileSync(defaultsPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value && !process.env[key.trim()]) {
        process.env[key.trim()] = value.trim().replace(/["']/g, '');
      }
    });
  }
}

loadDefaults();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface StoredCredentials {
  email: string;
  access_token: string;
  refresh_token: string;
  user_id: string;
  expires_at: number;
}

export class AuthService {
  private supabase: SupabaseClient;
  private credentialsPath: string;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || SUPABASE_URL;
    const key = supabaseKey || SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Supabase configuration missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    this.supabase = createClient(url, key);

    // Store credentials in user's home directory
    const configDir = path.join(os.homedir(), '.cachegpt');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    this.credentialsPath = path.join(configDir, 'credentials.json');
  }

  async register(email: string, password: string): Promise<User> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }

    if (!data.user) {
      throw new Error('Registration failed: No user returned');
    }

    // Save credentials if we have a session
    if (data.session) {
      await this.saveCredentials({
        email,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
        expires_at: data.session.expires_at || Date.now() / 1000 + 3600,
      });
    }

    return data.user;
  }

  async login(email: string, password: string): Promise<User> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(`Login failed: ${error.message}`);
    }

    if (!data.user || !data.session) {
      throw new Error('Login failed: Invalid response');
    }

    // Save credentials
    await this.saveCredentials({
      email,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id: data.user.id,
      expires_at: data.session.expires_at || Date.now() / 1000 + 3600,
    });

    return data.user;
  }

  async logout(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();

    if (error) {
      throw new Error(`Logout failed: ${error.message}`);
    }

    // Remove stored credentials
    if (fs.existsSync(this.credentialsPath)) {
      fs.unlinkSync(this.credentialsPath);
    }
  }

  async getCurrentUser(): Promise<User | null> {
    // Try to load and use stored credentials
    const credentials = await this.loadCredentials();

    if (credentials) {
      // Check if token is expired
      if (credentials.expires_at * 1000 < Date.now()) {
        // Try to refresh the token
        const { data, error } = await this.supabase.auth.refreshSession({
          refresh_token: credentials.refresh_token,
        });

        if (!error && data.session) {
          // Update stored credentials with new tokens
          await this.saveCredentials({
            ...credentials,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at || Date.now() / 1000 + 3600,
          });

          return data.user;
        }
      } else {
        // Token is still valid, use it
        const { data: { user } } = await this.supabase.auth.getUser(credentials.access_token);
        return user;
      }
    }

    // No valid credentials found
    return null;
  }

  async getAccessToken(): Promise<string | null> {
    const credentials = await this.loadCredentials();

    if (!credentials) {
      return null;
    }

    // Check if token is expired
    if (credentials.expires_at * 1000 < Date.now()) {
      // Try to refresh the token
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: credentials.refresh_token,
      });

      if (!error && data.session) {
        // Update stored credentials with new tokens
        await this.saveCredentials({
          ...credentials,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at || Date.now() / 1000 + 3600,
        });

        return data.session.access_token;
      }

      return null;
    }

    return credentials.access_token;
  }

  private async saveCredentials(credentials: StoredCredentials): Promise<void> {
    // Encrypt sensitive data before saving
    const encrypted = this.encrypt(JSON.stringify(credentials));

    fs.writeFileSync(
      this.credentialsPath,
      JSON.stringify({ data: encrypted }),
      { mode: 0o600 } // Read/write for owner only
    );
  }

  private async loadCredentials(): Promise<StoredCredentials | null> {
    if (!fs.existsSync(this.credentialsPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.credentialsPath, 'utf-8');
      const { data } = JSON.parse(content);
      const decrypted = this.decrypt(data);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to load credentials:', error);
      return null;
    }
  }

  private encrypt(text: string): string {
    // Use machine-specific key for encryption
    const key = crypto
      .createHash('sha256')
      .update(os.hostname() + os.homedir())
      .digest();

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const [ivHex, encrypted] = text.split(':');

    const key = crypto
      .createHash('sha256')
      .update(os.hostname() + os.homedir())
      .digest();

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async setSessionToken(token: string): Promise<void> {
    // Store the session token as credentials
    // This allows users to authenticate via web OAuth then use the CLI
    const credentials: StoredCredentials = {
      email: '', // Will be filled when we get user info
      access_token: token,
      refresh_token: token, // Use same token for now
      user_id: '', // Will be filled when we get user info
      expires_at: Math.floor(Date.now() / 1000) + 86400 // 24 hours
    };

    // Try to use the token to get user info
    const { data, error } = await this.supabase.auth.getUser(token);
    if (!error && data.user) {
      credentials.email = data.user.email || '';
      credentials.user_id = data.user.id;
    }

    // Save credentials
    await this.saveCredentials(credentials);
  }
}