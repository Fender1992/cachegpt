import { StorageAdapter } from './StorageAdapter';
import { TokenSet } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const IV_LENGTH = 16;
const ITERATIONS = 100000;

export class EncryptedFileAdapter extends StorageAdapter {
  private filePath: string;
  private keyDerivationSalt?: Buffer;

  constructor(filePath?: string) {
    super();
    this.filePath = filePath || this.getDefaultPath();
  }

  private getDefaultPath(): string {
    const homeDir = os.homedir();
    const configDir = process.platform === 'win32'
      ? path.join(process.env.USERPROFILE || homeDir, '.cachegpt')
      : path.join(homeDir, '.cachegpt');

    return path.join(configDir, 'tokens.json.enc');
  }

  async initialize(): Promise<void> {
    const dir = path.dirname(this.filePath);
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch {
      // Directory might already exist
    }

    // Load or generate key derivation salt
    const saltFile = path.join(path.dirname(this.filePath), '.salt');
    try {
      this.keyDerivationSalt = await fs.readFile(saltFile);
    } catch {
      // Generate new salt
      this.keyDerivationSalt = crypto.randomBytes(SALT_LENGTH);
      await fs.writeFile(saltFile, this.keyDerivationSalt, { mode: 0o600 });
    }
  }

  async isAvailable(): Promise<boolean> {
    return true; // File storage is always available as fallback
  }

  private deriveKey(): Buffer {
    if (!this.keyDerivationSalt) {
      throw new Error('Storage not initialized');
    }

    // Derive key from machine-specific data
    const machineId = `${os.hostname()}:${os.homedir()}:${os.platform()}:${os.arch()}`;
    return crypto.pbkdf2Sync(machineId, this.keyDerivationSalt, ITERATIONS, 32, 'sha256');
  }

  async saveTokens(tokens: TokenSet): Promise<void> {
    const key = this.deriveKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const data = JSON.stringify(tokens);
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    // Combine IV, tag, and encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);

    await fs.writeFile(this.filePath, combined, { mode: 0o600 });

    // Verify permissions on Unix systems
    if (process.platform !== 'win32') {
      const stats = await fs.stat(this.filePath);
      if ((stats.mode & 0o077) !== 0) {
        await fs.chmod(this.filePath, 0o600);
      }
    }
  }

  async getTokens(): Promise<TokenSet | null> {
    try {
      const combined = await fs.readFile(this.filePath);

      if (combined.length < IV_LENGTH + TAG_LENGTH) {
        throw new Error('Invalid encrypted file format');
      }

      const iv = combined.subarray(0, IV_LENGTH);
      const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);

      const key = this.deriveKey();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      return JSON.parse(decrypted.toString('utf8'));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  async clearTokens(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  getBackendName(): string {
    return 'Encrypted File Storage';
  }
}