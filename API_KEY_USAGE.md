# CacheGPT API Key Usage Guide

## Quick Start

### 1. Generate an API Key

1. Go to https://cachegpt.app/settings
2. Scroll to "CacheGPT API Keys" section
3. Click "New Key"
4. Enter a name (e.g., "Production App")
5. Optionally set expiration
6. Copy the key (starts with `cgpt_sk_...`) - **it won't be shown again!**

### 2. Use the API Key

Include your API key in the `Authorization` header of your requests:

```bash
Authorization: Bearer cgpt_sk_your_key_here
```

## Example Usage

### cURL

```bash
curl -X POST https://cachegpt.app/api/v2/unified-chat \
  -H "Authorization: Bearer cgpt_sk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ],
    "provider": "auto"
  }'
```

### JavaScript/TypeScript

```typescript
const response = await fetch('https://cachegpt.app/api/v2/unified-chat', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer cgpt_sk_your_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      {
        role: 'user',
        content: 'What is the capital of France?'
      }
    ],
    provider: 'auto' // or specify: 'openai', 'anthropic', 'google', etc.
  })
});

const data = await response.json();
console.log(data.response);
```

### Python

```python
import requests

response = requests.post(
    'https://cachegpt.app/api/v2/unified-chat',
    headers={
        'Authorization': 'Bearer cgpt_sk_your_key_here',
        'Content-Type': 'application/json'
    },
    json={
        'messages': [
            {
                'role': 'user',
                'content': 'What is the capital of France?'
            }
        ],
        'provider': 'auto'
    }
)

data = response.json()
print(data['response'])
```

### Node.js with Axios

```javascript
const axios = require('axios');

async function chat(message) {
  const response = await axios.post(
    'https://cachegpt.app/api/v2/unified-chat',
    {
      messages: [
        {
          role: 'user',
          content: message
        }
      ],
      provider: 'auto'
    },
    {
      headers: {
        'Authorization': 'Bearer cgpt_sk_your_key_here',
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.response;
}

// Usage
chat('What is the capital of France?').then(console.log);
```

## API Endpoints

All authenticated endpoints support API key authentication:

### Chat (Main Endpoint)
- **URL**: `POST https://cachegpt.app/api/v2/unified-chat`
- **Body**:
  ```json
  {
    "messages": [
      { "role": "user", "content": "Your message" }
    ],
    "provider": "auto",  // or "openai", "anthropic", "google", etc.
    "model": "gpt-4"     // optional, auto-selected if not specified
  }
  ```

### User Info
- **URL**: `GET https://cachegpt.app/api/me`
- **Returns**: User profile information

### Usage Stats
- **URL**: `GET https://cachegpt.app/api/v1/usage`
- **Returns**: Usage statistics and cache metrics

## Best Practices

### Security
- **Never commit API keys to version control**
- Store keys in environment variables
- Use different keys for development/staging/production
- Rotate keys periodically
- Set expiration dates for temporary keys

### Rate Limiting
- CacheGPT automatically handles rate limiting
- API keys inherit user's rate limits
- Cached responses don't count toward rate limits

### Error Handling

```javascript
try {
  const response = await fetch('https://cachegpt.app/api/v2/unified-chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CACHEGPT_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages, provider: 'auto' })
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid or expired API key');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.response;
} catch (error) {
  console.error('CacheGPT API error:', error);
  throw error;
}
```

## Managing API Keys

### View Your Keys
- Go to https://cachegpt.app/settings
- Scroll to "CacheGPT API Keys"
- See usage stats, last used date, and expiration

### Revoke a Key
- Click the trash icon next to the key
- Confirm deletion
- The key will be immediately invalidated

### Key Naming Convention
Use descriptive names to identify where each key is used:
- `Production API`
- `Staging Environment`
- `Local Development`
- `CI/CD Pipeline`
- `Mobile App - iOS`

## Cost Savings

API key users benefit from the same 80% cost reduction:
- Cached responses return in <10ms
- No LLM API call for cache hits
- Shared cache across all your applications
- Automatic semantic matching

## Support

Having issues? Contact support at https://cachegpt.app/support

## Authentication Priority

CacheGPT supports multiple authentication methods (in priority order):

1. **API Key** (`cgpt_sk_*`) - For programmatic access
2. **Bearer Token** (Supabase JWT) - For CLI/OAuth users
3. **Cookie Session** - For web users

If an API key is provided, it takes precedence over other methods.
