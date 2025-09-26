/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to chat API logic, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * This endpoint is the CORE of the authentication system - changes here
 * affect both web and CLI users. After making changes:
 * - Update STATUS file with authentication flow changes
 * - Document any new provider integrations
 * - Note any cost/security implications
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  resolveAuthentication,
  isUnifiedSession,
  isAuthError,
  getUserId,
  logAuthMethodUsage,
  UnifiedSession,
  createSessionErrorMessage
} from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding, findSimilarCachedResponse, cacheResponse } from '@/lib/ranking-cache';

/**
 * Unified chat endpoint that handles both web sessions and API keys
 * This replaces the dual-paradigm approach with a single, consistent handler
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Parse request body once
    const body = await request.json();
    const { directSession, credential, authMethod, provider, message, model, messages } = body;

    console.log('[unified-chat] Request received:', {
      directSession,
      authMethod,
      provider,
      hasCredential: !!credential,
      credentialLength: credential?.length,
      messagesCount: messages?.length
    });

    let session: UnifiedSession;

    // Check if this is a direct session request (CLI with session key, no OAuth)
    if (directSession === true && authMethod === 'web-session' && credential) {
      // Create a pseudo-session for CLI users with session keys
      // This bypasses OAuth but still allows session-based auth
      session = {
        user: {
          id: 'cli-session-user',
          email: 'cli-user@cachegpt.app'
        },
        authMethod: 'bearer', // Treat as bearer for consistency
        token: credential, // The session key itself
        issuedAt: Date.now()
      };

      console.log('[unified-chat] Using direct session authentication for CLI user');
    } else {
      // Standard authentication flow - check for Bearer token or cookie
      const authHeader = request.headers.get('authorization');
      console.log('[unified-chat] Standard auth flow, has Bearer token:', !!authHeader);

      const authResult = await resolveAuthentication(request);

      if (isAuthError(authResult)) {
        console.log('[unified-chat] Auth failed. Debug info:', {
          directSession,
          authMethod,
          hasCredential: !!credential,
          hasBearerToken: !!authHeader
        });
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
      }

      session = authResult as UnifiedSession;
    }

    // Log auth method for debugging
    logAuthMethodUsage(session, '/api/v2/unified-chat');

    // Step 2: Validate provider
    const validProviders = ['chatgpt', 'claude', 'gemini', 'perplexity', 'auto'];
    if (provider && !validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Step 3: Handle authentication - use free providers for authenticated users
    // If user is authenticated via OAuth but has no API key, use free providers
    const useFreeTier = !credential && authMethod !== 'web-session';
    let apiCredential = credential;

    // Step 4: Check ranking-based cache for performance optimization
    const startTime = Date.now();
    let response = '';
    let cacheHit = false;
    let timeSavedMs = 0;
    let costSaved = 0;

    const userMessage = messages[messages.length - 1]?.content || message;
    if (userMessage) {
      console.log(`[CACHE] Checking for similar responses to: "${userMessage.substring(0, 100)}..."`);

      // For auto provider, check cache across all free providers
      const cacheProvider = provider === 'auto' ? 'mixed' : provider;
      const cachedMatch = await findSimilarCachedResponse(
        userMessage,
        model || 'free-model',
        cacheProvider,
        0.85 // 85% similarity threshold
      );

      if (cachedMatch) {
        response = cachedMatch.cached_response.response;
        cacheHit = true;
        timeSavedMs = cachedMatch.time_saved_ms;
        costSaved = cachedMatch.cost_saved;

        console.log(`[CACHE] HIT! Similarity: ${Math.round(cachedMatch.similarity * 100)}%, Time saved: ${timeSavedMs}ms, Cost saved: $${costSaved}`);
      }
    }

    // Step 5: If no cache hit, get response from appropriate provider
    if (!cacheHit) {
      try {
        if (useFreeTier) {
          // Use free provider rotation system for OAuth users without API keys
          const { callFreeProvider } = await import('@/lib/free-providers');
          const result = await callFreeProvider(getUserId(session), messages, provider);
          response = result.response;

          console.log(`[FREE] Response from ${result.provider}${result.cached ? ' (cached)' : ''}`);

        } else if (authMethod === 'web-session') {
          // Handle web session-based requests (deprecated - will show error)
          response = await retryWithBackoff(
            () => handleWebSession(provider, messages, credential),
            session,
            'web session call'
          );
        } else {
          // Handle user's own API key
          response = await retryWithBackoff(
            () => handleAPIKey(provider, messages, model, apiCredential),
            session,
            'API key call'
          );
        }

        // Cache the new response for future optimization (if not from free provider - they cache themselves)
        if (!useFreeTier) {
          const responseTime = Date.now() - startTime;
          if (userMessage && response && response.length > 10) {
            await cacheResponse(
              userMessage,
              response,
              model || `${provider}-default`,
              provider,
              getUserId(session),
              responseTime
            );
            console.log(`[CACHE] Stored new response (${responseTime}ms) for future use`);
          }
        }

      } catch (error: any) {
        // Enhanced error message based on session state
        const enhancedError = createSessionErrorMessage(session, error.message || 'Request failed');
        throw new Error(enhancedError);
      }
    }

    // Step 5: Log usage for analytics using unified session
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      await supabase.from('usage').insert({
        user_id: getUserId(session),
        endpoint: '/api/v2/unified-chat',
        method: 'POST',
        model: model || provider,
        metadata: {
          provider,
          authMethod: session.authMethod, // Use actual auth method from session
          requestAuthMethod: authMethod,   // Auth method from request for comparison
          message_count: messages.length,
          response_length: response.length,
          userEmail: session.user.email,
          // Ranking system performance metrics
          cacheHit,
          timeSavedMs: cacheHit ? timeSavedMs : 0,
          costSaved: cacheHit ? costSaved : 0,
          totalResponseTime: Date.now() - startTime,
          cacheEnabled: true
        }
      });
    } catch (error) {
      console.error('Usage logging failed:', error);
      // Continue without logging - don't fail the request
    }

    return NextResponse.json({ response });

  } catch (error: any) {
    console.error('Unified Chat API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle web session-based authentication (Claude.ai, ChatGPT web, etc.)
 */
