import { NextRequest, NextResponse } from 'next/server'

// This endpoint provides the latest model configuration
// It can be updated manually or via CI/CD when new models are released
export async function GET(request: NextRequest) {
  // Return the latest model configuration
  // In production, this could fetch from a database or external service
  return NextResponse.json({
    "providers": {
      "chatgpt": {
        "name": "ChatGPT",
        "models": [
          {
            "id": "gpt-5",
            "name": "GPT-5",
            "default": true,
            "maxTokens": 256000
          },
          {
            "id": "gpt-5-vision",
            "name": "GPT-5 Vision",
            "maxTokens": 256000
          },
          {
            "id": "gpt-4-turbo-preview",
            "name": "GPT-4 Turbo",
            "maxTokens": 128000
          },
          {
            "id": "gpt-4",
            "name": "GPT-4",
            "maxTokens": 8192
          }
        ]
      },
      "claude": {
        "name": "Claude",
        "models": [
          {
            "id": "claude-opus-4-1-20250805",
            "name": "Claude Opus 4.1",
            "default": true,
            "maxTokens": 500000
          },
          {
            "id": "claude-sonnet-4-20250924",
            "name": "Claude Sonnet 4",
            "maxTokens": 300000
          },
          {
            "id": "claude-3-haiku-20240307",
            "name": "Claude 3 Haiku",
            "maxTokens": 200000
          }
        ]
      },
      "gemini": {
        "name": "Gemini",
        "models": [
          {
            "id": "gemini-2.0-ultra",
            "name": "Gemini 2.0 Ultra",
            "default": true,
            "maxTokens": 5000000
          },
          {
            "id": "gemini-2.0-pro",
            "name": "Gemini 2.0 Pro",
            "maxTokens": 2000000
          },
          {
            "id": "gemini-1.5-flash",
            "name": "Gemini 1.5 Flash",
            "maxTokens": 1000000
          }
        ]
      },
      "perplexity": {
        "name": "Perplexity",
        "models": [
          {
            "id": "pplx-pro-online",
            "name": "Perplexity Pro Online",
            "default": true,
            "maxTokens": 32768
          },
          {
            "id": "sonar-ultra-online",
            "name": "Sonar Ultra Online",
            "maxTokens": 32768
          },
          {
            "id": "llama-3-405b-instruct",
            "name": "Llama 3 405B",
            "maxTokens": 32768
          }
        ]
      }
    },
    "lastUpdated": new Date().toISOString().split('T')[0],
    "updateUrl": "https://cachegpt.app/api/model-updates"
  })
}