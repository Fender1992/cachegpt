import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { HfInference } from '@huggingface/inference';
import { chatRequestSchema, validateRequest } from '@/lib/validation';
import { logger } from '@/lib/logger';

// Initialize Hugging Face client with null check
const hfApiKey = process.env.HUGGINGFACE_API_KEY;
const hf = hfApiKey ? new HfInference(hfApiKey) : null;

// Initialize Supabase client with null checks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// American-made models available on Hugging Face
const RESPONSE_ADAPTER_MODEL = 'meta-llama/Llama-2-7b-chat-hf'; // Meta's Llama 2
const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'; // For similarity search

interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
}

interface CachedResponse {
  id: string;
  query: string;
  response: string;
  embedding: number[];
  model: string;
  created_at: string;
  similarity?: number;
}

export async function POST(req: NextRequest) {
  try {
    // Check if services are configured
    if (!supabase || !hf) {
      logger.error('Service configuration missing');
      return NextResponse.json({
        error: 'Service configuration missing'
      }, { status: 503 });
    }

    // Get API key from header for authentication
    const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!apiKey) {
      logger.warn('Unauthorized request - missing API key');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate API key and get user
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('key', apiKey)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const userId = keyData.user_id;
    const startTime = Date.now();

    const body: ChatRequest = await req.json();
    const { messages, model = 'gpt-3.5-turbo', temperature = 0.7 } = body;

    // Get the latest user message
    const userMessage = messages[messages.length - 1]?.content;
    if (!userMessage) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    // Step 1: Generate embedding for the user query
    const queryEmbedding = await generateEmbedding(userMessage);

    // Step 2: Search for similar cached responses
    const cachedResponse = await findSimilarResponse(queryEmbedding, model);

    if (cachedResponse && cachedResponse.similarity! > 0.85) {
      // Step 3: If we have a good cache hit, adapt it to the current context
      const adaptedResponse = await adaptResponseToContext(
        cachedResponse.response,
        cachedResponse.query,
        userMessage,
        messages
      );

      const responseTime = Date.now() - startTime;
      const tokensUsed = estimateTokens(adaptedResponse);
      const costSaved = calculateCostSaved(model, tokensUsed);

      // Track usage for cache hit
      await trackUsage({
        user_id: userId,
        model,
        tokens_used: tokensUsed,
        cache_hit: true,
        response_time_ms: responseTime,
        endpoint: '/api/chat',
        cost: 0,
        cost_saved: costSaved
      });

      return NextResponse.json({
        content: adaptedResponse,
        cached: true,
        similarity: Math.round(cachedResponse.similarity! * 100),
        costSaved,
        originalQuery: cachedResponse.query,
        adapted: true,
        usage: {
          prompt_tokens: estimateTokens(userMessage),
          completion_tokens: tokensUsed,
          total_tokens: estimateTokens(userMessage) + tokensUsed
        }
      });
    }

    // Step 4: If no good cache hit, make a fresh API call
    const freshResponse = await callLLMProvider(body);

    // Step 5: Cache the new response with embedding
    await cacheResponse(userMessage, freshResponse, queryEmbedding, model);

    const responseTime = Date.now() - startTime;
    const tokensUsed = estimateTokens(freshResponse);
    const cost = calculateCost(model, tokensUsed);

    // Track usage for cache miss
    await trackUsage({
      user_id: userId,
      model,
      tokens_used: tokensUsed,
      cache_hit: false,
      response_time_ms: responseTime,
      endpoint: '/api/chat',
      cost,
      cost_saved: 0
    });

    return NextResponse.json({
      content: freshResponse,
      cached: false,
      similarity: 0,
      costSaved: 0,
      usage: {
        prompt_tokens: estimateTokens(userMessage),
        completion_tokens: tokensUsed,
        total_tokens: estimateTokens(userMessage) + tokensUsed
      }
    });

  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request', details: error.message },
      { status: 500 }
    );
  }
}

// Generate embeddings using Hugging Face
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    if (!hf) {
      // If HF is not configured, use fallback
      return generateFallbackEmbedding(text);
    }

    const response = await hf.featureExtraction({
      model: EMBEDDING_MODEL,
      inputs: text,
    });
    return Array.from(response as unknown as Float32Array);
  } catch (error) {
    console.error('Embedding generation failed:', error);
    // Fallback to a simple hash-based embedding if HF fails
    return generateFallbackEmbedding(text);
  }
}

// Find similar cached responses using vector similarity
async function findSimilarResponse(
  embedding: number[],
  model: string
): Promise<CachedResponse | null> {
  try {
    if (!supabase) {
      // If Supabase is not configured, skip similarity search
      return null;
    }

    // Use Supabase's pgvector for similarity search
    const { data, error } = await supabase
      .rpc('match_responses', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: 1,
        model_filter: model
      });

    if (error) throw error;
    return data?.[0] || null;
  } catch (error) {
    console.error('Similarity search failed:', error);
    return null;
  }
}

