import { chromium, Browser, Page, BrowserContext } from 'playwright';
import chalk from 'chalk';
import ora from 'ora';

export class BrowserAuth {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async loginToProvider(provider: 'chatgpt' | 'claude'): Promise<string> {
    const spinner = ora('Opening browser...').start();

    try {
      // Launch browser in non-headless mode so user can log in
      this.browser = await chromium.launch({
        headless: false,
        channel: 'chrome' // Use Chrome if available
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 }
      });

      this.page = await this.context.newPage();

      const loginUrl = provider === 'chatgpt'
        ? 'https://chat.openai.com/auth/login'
        : 'https://claude.ai/login';

      spinner.text = `Navigating to ${provider === 'chatgpt' ? 'ChatGPT' : 'Claude'}...`;
      await this.page.goto(loginUrl);

      spinner.succeed(`Browser opened to ${provider === 'chatgpt' ? 'ChatGPT' : 'Claude'}`);

      console.log(chalk.cyan('\n📝 Please log in to your account in the browser window.'));
      console.log(chalk.gray('The CLI will automatically capture your session after login.\n'));

      // Wait for successful login by checking for specific elements
      let sessionToken = '';

      if (provider === 'chatgpt') {
        sessionToken = await this.waitForChatGPTLogin();
      } else {
        sessionToken = await this.waitForClaudeLogin();
      }

      console.log(chalk.green('\n✅ Successfully captured session token!'));

      // Close browser
      await this.cleanup();

      return sessionToken;

    } catch (error) {
      spinner.fail('Failed to capture session');
      await this.cleanup();
      throw error;
    }
  }

  private async waitForChatGPTLogin(): Promise<string> {
    const spinner = ora('Waiting for login...').start();

    try {
      // Wait for the main chat interface to appear (indicates successful login)
      await this.page!.waitForSelector('main', { timeout: 300000 }); // 5 minute timeout

      spinner.text = 'Capturing session token...';

      // Get all cookies
      const cookies = await this.context!.cookies();

      // Find the session token cookie
      const sessionCookie = cookies.find(c =>
        c.name === '__Secure-next-auth.session-token' ||
        c.name === 'sessionKey' ||
        c.name.includes('session')
      );

      if (!sessionCookie) {
        // Try to get from localStorage
        const token = await this.page!.evaluate(() => {
          return localStorage.getItem('session-token') ||
                 localStorage.getItem('access-token') ||
                 sessionStorage.getItem('session-token');
        });

        if (token) {
          spinner.succeed('Session captured!');
          return token;
        }

        throw new Error('Could not find session token');
      }

      spinner.succeed('Session captured!');
      return sessionCookie.value;

    } catch (error) {
      spinner.fail('Failed to capture ChatGPT session');
      throw error;
    }
  }

  private async waitForClaudeLogin(): Promise<string> {
    const spinner = ora('Waiting for login...').start();

    try {
      // Wait for Claude's main interface
      await this.page!.waitForSelector('[data-testid="composer-input"]', { timeout: 300000 });

      spinner.text = 'Capturing session token...';

      // Get all cookies
      const cookies = await this.context!.cookies();

      // Find the session cookie
      const sessionCookie = cookies.find(c =>
        c.name === 'sessionKey' ||
        c.name === 'claude_session' ||
        c.name.includes('session')
      );

      if (!sessionCookie) {
        // Try to get from localStorage/sessionStorage
        const token = await this.page!.evaluate(() => {
          return localStorage.getItem('sessionKey') ||
                 localStorage.getItem('claude_session') ||
                 sessionStorage.getItem('sessionKey');
        });

        if (token) {
          spinner.succeed('Session captured!');
          return token;
        }

        throw new Error('Could not find Claude session token');
      }

      spinner.succeed('Session captured!');
      return sessionCookie.value;

    } catch (error) {
      spinner.fail('Failed to capture Claude session');
      throw error;
    }
  }

  private async cleanup() {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }
}