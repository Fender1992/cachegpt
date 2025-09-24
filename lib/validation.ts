import { z } from 'zod';

// Common validation schemas
export const emailSchema = z.string().email().max(255);
export const uuidSchema = z.string().uuid();
export const apiKeySchema = z.string().min(20).max(500);

// Request validation schemas
export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().max(100000)
  })).min(1).max(100),
  model: z.string().max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(100000).optional(),
  stream: z.boolean().optional(),
  provider: z.enum(['openai', 'anthropic', 'google', 'perplexity']).optional()
});

export const authRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(255)
});

export const providerCredentialSchema = z.object({
  provider: z.enum(['chatgpt', 'claude', 'gemini', 'perplexity']),
  api_key: apiKeySchema,
  key_name: z.string().max(255).optional()
});

export const usageQuerySchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0)
});

// Sanitization helpers
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove any potential SQL injection attempts
    return input.replace(/[;'"\\\x00\x1a]/g, '');
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

// Validation middleware helper
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return async (data: unknown): Promise<T> => {
    try {
      return await schema.parseAsync(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  };
}

// Rate limit key sanitizer
export function sanitizeRateLimitKey(key: string): string {
  // Only allow alphanumeric, dots, dashes, and underscores
  return key.replace(/[^a-zA-Z0-9._-]/g, '');
}