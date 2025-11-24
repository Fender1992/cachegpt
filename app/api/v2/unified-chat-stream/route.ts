/**
 * Streaming Chat API
 *
 * Provides streaming responses for better UX with typewriter effect.
 * Uses the same logic as unified-chat but returns responses as Server-Sent Events.
 */

import { NextRequest } from 'next/server';
import {
  resolveAuthentication,
  isAuthError,
  getUserId,
} from '@/lib/unified-auth-resolver';

// Note: Not using edge runtime due to crypto dependency in auth
export async function POST(request: NextRequest) {
  try {
    // Try to authenticate user, but allow anonymous access
    const authResult = await resolveAuthentication(request);
    const userId = isAuthError(authResult) ? null : getUserId(authResult);

    const body = await request.json();
    const { messages } = body;

    // Debug: Log the user's message
    const userMessage = messages[messages.length - 1]?.content;
    console.log('[STREAM-DEBUG] User message:', userMessage?.substring(0, 100));

    // Create a TransformStream for streaming
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start the streaming response in the background
    (async () => {
      try {
        // Forward all relevant headers to unified-chat
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Forward auth header if present
        if (request.headers.get('Authorization')) {
          headers['Authorization'] = request.headers.get('Authorization')!;
        }

        // Forward timezone headers for context enrichment (CRITICAL for weather)
        if (request.headers.get('x-user-timezone')) {
          headers['x-user-timezone'] = request.headers.get('x-user-timezone')!;
        }
        if (request.headers.get('x-timezone-offset')) {
          headers['x-timezone-offset'] = request.headers.get('x-timezone-offset')!;
        }

        // Call the regular unified-chat API
        console.log('[STREAM-DEBUG] Calling unified-chat with headers:', Object.keys(headers));
        const response = await fetch(new URL('/api/v2/unified-chat', request.url), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        console.log('[STREAM-DEBUG] Unified-chat response status:', response.status);

        if (!response.ok) {
          const error = await response.json();
          console.log('[STREAM-DEBUG] Unified-chat error:', error);
          await writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.error || 'Failed to get response' })}\n\n`));
          await writer.close();
          return;
        }

        const data = await response.json();
        console.log('[STREAM-DEBUG] Got response, cached:', data.cached);
        const fullContent = data.response || '';

        // Stream the response word by word for typewriter effect
        const words = fullContent.split(' ');
        let accumulatedContent = '';

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          accumulatedContent += (i > 0 ? ' ' : '') + word;

          // Send the accumulated content
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({
              content: accumulatedContent,
              done: false,
              provider: data.provider,
              model: data.model,
              cached: data.cached
            })}\n\n`)
          );

          // Small delay for typewriter effect (adjust speed here)
          await new Promise(resolve => setTimeout(resolve, 30));
        }

        // Send final message with all metadata
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({
            content: fullContent,
            done: true,
            provider: data.provider,
            model: data.model,
            cached: data.cached,
            cacheId: data.cacheId,
            conversationId: data.conversationId,
            messageId: data.messageId
          })}\n\n`)
        );

        await writer.close();
      } catch (error: any) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({
            error: 'Streaming error',
            done: true
          })}\n\n`)
        );
        await writer.close();
      }
    })();

    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Streaming request failed' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
