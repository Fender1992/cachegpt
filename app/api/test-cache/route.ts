import { NextRequest, NextResponse } from 'next/server';
import { cacheResponse, findSimilarCachedResponse } from '@/lib/ranking-cache';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    // Test user ID (valid UUID)
    const testUserId = 'b5d6e8a0-1234-5678-9abc-def012345678';

    console.log('[TEST-CACHE] Testing with query:', query);

    // Check for cached response
    const cachedMatch = await findSimilarCachedResponse(
      query,
      'free-model',
      'mixed',
      0.85
    );

    if (cachedMatch) {
      return NextResponse.json({
        response: cachedMatch.cached_response.response,
        cached: true,
        similarity: cachedMatch.similarity,
        timeSaved: cachedMatch.time_saved_ms
      });
    }

    // Generate a test response
    const testResponse = `Test response for: ${query}. The answer is 42.`;

    // Cache the response
    console.log('[TEST-CACHE] Caching new response...');
    await cacheResponse(
      query,
      testResponse,
      'free-model',
      'mixed',
      testUserId,
      1000
    );

    return NextResponse.json({
      response: testResponse,
      cached: false,
      message: 'Response has been cached for future use'
    });

  } catch (error: any) {
    console.error('[TEST-CACHE] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}