// Adapt cached response to new context using Hugging Face
async function adaptResponseToContext(
  cachedResponse: string,
  originalQuery: string,
  newQuery: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    // Create a prompt for the adaptation model
    const adaptationPrompt = `
You are a response adaptation assistant. Your task is to take a cached response and adapt it naturally to a new but similar question.

Original Question: "${originalQuery}"
Original Response: "${cachedResponse}"

New Question: "${newQuery}"

Conversation Context:
${conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

Please adapt the original response to answer the new question naturally and accurately.
- Keep the core information from the original response
- Adjust the language to fit the new question's phrasing
- Ensure the response flows naturally in the conversation
- If the questions are asking for different specific details, focus on what the new question asks

Adapted Response:`;

    // Use Hugging Face for response adaptation
    if (!hf) {
      // If HF is not configured, return cached response as is
      return cachedResponse;
    }

    const response = await hf.textGeneration({
      model: 'microsoft/DialoGPT-medium', // Microsoft's conversational model
      inputs: adaptationPrompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.7,
        top_p: 0.9,
        repetition_penalty: 1.2,
      }
    });

    return response.generated_text || cachedResponse;
  } catch (error) {
    console.error('Response adaptation failed:', error);
    // Fallback to simple adaptation
    return simpleAdaptation(cachedResponse, originalQuery, newQuery);
  }
}

// Simple fallback adaptation without AI
function simpleAdaptation(
  cachedResponse: string,
  originalQuery: string,
  newQuery: string
): string {
  // Basic keyword replacement and adjustment
  let adapted = cachedResponse;

  // Extract key differences between queries
  const originalWords = originalQuery.toLowerCase().split(' ');
  const newWords = newQuery.toLowerCase().split(' ');

  // Find unique words in new query
  const uniqueNewWords = newWords.filter(w => !originalWords.includes(w));

  // If the queries are very similar, return as-is
  if (uniqueNewWords.length < 2) {
    return adapted;
  }

  // Add a contextual prefix if the question style changed
  if (newQuery.includes('?') && !originalQuery.includes('?')) {
    adapted = `To answer your question: ${adapted}`;
  }

  return adapted;
}

// Call the actual LLM provider (OpenAI, Anthropic, etc.)
async function callLLMProvider(request: ChatRequest): Promise<string> {
  const { model, messages, temperature, max_tokens } = request;

  // Determine which provider to use based on model
  if (model.startsWith('gpt')) {
    return callOpenAI(request);
  } else if (model.startsWith('claude')) {
    return callAnthropic(request);
  } else {
    // For demo, return a mock response
    return `This is a mock response for model ${model}. In production, this would call the actual LLM API.`;
  }
}

async function callOpenAI(request: ChatRequest): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(request: ChatRequest): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.max_tokens || 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Cache the response with its embedding
async function cacheResponse(
  query: string,
  response: string,
  embedding: number[],
  model: string
): Promise<void> {
  try {
    if (!supabase) {
      // If Supabase is not configured, skip caching
      return;
    }

    await supabase
      .from('cached_responses')
      .insert({
        query,
        response,
        embedding,
        model,
        created_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('Failed to cache response:', error);
  }
}

// Calculate cost saved based on model and tokens
function calculateCostSaved(model: string, tokens: number): number {
  const costPerToken = {
    'gpt-3.5-turbo': 0.000002,
    'gpt-4': 0.00006,
    'claude-3-opus': 0.00006,
    'claude-3-sonnet': 0.00003,
  };

  const baseCost = costPerToken[model as keyof typeof costPerToken] || 0.000002;
  return baseCost * tokens;
}

// Calculate actual cost for API calls
function calculateCost(model: string, tokens: number): number {
  return calculateCostSaved(model, tokens); // Same calculation
}

// Estimate token count (rough approximation)
function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// Track usage in the database
async function trackUsage(data: {
  user_id: string;
  model: string;
  tokens_used: number;
  cache_hit: boolean;
  response_time_ms: number;
  endpoint: string;
  cost: number;
  cost_saved: number;
}): Promise<void> {
  try {
    if (!supabase) {
      // If Supabase is not configured, skip usage tracking
      return;
    }

    await supabase
      .from('usage_tracking')
      .insert({
        ...data,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to track usage:', error);
  }
}

// Simple fallback embedding generation
function generateFallbackEmbedding(text: string): number[] {
  const embedding = new Array(384).fill(0);
  for (let i = 0; i < text.length; i++) {
    embedding[i % 384] += text.charCodeAt(i) / 1000;
  }
  return embedding.map(v => Math.tanh(v));
}