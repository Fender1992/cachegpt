import { NextRequest, NextResponse } from 'next/server';
import { error as logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: 'Provider and API key are required' },
        { status: 400 }
      );
    }

    // Test the API key with a minimal request
    let testResult: { ok: boolean; error?: string };

    switch (provider) {
      case 'openai':
        testResult = await testOpenAI(apiKey);
        break;
      case 'anthropic':
        testResult = await testAnthropic(apiKey);
        break;
      case 'google':
        testResult = await testGoogle(apiKey);
        break;
      case 'perplexity':
        testResult = await testPerplexity(apiKey);
        break;
      default:
        return NextResponse.json(
          { error: 'Unsupported provider' },
          { status: 400 }
        );
    }

    if (!testResult.ok) {
      return NextResponse.json(
        { error: testResult.error || 'API key validation failed' },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true, message: 'API key is valid' });
  } catch (error: any) {
    logError('Error testing API key', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function testOpenAI(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error?.message || 'Invalid OpenAI API key'
      };
    }

    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

async function testAnthropic(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Test with a minimal messages request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error?.message || 'Invalid Anthropic API key'
      };
    }

    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

async function testGoogle(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error?.message || 'Invalid Google API key'
      };
    }

    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

async function testPerplexity(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error?.message || 'Invalid Perplexity API key'
      };
    }

    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}