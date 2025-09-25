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
    const validProviders = ['chatgpt', 'claude', 'gemini', 'perplexity'];
    if (!provider || !validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Step 3: Handle credentials - require user to provide their own credentials
    let apiCredential = credential;

    if (!apiCredential && authMethod !== 'web-session') {
      return NextResponse.json(
        {
          error: `No API key provided for ${provider}. Please provide your own API key.`,
          details: 'CacheGPT no longer uses server API keys to prevent cost issues. You must provide your own credentials.',
          authMethod: 'api-key-required'
        },
        { status: 401 }
      );
    }

    // Step 4: Check ranking-based cache for performance optimization
    const startTime = Date.now();
    let response = '';
    let cacheHit = false;
    let timeSavedMs = 0;
    let costSaved = 0;

    const userMessage = messages[messages.length - 1]?.content || message;
    if (userMessage) {
      console.log(`[CACHE] Checking for similar responses to: "${userMessage.substring(0, 100)}..."`);

      const cachedMatch = await findSimilarCachedResponse(
        userMessage,
        model || `${provider}-default`,
        provider,
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

    // Step 5: If no cache hit, route to appropriate handler with retry mechanism
    if (!cacheHit) {
      try {
        if (authMethod === 'web-session') {
          // Handle web session-based requests with retry
          response = await retryWithBackoff(
            () => handleWebSession(provider, messages, credential),
            session,
            'web session call'
          );
        } else {
          // Handle API key-based requests with retry
          response = await retryWithBackoff(
            () => handleAPIKey(provider, messages, model, apiCredential),
            session,
            'API key call'
          );
        }

        // Cache the new response for future optimization
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

// Web session implementations
async function callClaudeWeb(sessionKey: string, messages: any[]): Promise<string> {
  // Claude's web API requires complex authentication that changes frequently
  // The session key alone is not sufficient - it also needs:
  // - Organization ID
  // - CSRF tokens
  // - Proper cookie formatting
  // - Conversation IDs

  throw new Error(
    'Claude web sessions are not currently supported. ' +
    'Please use a Claude API key instead. ' +
    'Get your API key from: https://console.anthropic.com/settings/keys ' +
    'Then run: cachegpt logout && cachegpt init (and choose API key option)'
  );

  // Previous implementation kept for reference but doesn't work with current Claude.ai
  /*
  const response = await fetch('https://claude.ai/api/append_message', {
    method: 'POST',
    headers: {
      'Cookie': `sessionKey=${sessionKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    },
    body: JSON.stringify({
      prompt: messages[messages.length - 1].content,
      timezone: 'UTC',
      attachments: []
    })
  });

  if (!response.ok) {
    throw new Error(`Claude web API error: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split('\n');
  let fullResponse = '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.completion) {
          fullResponse += data.completion;
        }
      } catch {}
    }
  }

  return fullResponse || 'No response from Claude';
  */
}

async function callChatGPTWeb(sessionToken: string, messages: any[]): Promise<string> {
  // ChatGPT web implementation would go here
  // This would require reverse engineering the ChatGPT web API
  throw new Error('ChatGPT web sessions not yet implemented. Please provide your own OpenAI API key.');
}

async function callGeminiWeb(sessionCookie: string, messages: any[]): Promise<string> {
  // Gemini web implementation would go here
  throw new Error('Gemini web sessions not yet implemented. Please provide your own Google AI API key.');
}

async function callPerplexityWeb(sessionCookie: string, messages: any[]): Promise<string> {
  // Perplexity web implementation would go here
  throw new Error('Perplexity web sessions not yet implemented. Please provide your own Perplexity API key.');
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