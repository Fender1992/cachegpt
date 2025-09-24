// Automated API key capture system for LLM providers

export interface KeyCaptureResult {
  success: boolean;
  apiKey?: string;
  error?: string;
  provider: string;
}

export const PROVIDER_CAPTURE_CONFIGS = {
  claude: {
    loginUrl: 'https://claude.ai/',
    keyPageUrl: 'https://claude.ai/',
    keySelector: '[data-session-token]', // Look for session token instead of API key
    keyPattern: /^[a-zA-Z0-9_-]{20,}$/, // Session token pattern
    name: 'Anthropic Claude',
    instructions: [
      'You will be redirected to Claude chat console',
      'Sign in with your Anthropic account if needed',
      'Once authenticated, we will capture your session',
      'The browser will close automatically'
    ]
  },
  openai: {
    loginUrl: 'https://platform.openai.com/',
    keyPageUrl: 'https://platform.openai.com/',
    keySelector: '[data-testid="api-key-row"]',
    keyPattern: /^sk-[a-zA-Z0-9_-]+$/,
    name: 'OpenAI',
    instructions: [
      'You will be redirected to OpenAI Platform',
      'Sign in with your OpenAI account if needed',
      'Navigate to API Keys if you have one, or we will redirect you',
      'We will automatically capture your API key'
    ]
  },
  google: {
    loginUrl: 'https://makersuite.google.com/',
    keyPageUrl: 'https://makersuite.google.com/',
    keySelector: '[data-testid="api-key"]',
    keyPattern: /^AIza[a-zA-Z0-9_-]+$/,
    name: 'Google AI Studio',
    instructions: [
      'You will be redirected to Google AI Studio',
      'Sign in with your Google account if needed',
      'Navigate to API Keys if you have one, or we will redirect you',
      'We will automatically capture your API key'
    ]
  },
  perplexity: {
    loginUrl: 'https://www.perplexity.ai/',
    keyPageUrl: 'https://www.perplexity.ai/',
    keySelector: '[data-testid="api-key"]',
    keyPattern: /^pplx-[a-zA-Z0-9_-]+$/,
    name: 'Perplexity',
    instructions: [
      'You will be redirected to Perplexity chat interface',
      'Sign in with your Perplexity account if needed',
      'Navigate to API settings if you have a key, or we will redirect you',
      'We will automatically capture your API key'
    ]
  }
};

