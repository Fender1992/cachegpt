# CacheGPT System Architecture

*Version: 12.17.0 | Last Updated: 2025-12-20*

## Overview

CacheGPT is an intelligent AI chat application that reduces LLM API costs through semantic caching. It supports multiple LLM providers and provides a unified interface for web, mobile, and CLI users.

**Production URL:** https://cachegpt.app

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15.5.3 (App Router) |
| Language | TypeScript 5.9 |
| Database | PostgreSQL (Supabase) with pgvector |
| Auth | Supabase Auth (OAuth + Email) |
| UI | React 18, Tailwind CSS, Shadcn UI |
| Payments | Stripe |
| Deployment | Vercel |

## Directory Structure

```
/root/cachegpt/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (56+ endpoints)
│   │   ├── v2/                   # Current API version
│   │   │   ├── unified-chat/     # Main chat endpoint
│   │   │   └── unified-chat-stream/ # Streaming endpoint
│   │   ├── auth/                 # Authentication
│   │   ├── conversations/        # Chat history
│   │   ├── admin/                # Admin operations
│   │   └── webhooks/             # Stripe webhooks
│   ├── chat/                     # Chat interface
│   ├── auth/                     # Auth pages
│   ├── settings/                 # User settings
│   └── admin/                    # Admin panel
├── components/                   # React components
│   ├── chat/                     # Chat UI
│   │   ├── ChatInterface.tsx     # Main chat (1508 lines)
│   │   ├── MobileChatModal.tsx   # Mobile modal
│   │   ├── MarkdownMessage.tsx   # Message renderer
│   │   └── FileUpload.tsx        # File uploads
│   ├── dashboard/                # Dashboard widgets
│   ├── landing/                  # Landing page
│   └── ui/                       # Base components
├── lib/                          # Core utilities
│   ├── unified-auth-resolver.ts  # Three-layer auth
│   ├── tier-based-cache.ts       # Cache system
│   ├── cache-lifecycle.ts        # Cache management
│   ├── context-enrichment.ts     # AI context
│   ├── weather-service.ts        # Weather API
│   └── supabase-*.ts             # DB clients
├── services/llm/                 # LLM providers
│   ├── adapters/                 # Provider adapters
│   ├── providerResolver.ts       # Provider selection
│   └── healthCheck.ts            # Health monitoring
├── config/                       # Configuration
│   ├── llmConfig.ts              # LLM settings
│   └── llm-models.json           # Model registry
├── database-scripts/             # SQL migrations
├── __tests__/                    # Test suites
└── docs/                         # Documentation
```

## Core Systems

### 1. Authentication System

**Three-Layer Authentication:**
```
Priority 1: API Key (cgpt_sk_*) → For programmatic access
Priority 2: Bearer Token (JWT) → For CLI/mobile
Priority 3: Cookie Session → For web users
```

**Key Files:**
- `lib/unified-auth-resolver.ts` - Central auth logic
- `lib/api-key-auth.ts` - API key validation
- `lib/provider-oauth.ts` - OAuth config

### 2. Caching System

**Five-Tier Cache Architecture:**
```
HOT    → Frequently accessed, high value
WARM   → Regular access patterns
COOL   → Periodic access
COLD   → Rarely accessed
FROZEN → Archived/stale
```

**Features:**
- Semantic similarity search (pgvector)
- Time-sensitive query detection
- User feedback integration
- Automatic tier promotion/demotion

**Key Files:**
- `lib/tier-based-cache.ts` - Cache operations
- `lib/cache-lifecycle.ts` - Tier management
- `lib/queryFreshness.ts` - TTL calculation

### 3. LLM Provider System

**Supported Providers:**
| Provider | Models | Priority |
|----------|--------|----------|
| Internal | internal-llm | 0 (highest) |
| Groq | llama-3.1-70b, mixtral | 1 |
| OpenAI | GPT-5, GPT-4 Turbo | 2 |
| Anthropic | Claude Opus 4.1, Sonnet 4 | 3 |
| Google | Gemini 2.0 Ultra | 4 |
| Perplexity | Pro Online, Sonar | 5 |
| Grok | grok-2 | 6 |

**Key Files:**
- `services/llm/providerResolver.ts` - Selection logic
- `services/llm/adapters/*.ts` - Provider implementations
- `config/llm-models.json` - Model configuration

### 4. Context Enrichment

