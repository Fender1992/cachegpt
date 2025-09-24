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
            "id": "gpt-4-turbo-preview",
            "name": "GPT-4 Turbo",
            "default": true,
            "maxTokens": 128000
          },
          {
            "id": "gpt-4-vision-preview",
            "name": "GPT-4 Vision",
            "maxTokens": 128000
          },
          {
            "id": "gpt-4",
            "name": "GPT-4",
            "maxTokens": 8192
          },
          {
            "id": "gpt-3.5-turbo",
            "name": "GPT-3.5 Turbo",
            "maxTokens": 16384
          }
        ]
      },
      "claude": {
        "name": "Claude",
        "models": [
          {
            "id": "claude-3-opus-20240229",
            "name": "Claude 3 Opus",
            "default": true,
            "maxTokens": 200000
          },
          {
            "id": "claude-3-sonnet-20240229",
            "name": "Claude 3 Sonnet",
            "maxTokens": 200000
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
            "id": "gemini-1.5-pro-latest",
            "name": "Gemini 1.5 Pro",
            "default": true,
            "maxTokens": 2000000
          },
          {
            "id": "gemini-1.5-flash-latest",
            "name": "Gemini 1.5 Flash",
            "maxTokens": 1000000
          },
          {
            "id": "gemini-pro",
            "name": "Gemini Pro",
            "maxTokens": 32000
          }
        ]
      },
      "perplexity": {
        "name": "Perplexity",
        "models": [
          {
            "id": "sonar-medium-online",
            "name": "Sonar Medium Online",
            "default": true,
            "maxTokens": 16384
          },
          {
            "id": "sonar-small-online",
            "name": "Sonar Small Online",
            "maxTokens": 16384
          },
          {
            "id": "mixtral-8x7b-instruct",
            "name": "Mixtral 8x7B",
            "maxTokens": 16384
          }
        ]
      }
    },
    "lastUpdated": new Date().toISOString().split('T')[0],
    "updateUrl": "https://cachegpt.app/api/model-updates"
  })
}