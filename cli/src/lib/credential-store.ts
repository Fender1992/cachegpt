import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

interface StoredCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  provider: string;
  userEmail?: string;
  userId?: string;
}

export class CredentialStore {
  private serviceName = 'cachegpt-cli';
  private platform: NodeJS.Platform;
  private fallbackFile: string;

  constructor() {
    this.platform = process.platform;
    this.fallbackFile = path.join(os.homedir(), '.cachegpt', '.credentials');
  }

  /**
   * Store credentials securely based on the operating system
   */
  public async store(account: string, credentials: StoredCredentials): Promise<void> {
    const data = JSON.stringify(credentials);

    try {
      switch (this.platform) {
        case 'darwin':
          await this.storeMacOS(account, data);
          break;
        case 'win32':
          await this.storeWindows(account, data);
          break;
        case 'linux':
          await this.storeLinux(account, data);
          break;
        default:
          await this.storeFallback(account, data);
      }
    } catch (error) {
      console.warn('Native credential storage failed, using encrypted file fallback');
      await this.storeFallback(account, data);
    }
  }

  /**
   * Retrieve credentials securely based on the operating system
   */
  public async retrieve(account: string): Promise<StoredCredentials | null> {
    try {
      let data: string | null = null;

      switch (this.platform) {
        case 'darwin':
          data = await this.retrieveMacOS(account);
          break;
        case 'win32':
          data = await this.retrieveWindows(account);
          break;
        case 'linux':
          data = await this.retrieveLinux(account);
          break;
        default:
          data = await this.retrieveFallback(account);
      }

      if (data) {
        return JSON.parse(data) as StoredCredentials;
      }
      return null;
    } catch (error) {
      // Try fallback if native storage fails
      try {
        const data = await this.retrieveFallback(account);
        if (data) {
          return JSON.parse(data) as StoredCredentials;
        }
      } catch {
        // Ignore fallback errors
      }
      return null;
    }
  }

  /**
   * Delete stored credentials
   */
  public async delete(account: string): Promise<void> {
    try {
      switch (this.platform) {
        case 'darwin':
          await this.deleteMacOS(account);
          break;
        case 'win32':
          await this.deleteWindows(account);
          break;
        case 'linux':
          await this.deleteLinux(account);
          break;
      }
    } catch {
      // Ignore errors during deletion
    }

    // Also try to delete fallback
    try {
      await this.deleteFallback(account);
    } catch {
      // Ignore fallback deletion errors
    }
  }

  /**
   * List all stored accounts
   */
  public async listAccounts(): Promise<string[]> {
    const accounts: string[] = [];

    try {
      switch (this.platform) {
        case 'darwin':
          accounts.push(...await this.listAccountsMacOS());
          break;
        case 'win32':
          accounts.push(...await this.listAccountsWindows());
          break;
        case 'linux':
          accounts.push(...await this.listAccountsLinux());
          break;
      }
    } catch {
      // If native listing fails, try fallback
    }

    // Also check fallback storage
    try {
      accounts.push(...await this.listAccountsFallback());
    } catch {
      // Ignore fallback errors
    }

    return [...new Set(accounts)]; // Remove duplicates
  }

  // macOS Implementation using Keychain
  private async storeMacOS(account: string, data: string): Promise<void> {
    const command = `security add-generic-password -a "${account}" -s "${this.serviceName}" -w "${Buffer.from(data).toString('base64')}" -U`;
    execSync(command, { stdio: 'ignore' });
  }