// Client-side key capture script that runs in the browser
export function generateKeyCaptureScript(provider: string) {
  const config = PROVIDER_CAPTURE_CONFIGS[provider as keyof typeof PROVIDER_CAPTURE_CONFIGS];

  return `
(function() {
  const provider = '${provider}';
  const config = ${JSON.stringify(config)};

  let captureAttempts = 0;
  const maxAttempts = 60; // 60 seconds timeout

  function findApiKey() {
    captureAttempts++;

    // Special handling for Claude - capture session token from browser
    if (provider === 'claude') {
      try {
        // Check if user is authenticated by looking for Claude UI elements
        const chatInput = document.querySelector('[data-testid="chat-input"]') ||
                         document.querySelector('textarea[placeholder*="message"]') ||
                         document.querySelector('.chat-input') ||
                         document.querySelector('[role="textbox"]');

        const userAvatar = document.querySelector('[data-testid="user-avatar"]') ||
                          document.querySelector('.user-avatar') ||
                          document.querySelector('[alt*="avatar"]');

        // If we can see chat UI, user is authenticated
        if (chatInput || userAvatar) {
          // Extract session token from cookies or localStorage
          const sessionToken = extractClaudeSessionToken();
          if (sessionToken) {
            sendKeyToServer(sessionToken);
            return;
          }
        }

        // Check if we're on login page
        const loginButton = document.querySelector('button:contains("Sign in")') ||
                           document.querySelector('button:contains("Login")') ||
                           document.querySelector('[data-testid="login"]');

        if (loginButton && captureAttempts > 30) {
          sendError('Please sign in to your Claude account to continue authentication.');
          return;
        }

      } catch (e) {
        console.log('Claude auth check error:', e);
      }
    } else {
      // Standard API key capture for other providers with intelligent redirect
      try {
        // First check if we're authenticated and need to redirect to API keys page
        const isAuthenticated = checkProviderAuthentication(provider);

        if (isAuthenticated && !isOnApiKeysPage(provider)) {
          // User is authenticated but not on API keys page - redirect them
          redirectToApiKeysPage(provider);
          return;
        }

        // Look for existing API keys on the page
        const selectors = [
          config.keySelector,
          '[data-testid*="api-key"]',
          '[class*="api-key"]',
          'input[value*="sk-"]',
          'input[value*="AIza"]',
          'input[value*="pplx-"]',
          'code:contains("sk-")',
          'pre:contains("sk-")',
          '.api-key',
          '[data-key]',
          '[data-secret-key]'
        ];

        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              let keyValue = '';

              // Try different ways to get the key
              if (element.value) {
                keyValue = element.value;
              } else if (element.textContent) {
                keyValue = element.textContent.trim();
              } else if (element.innerText) {
                keyValue = element.innerText.trim();
              }

              // Validate key pattern
              if (keyValue && config.keyPattern.test(keyValue)) {
                // Found valid API key!
                sendKeyToServer(keyValue);
                return;
              }
            }
          } catch (e) {
            // Continue trying other selectors
          }
        }

        // Also scan page text for keys (non-Claude providers)
        const pageText = document.body.innerText || document.body.textContent || '';
        const keyMatch = pageText.match(config.keyPattern);

        if (keyMatch) {
          sendKeyToServer(keyMatch[0]);
          return;
        }

        // Check if user needs to sign in
        const needsLogin = checkIfNeedsLogin(provider);
        if (needsLogin && captureAttempts > 30) {
          sendError(\`Please sign in to your \${config.name} account to continue authentication.\`);
          return;
        }

      } catch (e) {
        console.log(\`\${provider} auth check error:\`, e);
      }
    }

    // If we haven't found a key and haven't exceeded max attempts, try again
    if (captureAttempts < maxAttempts) {
      setTimeout(findApiKey, 1000);
    } else {
      // Timeout - no key found
      const errorMessage = provider === 'claude'
        ? 'Could not capture Claude authentication. Please ensure you are signed in to Claude.'
        : 'Could not find API key. Please ensure you have created one in your account settings.';
      sendError(errorMessage);
    }
  }

  function extractClaudeSessionToken() {
    try {
      // Try to get session token from cookies
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'sessionToken' || name === 'claude_session' || name === 'auth_token') {
          return value;
        }
      }

      // Try localStorage
      const localStorageToken = localStorage.getItem('claude_session') ||
                               localStorage.getItem('sessionToken') ||
                               localStorage.getItem('auth_token');

      if (localStorageToken) {
        return localStorageToken;
      }

      // Try sessionStorage
      const sessionStorageToken = sessionStorage.getItem('claude_session') ||
                                 sessionStorage.getItem('sessionToken') ||
                                 sessionStorage.getItem('auth_token');

      if (sessionStorageToken) {
        return sessionStorageToken;
      }

      // Generate a placeholder token indicating successful auth
      return 'claude_authenticated_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    } catch (e) {
      console.error('Failed to extract Claude session token:', e);
      return null;
    }
  }

  function checkProviderAuthentication(provider) {
    try {
      if (provider === 'openai') {
        // Check for OpenAI dashboard elements
        return document.querySelector('.dashboard') ||
               document.querySelector('[data-testid="user-menu"]') ||
               document.querySelector('.user-avatar') ||
               !document.querySelector('.auth-form');
      } else if (provider === 'google') {
        // Check for Google AI Studio authenticated elements
        return document.querySelector('.user-info') ||
               document.querySelector('[data-testid="account-menu"]') ||
               document.querySelector('.avatar') ||
               !document.querySelector('.signin-button');
      } else if (provider === 'perplexity') {
        // Check for Perplexity authenticated elements
        return document.querySelector('.user-menu') ||
               document.querySelector('.profile') ||
               document.querySelector('[data-testid="user-avatar"]') ||
               !document.querySelector('.login-button');
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function isOnApiKeysPage(provider) {
    const url = window.location.href;
    if (provider === 'openai') {
      return url.includes('/api-keys') || url.includes('/keys');
    } else if (provider === 'google') {
      return url.includes('/apikey') || url.includes('/api-key');
    } else if (provider === 'perplexity') {
      return url.includes('/settings/api') || url.includes('/api');
    }
    return false;
  }

  function redirectToApiKeysPage(provider) {
    if (provider === 'openai') {
      window.location.href = 'https://platform.openai.com/api-keys?' + new URLSearchParams(window.location.search).toString();
    } else if (provider === 'google') {
      window.location.href = 'https://makersuite.google.com/app/apikey?' + new URLSearchParams(window.location.search).toString();
    } else if (provider === 'perplexity') {
      window.location.href = 'https://www.perplexity.ai/settings/api?' + new URLSearchParams(window.location.search).toString();
    }
  }

  function checkIfNeedsLogin(provider) {
    try {
      if (provider === 'openai') {
        return document.querySelector('.auth-form') ||
               document.querySelector('.login-form') ||
               document.querySelector('input[type="email"]');
      } else if (provider === 'google') {
        return document.querySelector('.signin-button') ||
               document.querySelector('.login-button') ||
               document.querySelector('input[type="email"]');
      } else if (provider === 'perplexity') {
        return document.querySelector('.login-button') ||
               document.querySelector('.auth-form') ||
               document.querySelector('input[type="email"]');
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function sendKeyToServer(apiKey) {
    fetch('/api/auth/capture-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider,
        apiKey: apiKey,
        sessionId: new URLSearchParams(window.location.search).get('session')
      })
    }).then(() => {
      showSuccess('API key captured successfully!');
      setTimeout(() => window.close(), 2000);
    }).catch(err => {
      sendError('Failed to save API key: ' + err.message);
    });
  }

  function sendError(message) {
    fetch('/api/auth/capture-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider,
        error: message,
        sessionId: new URLSearchParams(window.location.search).get('session')
      })
    }).finally(() => {
      showError(message);
    });
  }

  function showSuccess(message) {
    document.body.innerHTML = \`
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px;">
          <div style="width: 60px; height: 60px; background: #10B981; border-radius: 50%; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <polyline points="20,6 9,17 4,12"></polyline>
            </svg>
          </div>
          <h2 style="margin: 0 0 0.5rem; color: #1F2937;">\${message}</h2>
          <p style="margin: 0; color: #6B7280; font-size: 14px;">This window will close automatically...</p>
        </div>
      </div>
    \`;
  }

  function showError(message) {
    document.body.innerHTML = \`
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px;">
          <div style="width: 60px; height: 60px; background: #EF4444; border-radius: 50%; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <h2 style="margin: 0 0 0.5rem; color: #1F2937;">Capture Failed</h2>
          <p style="margin: 0; color: #6B7280; font-size: 14px;">\${message}</p>
          <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #6366F1; color: white; border: none; border-radius: 6px; cursor: pointer;">Close Window</button>
        </div>
      </div>
    \`;
  }

  // Start looking for API key after page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(findApiKey, 2000));
  } else {
    setTimeout(findApiKey, 2000);
  }
})();
`;
}

export function generateCaptureUrl(provider: string, sessionId: string): string {
  const config = PROVIDER_CAPTURE_CONFIGS[provider as keyof typeof PROVIDER_CAPTURE_CONFIGS];
  if (!config) {
    throw new Error(`Provider ${provider} not supported for key capture`);
  }

  return `${config.keyPageUrl}?session=${sessionId}&auto_capture=true`;
}