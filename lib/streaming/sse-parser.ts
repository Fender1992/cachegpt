/**
 * SSE (Server-Sent Events) Parser
 *
 * Shared utility for parsing SSE streams from LLM provider APIs.
 * Handles the common `data: {...}\n\n` format used by OpenAI-compatible APIs.
 */

/**
 * Parse an SSE stream from a fetch Response into an async generator of data events.
 * Handles buffering of partial lines and the `data: [DONE]` sentinel.
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith(':')) continue;

        // Parse data lines
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);

          // Check for stream end sentinel
          if (data === '[DONE]') return;

          yield data;
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data !== '[DONE]') {
          yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse OpenAI-compatible streaming chunks.
 * Extracts delta content from each SSE data event.
 */
export async function* parseOpenAIStream(response: Response): AsyncGenerator<{
  content: string;
  finishReason?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}> {
  for await (const data of parseSSEStream(response)) {
    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];

      if (!choice) continue;

      yield {
        content: choice.delta?.content || '',
        finishReason: choice.finish_reason,
        usage: parsed.usage,
        model: parsed.model,
      };
    } catch {
      // Skip malformed JSON chunks
      continue;
    }
  }
}

/**
 * Parse Anthropic streaming events.
 * Anthropic uses a different event format with typed events.
 */
export async function* parseAnthropicStream(response: Response): AsyncGenerator<{
  content: string;
  done: boolean;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
}> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) continue;

        // Track event type
        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7);
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);

            if (currentEvent === 'content_block_delta' && parsed.delta?.text) {
              yield {
                content: parsed.delta.text,
                done: false,
              };
            } else if (currentEvent === 'message_start' && parsed.message) {
              yield {
                content: '',
                done: false,
                model: parsed.message.model,
                usage: parsed.message.usage ? {
                  input_tokens: parsed.message.usage.input_tokens,
                } : undefined,
              };
            } else if (currentEvent === 'message_delta' && parsed.usage) {
              yield {
                content: '',
                done: false,
                usage: {
                  output_tokens: parsed.usage.output_tokens,
                },
              };
            } else if (currentEvent === 'message_stop') {
              yield { content: '', done: true };
              return;
            }
          } catch {
            continue;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse Google Gemini streaming response.
 * Gemini's streamGenerateContent returns JSON array chunks.
 */
export async function* parseGeminiStream(response: Response): AsyncGenerator<{
  content: string;
  done: boolean;
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini streams JSON objects separated by newlines
      // Try to parse complete JSON objects from the buffer
      let startIndex = 0;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === '\n' || buffer[i] === ',') {
          const chunk = buffer.slice(startIndex, i).trim();
          startIndex = i + 1;

          if (!chunk || chunk === '[' || chunk === ']') continue;

          // Remove leading/trailing array brackets if present
          const cleanChunk = chunk.replace(/^\[/, '').replace(/\]$/, '').trim();
          if (!cleanChunk) continue;

          try {
            const parsed = JSON.parse(cleanChunk);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const finishReason = parsed.candidates?.[0]?.finishReason;

            yield {
              content: text,
              done: finishReason === 'STOP',
              usage: parsed.usageMetadata,
            };
          } catch {
            // Incomplete JSON, keep in buffer
            startIndex = chunk.length > 0 ? i - chunk.length : i;
            break;
          }
        }
      }
      buffer = buffer.slice(startIndex);
    }

    // Try to parse remaining buffer
    if (buffer.trim()) {
      const clean = buffer.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
      if (clean) {
        try {
          const parsed = JSON.parse(clean);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          yield {
            content: text,
            done: true,
            usage: parsed.usageMetadata,
          };
        } catch {
          // Ignore parse failures on final buffer
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
