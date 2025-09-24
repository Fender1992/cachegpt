/**
 * Centralized logging utility for CacheGPT
 * Provides consistent logging with proper log levels and no sensitive data exposure
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export interface LogContext {
  [key: string]: any;
}

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;
  private sensitivePatterns: RegExp[];

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;

    // Patterns for sensitive data that should never be logged
    this.sensitivePatterns = [
      /api[_-]?key/gi,
      /password/gi,
      /secret/gi,
      /token/gi,
      /bearer\s+[\w-]+/gi,
      /sk-[\w-]+/gi, // OpenAI keys
      /claude-[\w-]+/gi, // Claude keys
      /AIza[\w-]+/gi, // Google keys
    ];
  }

  private sanitize(message: string, context?: LogContext): { message: string; context?: LogContext } {
    // Sanitize message
    let sanitizedMessage = message;
    for (const pattern of this.sensitivePatterns) {
      sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
    }

    // Sanitize context
    let sanitizedContext = context;
    if (context) {
      sanitizedContext = JSON.parse(JSON.stringify(context));
      this.sanitizeObject(sanitizedContext);
    }

    return { message: sanitizedMessage, context: sanitizedContext };
  }

  private sanitizeObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      if (typeof key === 'string') {
        // Check if key name suggests sensitive data
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('password') ||
            lowerKey.includes('token') ||
            lowerKey.includes('secret') ||
            lowerKey.includes('key') ||
            lowerKey.includes('authorization')) {
          obj[key] = '[REDACTED]';
          continue;
        }
      }

      if (typeof obj[key] === 'string') {
        // Check if value matches sensitive patterns
        for (const pattern of this.sensitivePatterns) {
          if (pattern.test(obj[key])) {
            obj[key] = '[REDACTED]';
            break;
          }
        }
      } else if (typeof obj[key] === 'object') {
        this.sanitizeObject(obj[key]);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level && this.level !== LogLevel.NONE;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    if (!this.isDevelopment) return; // Never log debug in production

    const { message: sanitizedMessage, context: sanitizedContext } = this.sanitize(message, context);
    if (this.isDevelopment) {
      console.debug(this.formatMessage('DEBUG', sanitizedMessage, sanitizedContext));
    }
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const { message: sanitizedMessage, context: sanitizedContext } = this.sanitize(message, context);
    if (this.isDevelopment) {
      console.info(this.formatMessage('INFO', sanitizedMessage, sanitizedContext));
    }
    // In production, could send to logging service
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const { message: sanitizedMessage, context: sanitizedContext } = this.sanitize(message, context);
    console.warn(this.formatMessage('WARN', sanitizedMessage, sanitizedContext));
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const errorContext = {
      ...context,
      error: error?.message || error,
      stack: this.isDevelopment ? error?.stack : undefined
    };

    const { message: sanitizedMessage, context: sanitizedContext } = this.sanitize(message, errorContext);
    console.error(this.formatMessage('ERROR', sanitizedMessage, sanitizedContext));
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const debug = (message: string, context?: LogContext) => logger.debug(message, context);
export const info = (message: string, context?: LogContext) => logger.info(message, context);
export const warn = (message: string, context?: LogContext) => logger.warn(message, context);
export const error = (message: string, error?: Error | any, context?: LogContext) => logger.error(message, error, context);