async function handleWebSession(provider: string, messages: any[], sessionCookie: string): Promise<string> {
  switch (provider) {
    case 'claude':
      return await callClaudeWeb(sessionCookie, messages);
    case 'chatgpt':
      return await callChatGPTWeb(sessionCookie, messages);
    case 'gemini':
      return await callGeminiWeb(sessionCookie, messages);
    case 'perplexity':
      return await callPerplexityWeb(sessionCookie, messages);
    default:
      throw new Error(`Web sessions not supported for ${provider}`);
  }
}

/**
 * Handle API key-based authentication
 */
async function handleAPIKey(provider: string, messages: any[], model: string, apiKey: string): Promise<string> {
  switch (provider) {
    case 'chatgpt':
      return await callOpenAIAPI(apiKey, messages, model || 'gpt-5');
    case 'claude':
      return await callAnthropicAPI(apiKey, messages, model || 'claude-opus-4-1-20250805');
    case 'gemini':
      return await callGeminiAPI(apiKey, messages, model || 'gemini-2.0-ultra');
    case 'perplexity':
      return await callPerplexityAPI(apiKey, messages, model || 'pplx-pro-online');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Web session implementations - DEPRECATED
// These are kept for backward compatibility but will show deprecation errors
async function callClaudeWeb(sessionKey: string, messages: any[]): Promise<string> {
  throw new Error(
    'Web sessions are deprecated. CacheGPT now uses free LLM providers for authenticated users. ' +
    'Simply login with Google/GitHub and start chatting - no API keys needed!'
  );
}

async function callChatGPTWeb(sessionToken: string, messages: any[]): Promise<string> {
  throw new Error(
    'Web sessions are deprecated. CacheGPT now uses free LLM providers for authenticated users. ' +
    'Simply login with Google/GitHub and start chatting - no API keys needed!'
  );
}

async function callGeminiWeb(sessionCookie: string, messages: any[]): Promise<string> {
  throw new Error(
    'Web sessions are deprecated. CacheGPT now uses free LLM providers for authenticated users. ' +
    'Simply login with Google/GitHub and start chatting - no API keys needed!'
  );
}

async function callPerplexityWeb(sessionCookie: string, messages: any[]): Promise<string> {
  throw new Error(
    'Web sessions are deprecated. CacheGPT now uses free LLM providers for authenticated users. ' +
    'Simply login with Google/GitHub and start chatting - no API keys needed!'
  );
}

// API key implementations
async function callOpenAIAPI(apiKey: string, messages: any[], model: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'No response';
}

async function callAnthropicAPI(apiKey: string, messages: any[], model: string): Promise<string> {
  const anthropicMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: anthropicMessages,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || 'No response';
}

async function callGeminiAPI(apiKey: string, messages: any[], model: string): Promise<string> {
  const contents = messages.map(m => ({
    parts: [{ text: m.content }],
    role: m.role === 'user' ? 'user' : 'model'
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v2/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates[0]?.content?.parts[0]?.text || 'No response';
}

async function callPerplexityAPI(apiKey: string, messages: any[], model: string): Promise<string> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, messages })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'No response';
}

/**
 * Retry mechanism with exponential backoff for handling transient failures
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  session: UnifiedSession,
  operationName: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[RETRY] ${operationName} attempt ${attempt}/${maxRetries} for user ${session.user.id}`);
      return await operation();
    } catch (error: any) {
      lastError = error;
      console.warn(`[RETRY] ${operationName} attempt ${attempt} failed:`, error.message);

      // Check if this is a session-related error that won't benefit from retry
      if (isSessionRelatedError(error)) {
        console.log(`[RETRY] Session-related error detected, not retrying: ${error.message}`);
        throw error;
      }

      // If this is the last attempt, don't wait
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff with jitter
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`[RETRY] Waiting ${Math.round(delayMs)}ms before retry ${attempt + 1}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All retries failed
  console.error(`[RETRY] All ${maxRetries} attempts failed for ${operationName}`);
  throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
}

/**
 * Check if an error is session-related and won't benefit from retry
 */
function isSessionRelatedError(error: any): boolean {
  const sessionErrorPatterns = [
    /session.*expired/i,
    /unauthorized/i,
    /authentication.*failed/i,
    /invalid.*token/i,
    /login.*required/i,
    /access.*denied/i
  ];

  const errorMessage = error.message || error.toString();
  return sessionErrorPatterns.some(pattern => pattern.test(errorMessage));
}