**Injected Context:**
- Current date/time (user's timezone)
- Weather data (7-day forecasts)
- News headlines
- Technology versions
- Search results

**Key Files:**
- `lib/context-enrichment.ts` - System prompt generation
- `lib/weather-service.ts` - Weather API
- `lib/timezone-detector.ts` - Timezone detection

## Database Schema

### Core Tables

```sql
-- User management
user_profiles (id, email, plan_type, api_calls_limit, ...)

-- Chat history
conversations (id, user_id, title, provider, model, ...)
messages (id, conversation_id, role, content, tokens_used, ...)

-- Caching
cached_responses (id, query, query_hash, response, embedding, tier, ...)
cache_metadata (id, cache_id, query_type, feedback_*, ...)

-- API access
cachegpt_api_keys (id, user_id, key_hash, key_prefix, ...)

-- Analytics
usage (id, user_id, endpoint, tokens_used, cost, cache_hit, ...)
```

### Indexes

- `cached_responses_query_hash_idx` - Fast exact matching
- `cached_responses_embedding_idx` - pgvector similarity search
- `conversations_user_id_idx` - User query optimization
- `messages_conversation_id_idx` - Message retrieval

## API Endpoints

### Chat APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/unified-chat` | POST | Synchronous chat |
| `/api/v2/unified-chat-stream` | POST | Streaming chat |
| `/api/conversations` | GET/POST | Manage conversations |
| `/api/conversations/[id]/messages` | GET/POST | Message history |

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/me` | GET | Current user info |
| `/api/cli-auth` | POST | CLI authentication |
| `/api/api-keys` | POST | Generate API keys |

### Cache Operations
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cache-warm` | POST | Pre-warm cache |
| `/api/cache-feedback` | POST | Record feedback |
| `/api/cache/health` | GET | Cache health check |

## Data Flow

```
User Message
    ↓
1. Authenticate (API key → Bearer → Cookie)
    ↓
2. Check Cache (tier-based, semantic similarity)
    ├── HIT: Return cached response
    └── MISS: Continue
    ↓
3. Detect Time-Sensitive Query
    ├── YES: Skip cache, fresh query
    └── NO: Can use cache
    ↓
4. Resolve LLM Provider (priority system)
    ↓
5. Enrich Context (date, weather, news)
    ↓
6. Call LLM Provider
    ↓
7. Stream Response to Client
    ↓
8. Store in Cache (generate embedding)
    ↓
9. Log Usage Metrics
    ↓
10. Update Conversation History
```

## Security

### Authentication
- Row Level Security (RLS) on all user data
- API key hashing (SHA-256)
- JWT with automatic refresh
- Secure cookies (HttpOnly, SameSite)

### Data Protection
- HTTPS encryption
- Environment variables for secrets
- Service role key server-side only
- Rate limiting on public endpoints

## Mobile Architecture

### Components
- `MobileChatModal.tsx` - Primary mobile interface
- Safe area handling for notched devices
- Swipe-to-dismiss gesture
- Virtual keyboard detection

### CSS Utilities
```css
.pb-safe { padding-bottom: env(safe-area-inset-bottom); }
.h-screen-dvh { height: 100dvh; }
.inset-safe { /* all safe area insets */ }
```

## Testing

### Test Structure
```
__tests__/
├── utils/          # Mock utilities
├── lib/            # Unit tests
├── api/            # API tests
├── services/       # Service tests
└── e2e/            # Playwright E2E
```

### Coverage Targets
| Module | Target |
|--------|--------|
| Auth System | 85% |
| Cache System | 80% |
| Chat Endpoints | 75% |
| Overall | 80% |

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# LLM Providers
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Payments
STRIPE_API_KEY=
STRIPE_WEBHOOK_SECRET=

# Auth
JWT_SECRET=
```

## Deployment

### Production
- Platform: Vercel
- Database: Supabase (PostgreSQL)
- CDN: Vercel Edge Network
- Cron Jobs: Vercel Cron

### CI/CD
- GitHub Actions for testing
- Automatic preview deployments
- Coverage reporting via Codecov

## Performance Optimizations

1. **Caching** - Multi-tier semantic cache
2. **Streaming** - Server-sent events for real-time
3. **Code Splitting** - Dynamic imports
4. **Database** - Indexed queries, connection pooling
5. **Vector Search** - pgvector IVFFlat indexing

## Related Documentation

- [MOBILE_FIX_REPORT.md](./MOBILE_FIX_REPORT.md) - Mobile issues and fixes
- [TEST_COVERAGE_REPORT.md](./TEST_COVERAGE_REPORT.md) - Testing strategy
- [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) - Code quality issues
- [QUICK_WINS.md](./QUICK_WINS.md) - Easy improvements
