import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Additional options
  debug: process.env.NODE_ENV === 'development',

  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],

  // Filtering
  beforeSend(event, hint) {
    // Filter out sensitive data
    if (event.request?.cookies) {
      event.request.cookies = { filtered: '[Filtered]' };
    }

    // Don't send events in development unless explicitly enabled
    if (process.env.NODE_ENV === 'development' && !process.env.ENABLE_SENTRY_DEV) {
      return null;
    }

    // Filter out known non-errors
    const error = hint.originalException;
    if (error && typeof error === 'object' && 'name' in error) {
      // Ignore network errors that are expected
      if (error.name === 'AbortError') return null;

      // Ignore rate limit errors (they're handled)
      if (error.name === 'RateLimitError') return null;
    }

    return event;
  },

  // Ignore specific errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    'Network request failed',
    'Load failed',
  ],
});