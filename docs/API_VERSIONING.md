# API Versioning Strategy

## Overview
CacheGPT uses URL-based versioning to ensure backward compatibility while allowing for API evolution.

## Current Versions

### Version 1 (v1) - Stable
- **Status**: Current stable version
- **Base URL**: `https://api.cachegpt.io/v1`
- **Features**:
  - Basic chat completions
  - Cache lookup and storage
  - Usage tracking
  - Simple authentication

### Version 2 (v2) - Beta
- **Status**: Beta (enhanced features)
- **Base URL**: `https://api.cachegpt.io/v2`
- **New Features**:
  - Streaming responses
  - Function calling
  - Advanced cache algorithms
  - Batch processing
  - Webhook callbacks
  - Custom model configurations

## Version Selection

### URL-Based (Recommended)
```
https://api.cachegpt.io/v1/chat
https://api.cachegpt.io/v2/chat
```

### Header-Based
```
X-API-Version: v2
```

## Migration Guide

### From v1 to v2

#### Request Format Changes
```typescript
// v1 Request
{
  "messages": [...],
  "model": "gpt-3.5-turbo"
}

// v2 Request
{
  "messages": [...],
  "model": "gpt-3.5-turbo",
  "response_format": { "type": "json_object" },
  "tools": [...],
  "tool_choice": "auto"
}
```

#### Response Format Changes
```typescript
// v1 Response
{
  "content": "...",
  "cached": true,
  "similarity": 95
}

// v2 Response
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "choices": [...],
  "usage": {...},
  "cache_metadata": {...}
}
```

## Deprecation Policy

1. **Announcement**: 6 months before deprecation
2. **Deprecation**: API marked as deprecated, warnings in headers
3. **Sunset**: 12 months after deprecation announcement
4. **End of Life**: API version no longer accessible

## Version Lifecycle

| Version | Released   | Deprecated | Sunset     | Status       |
|---------|------------|------------|------------|--------------|
| v1      | 2024-01-01 | -          | -          | Stable       |
| v2      | 2024-06-01 | -          | -          | Beta         |

## SDK Support

### JavaScript/TypeScript
```typescript
const client = new CacheGPT({
  apiKey: 'your-key',
  apiVersion: 'v2' // Optional, defaults to v1
})
```

### Python
```python
client = CacheGPT(
  api_key='your-key',
  api_version='v2'  # Optional, defaults to v1
)
```

## Response Headers

All API responses include version information:

```
X-API-Version: v1
X-API-Features: basic_chat,cache_lookup,usage_tracking
X-API-Versions: v1,v2
```

Deprecated versions include additional headers:

```
X-API-Deprecated: true
X-API-Sunset: 2025-01-01T00:00:00Z
Warning: 299 - "This API version is deprecated"
```

## Best Practices

1. **Always specify version explicitly** in production
2. **Monitor deprecation headers** in responses
3. **Test against beta versions** before they become stable
4. **Subscribe to version announcements** for updates
5. **Use latest stable version** for new integrations

## Version Feature Matrix

| Feature                | v1  | v2  |
|-----------------------|-----|-----|
| Chat Completions      | ✅  | ✅  |
| Cache Lookup          | ✅  | ✅  |
| Usage Tracking        | ✅  | ✅  |
| Streaming             | ❌  | ✅  |
| Function Calling      | ❌  | ✅  |
| Batch Processing      | ❌  | ✅  |
| Custom Models         | ❌  | ✅  |
| Webhook Callbacks     | ❌  | ✅  |
| Advanced Caching      | ❌  | ✅  |

## Breaking Changes

### v1 → v2
- Response format now follows OpenAI standard
- Authentication requires scope permissions
- Rate limiting is tier-based
- Error codes are standardized