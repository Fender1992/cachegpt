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
    // Authenticate user
    const authResult = await resolveAuthentication(request);
    if (isAuthError(authResult)) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        {
          status: authResult.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const userId = getUserId(authResult);
    const body = await request.json();
    const { messages } = body;

    // Create a TransformStream for streaming
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start the streaming response in the background
    (async () => {
      try {
        // Call the regular unified-chat API
        const response = await fetch(new URL('/api/v2/unified-chat', request.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('Authorization') || '',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.json();
          await writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.error || 'Failed to get response' })}\n\n`));
          await writer.close();
          return;
        }

        const data = await response.json();
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
        console.error('[STREAM] Error:', error);
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({
            error: error.message || 'Streaming error',
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
    console.error('[STREAM-API] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Streaming request failed' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
