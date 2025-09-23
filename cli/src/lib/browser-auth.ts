import chalk from 'chalk';

export class BrowserAuth {
  async loginToProvider(provider: 'chatgpt' | 'claude'): Promise<string> {
    throw new Error(`Browser automation is no longer used for ${provider}. Please use the manual token method in the auth provider instead.`);
  }
}