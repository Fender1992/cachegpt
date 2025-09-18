import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Additional options
  debug: process.env.NODE_ENV === 'development',

  // Filtering
  beforeSend(event, hint) {
    // Filter out sensitive data from API keys
    if (event.extra) {
      Object.keys(event.extra).forEach(key => {
        if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) {
          event.extra![key] = '[Filtered]';
        }
      });
    }

    // Filter request headers
    if (event.request?.headers) {
      if (event.request.headers['authorization']) {
        event.request.headers['authorization'] = '[Filtered]';
      }
      if (event.request.headers['x-api-key']) {
        event.request.headers['x-api-key'] = '[Filtered]';
      }
    }

    // Don't send events in development unless explicitly enabled
    if (process.env.NODE_ENV === 'development' && !process.env.ENABLE_SENTRY_DEV) {
      return null;
    }

    return event;
  },

  // Ignore specific errors
  ignoreErrors: [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'RateLimitError',
  ],

  // Integrations
  integrations: [
    // Capture console errors
    Sentry.captureConsoleIntegration({
      levels: ['error', 'warn'],
    }),

    // Add context
    Sentry.contextLinesIntegration({
      frameContextLines: 5,
    }),
  ],
});