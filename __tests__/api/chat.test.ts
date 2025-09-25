import { NextRequest, NextResponse } from 'next/server'
import { POST } from '@/app/api/v2/unified-chat/route'

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({
            data: { user_id: 'test-user-123' },
            error: null
          }))
        }))
      })),
      insert: jest.fn(() => Promise.resolve({ error: null }))
    })),
    rpc: jest.fn(() => Promise.resolve({
      data: [{
        query: 'What is AI?',
        response: 'AI is artificial intelligence...',
        similarity: 0.95
      }],
      error: null
    }))
  }))
}))

// Mock Hugging Face
jest.mock('@huggingface/inference', () => ({
  HfInference: jest.fn(() => ({
    featureExtraction: jest.fn(() => Promise.resolve(new Float32Array(384))),
    textGeneration: jest.fn(() => Promise.resolve({
      generated_text: 'Adapted response...'
    }))
  }))
}))

describe('/api/v2/unified-chat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should require authentication', async () => {
    const request = new NextRequest('http://localhost/api/v2/unified-chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }]
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should handle cache hits', async () => {
    const request = new NextRequest('http://localhost/api/v2/unified-chat', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer test-api-key'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is AI?' }],
        model: 'gpt-3.5-turbo'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.cached).toBe(true)
    expect(data.similarity).toBeGreaterThan(85)
    expect(data.content).toBeDefined()
  })

  it('should track token usage', async () => {
    const request = new NextRequest('http://localhost/api/v2/unified-chat', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer test-api-key'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Test message' }]
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.usage).toBeDefined()
    expect(data.usage.prompt_tokens).toBeGreaterThan(0)
    expect(data.usage.completion_tokens).toBeGreaterThan(0)
    expect(data.usage.total_tokens).toBe(
      data.usage.prompt_tokens + data.usage.completion_tokens
    )
  })

  it('should handle invalid requests', async () => {
    const request = new NextRequest('http://localhost/api/v2/unified-chat', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer test-api-key'
      },
      body: JSON.stringify({
        messages: []
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('No message provided')
  })

  it('should support different models', async () => {
    const models = ['gpt-3.5-turbo', 'gpt-4', 'claude-3-opus']

    for (const model of models) {
      const request = new NextRequest('http://localhost/api/v2/unified-chat', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer test-api-key'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Test' }],
          model
        })
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    }
  })
})