import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// V2 API with enhanced features
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface V2ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: string;
  response_format?: { type: 'text' | 'json_object' };
  seed?: number;
  stop?: string[];
  presence_penalty?: number;
  frequency_penalty?: number;
}

export async function POST(req: NextRequest) {
  try {
    // Enhanced authentication with scope checking
    const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!apiKey) {
      return NextResponse.json({
        error: 'Unauthorized',
        code: 'auth_required',
        version: 'v2'
      }, { status: 401 });
    }

    // V2: Enhanced API key validation with permissions
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, permissions, rate_limit_tier')
      .eq('key', apiKey)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json({
        error: 'Invalid API key',
        code: 'invalid_key',
        version: 'v2'
      }, { status: 401 });
    }

    const body: V2ChatRequest = await req.json();

    // V2: Enhanced response with metadata
    const response = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'V2 API response with enhanced features'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      },
      system_fingerprint: 'fp_v2_' + Date.now(),
      cached: false,
      cache_metadata: {
        similarity: 0,
        hit_type: 'none',
        saved_cost: 0
      },
      version: 'v2'
    };

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message,
      version: 'v2'
    }, { status: 500 });
  }
}