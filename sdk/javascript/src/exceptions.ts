/**
 * Custom exception classes for CacheGPT SDK
 */

export class CacheGPTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CacheGPTError';
  }
}

export class APIError extends CacheGPTError {
  public status: number;
  public response?: any;

  constructor(message: string, status: number, response?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.response = response;
  }
}

export class NetworkError extends CacheGPTError {
  public cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export class ValidationError extends CacheGPTError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends APIError {
  public retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}