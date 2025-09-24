import { StorageAdapter } from './StorageAdapter';
import { TokenSet } from '../types';

export class CredentialManagerAdapter extends StorageAdapter {
  private keytar: any;
  private service = 'CacheGPT';
  private account = 'default';

  async initialize(): Promise<void> {
    try {
      this.keytar = await import('keytar');
    } catch (error) {
      throw new Error('Keytar not available. Please install keytar package.');
    }
  }

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'win32') return false;

    try {
      await this.initialize();
      // Test credential manager access
      await this.keytar.getPassword(this.service, 'test');
      return true;
    } catch {
      return false;
    }
  }

  async saveTokens(tokens: TokenSet): Promise<void> {
    if (!this.keytar) await this.initialize();

    const data = JSON.stringify(tokens);
    await this.keytar.setPassword(this.service, this.account, data);
  }

  async getTokens(): Promise<TokenSet | null> {
    if (!this.keytar) await this.initialize();

    const data = await this.keytar.getPassword(this.service, this.account);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async clearTokens(): Promise<void> {
    if (!this.keytar) await this.initialize();
    await this.keytar.deletePassword(this.service, this.account);
  }

  getBackendName(): string {
    return 'Windows Credential Manager';
  }
}