  private async retrieveMacOS(account: string): Promise<string | null> {
    try {
      const command = `security find-generic-password -a "${account}" -s "${this.serviceName}" -w`;
      const base64Data = execSync(command, { encoding: 'utf8' }).trim();
      return Buffer.from(base64Data, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  private async deleteMacOS(account: string): Promise<void> {
    const command = `security delete-generic-password -a "${account}" -s "${this.serviceName}"`;
    execSync(command, { stdio: 'ignore' });
  }

  private async listAccountsMacOS(): Promise<string[]> {
    try {
      const command = `security dump-keychain | grep -A 2 -B 2 "${this.serviceName}" | grep "acct" | cut -d '"' -f 4`;
      const output = execSync(command, { encoding: 'utf8' });
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  // Windows Implementation using Credential Manager
  private async storeWindows(account: string, data: string): Promise<void> {
    const target = `${this.serviceName}:${account}`;
    const command = `cmdkey /generic:"${target}" /user:"${account}" /pass:"${Buffer.from(data).toString('base64')}"`;
    execSync(command, { stdio: 'ignore', shell: 'cmd.exe' });
  }

  private async retrieveWindows(account: string): Promise<string | null> {
    try {
      // Use PowerShell to retrieve credentials
      const target = `${this.serviceName}:${account}`;
      const script = `
        $cred = Get-StoredCredential -Target "${target}" -AsCredentialObject
        if ($cred) {
          $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($cred.Password)
          $password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
          Write-Output $password
        }
      `;
      const output = execSync(`powershell -Command "${script}"`, { encoding: 'utf8' }).trim();
      if (output) {
        return Buffer.from(output, 'base64').toString('utf8');
      }
    } catch {
      // Fallback to using cmdkey (less reliable)
      try {
        const target = `${this.serviceName}:${account}`;
        const output = execSync(`cmdkey /list:${target}`, { encoding: 'utf8', shell: 'cmd.exe' });
        // cmdkey doesn't return the password directly, so this is limited
        if (output.includes(target)) {
          // Try to use fallback file in this case
          return await this.retrieveFallback(account);
        }
      } catch {
        // Ignore
      }
    }
    return null;
  }

  private async deleteWindows(account: string): Promise<void> {
    const target = `${this.serviceName}:${account}`;
    execSync(`cmdkey /delete:"${target}"`, { stdio: 'ignore', shell: 'cmd.exe' });
  }

  private async listAccountsWindows(): Promise<string[]> {
    try {
      const output = execSync('cmdkey /list', { encoding: 'utf8', shell: 'cmd.exe' });
      const regex = new RegExp(`${this.serviceName}:([^\\s]+)`, 'g');
      const matches = output.match(regex) || [];
      return matches.map(m => m.replace(`${this.serviceName}:`, ''));
    } catch {
      return [];
    }
  }

  // Linux Implementation using libsecret
  private async storeLinux(account: string, data: string): Promise<void> {
    try {
      // Try using secret-tool (part of libsecret)
      const command = `echo -n '${Buffer.from(data).toString('base64')}' | secret-tool store --label="${this.serviceName}" service "${this.serviceName}" account "${account}"`;
      execSync(command, { stdio: 'ignore', shell: '/bin/bash' });
    } catch {
      // If secret-tool is not available, try using gnome-keyring directly
      const command = `echo -n '${Buffer.from(data).toString('base64')}' | gnome-keyring-daemon --unlock`;
      execSync(command, { stdio: 'ignore', shell: '/bin/bash' });
    }
  }

  private async retrieveLinux(account: string): Promise<string | null> {
    try {
      const command = `secret-tool lookup service "${this.serviceName}" account "${account}"`;
      const base64Data = execSync(command, { encoding: 'utf8' }).trim();
      return Buffer.from(base64Data, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  private async deleteLinux(account: string): Promise<void> {
    const command = `secret-tool clear service "${this.serviceName}" account "${account}"`;
    execSync(command, { stdio: 'ignore' });
  }

  private async listAccountsLinux(): Promise<string[]> {
    try {
      const command = `secret-tool search service "${this.serviceName}" 2>/dev/null | grep "account" | cut -d '=' -f 2`;
      const output = execSync(command, { encoding: 'utf8', shell: '/bin/bash' });
      return output.split('\n').filter(Boolean).map(s => s.trim());
    } catch {
      return [];
    }
  }

  // Fallback Implementation using encrypted file
  private getEncryptionKey(): Buffer {
    const hostname = os.hostname();
    const userInfo = os.userInfo().username;
    return crypto.scryptSync(`${hostname}:${userInfo}:${this.serviceName}`, 'cachegpt-salt', 32);
  }

  private async storeFallback(account: string, data: string): Promise<void> {
    const dir = path.dirname(this.fallbackFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let credentials: Record<string, string> = {};
    if (fs.existsSync(this.fallbackFile)) {
      try {
        const encrypted = fs.readFileSync(this.fallbackFile, 'utf8');
        const decrypted = this.decrypt(encrypted);
        credentials = JSON.parse(decrypted);
      } catch {
        // Start fresh if decryption fails
        credentials = {};
      }
    }

    credentials[account] = data;
    const encrypted = this.encrypt(JSON.stringify(credentials));
    fs.writeFileSync(this.fallbackFile, encrypted, { mode: 0o600 });
  }

  private async retrieveFallback(account: string): Promise<string | null> {
    if (!fs.existsSync(this.fallbackFile)) {
      return null;
    }

    try {
      const encrypted = fs.readFileSync(this.fallbackFile, 'utf8');
      const decrypted = this.decrypt(encrypted);
      const credentials = JSON.parse(decrypted);
      return credentials[account] || null;
    } catch {
      return null;
    }
  }

  private async deleteFallback(account: string): Promise<void> {
    if (!fs.existsSync(this.fallbackFile)) {
      return;
    }

    try {
      const encrypted = fs.readFileSync(this.fallbackFile, 'utf8');
      const decrypted = this.decrypt(encrypted);
      const credentials = JSON.parse(decrypted);
      delete credentials[account];

      if (Object.keys(credentials).length === 0) {
        fs.unlinkSync(this.fallbackFile);
      } else {
        const newEncrypted = this.encrypt(JSON.stringify(credentials));
        fs.writeFileSync(this.fallbackFile, newEncrypted, { mode: 0o600 });
      }
    } catch {
      // Ignore errors
    }
  }

  private async listAccountsFallback(): Promise<string[]> {
    if (!fs.existsSync(this.fallbackFile)) {
      return [];
    }

    try {
      const encrypted = fs.readFileSync(this.fallbackFile, 'utf8');
      const decrypted = this.decrypt(encrypted);
      const credentials = JSON.parse(decrypted);
      return Object.keys(credentials);
    } catch {
      return [];
    }
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.getEncryptionKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return JSON.stringify({ iv: iv.toString('hex'), data: encrypted });
  }

  private decrypt(encryptedData: string): string {
    const { iv, data } = JSON.parse(encryptedData);
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.getEncryptionKey(), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}