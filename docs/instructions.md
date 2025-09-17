# PHASE 1: Database Setup & Basic API Structure

## Goal
Set up Supabase database with pgvector, create basic FastAPI structure, and implement fundamental data models.

## Implementation Tasks

### 1.1 Supabase Database Setup

**Create database schema:**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  plan_type TEXT DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- API keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  key_name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cache entries table
CREATE TABLE cache_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  query_hash TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_embedding VECTOR(1536), -- OpenAI ada-002 dimensions
  response_text TEXT NOT NULL,
  model_used TEXT NOT NULL,
  tokens_saved INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
  hit_count INTEGER DEFAULT 0
);

-- Usage logs table
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  api_key_id UUID REFERENCES api_keys(id),
  cache_hit BOOLEAN DEFAULT FALSE,
  tokens_used INTEGER DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  model_used TEXT,
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_cache_entries_query_hash ON cache_entries (query_hash);
CREATE INDEX idx_cache_entries_user_id ON cache_entries (user_id);
CREATE INDEX idx_cache_entries_expires_at ON cache_entries (expires_at);
CREATE INDEX idx_usage_logs_user_id_created_at ON usage_logs (user_id, created_at);

-- Vector similarity index (create after inserting some data)
-- CREATE INDEX ON cache_entries USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 100);
```

**Create vector similarity search function:**
```sql
CREATE OR REPLACE FUNCTION match_cache_entries (
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.85,
  match_count INT DEFAULT 1,
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  query_text TEXT,
  response_text TEXT,
  similarity FLOAT,
  hit_count INTEGER,
  model_used TEXT
)
LANGUAGE plpgsql
AS $
BEGIN
  RETURN QUERY
  SELECT
    cache_entries.id,
    cache_entries.query_text,
    cache_entries.response_text,
    1 - (cache_entries.query_embedding <=> query_embedding) AS similarity,
    cache_entries.hit_count,
    cache_entries.model_used
  FROM cache_entries
  WHERE 
    cache_entries.expires_at > NOW()
    AND (user_id_filter IS NULL OR cache_entries.user_id = user_id_filter)
    AND 1 - (cache_entries.query_embedding <=> query_embedding) > match_threshold
  ORDER BY cache_entries.query_embedding <=> query_embedding
  LIMIT match_count;
END;
$;
```

### 1.2 Basic FastAPI Project Structure

**File Structure:**
```
app/
├── main.py                 # FastAPI app entry point
├── config.py              # Configuration management
├── models/                 # Pydantic models
│   ├── __init__.py
│   ├── cache.py           # Cache entry models
│   ├── api.py             # API request/response models
│   └── auth.py            # Authentication models
├── database/              # Database operations
│   ├── __init__.py
│   ├── supabase_client.py # Supabase connection
│   └── models.py          # SQLAlchemy models (if needed)
├── services/              # Business logic (Phase 2)
│   └── __init__.py
├── routers/               # API routes (Phase 2)
│   └── __init__.py
└── utils.py               # Utility functions
```

**Key Files to Create:**

**config.py:**
```python
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    jwt_secret: str
    environment: str = "development"
    log_level: str = "INFO"
    
    class Config:
        env_file = ".env"

settings = Settings()
```

**database/supabase_client.py:**
```python
from supabase import create_client, Client
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class SupabaseClient:
    def __init__(self):
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key
        )
    
    async def test_connection(self) -> bool:
        """Test database connection"""
        try:
            result = self.client.table("user_profiles").select("id").limit(1).execute()
            return True
        except Exception as e:
            logger.error(f"Supabase connection failed: {e}")
            return False

# Global instance
supabase_client = SupabaseClient()
```

**models/cache.py:**
```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

class CacheEntry(BaseModel):
    id: Optional[uuid.UUID] = None
    user_id: uuid.UUID
    query_hash: str
    query_text: str
    query_embedding: Optional[List[float]] = None
    response_text: str
    model_used: str
    tokens_saved: int = 0
    cost_saved: float = 0.0
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    hit_count: int = 0

class CacheSearchResult(BaseModel):
    id: uuid.UUID
    query_text: str
    response_text: str
    similarity: float
    hit_count: int
    model_used: str
```

**main.py:**
```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging
from app.config import settings
from app.database.supabase_client import supabase_client

# Configure logging
logging.basicConfig(level=getattr(logging, settings.log_level))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LLM Cache Proxy",
    description="Intelligent caching proxy for LLM APIs",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Test connections on startup"""
    logger.info("Starting LLM Cache Proxy...")
    
    # Test Supabase connection
    if await supabase_client.test_connection():
        logger.info("✅ Supabase connection successful")
    else:
        logger.error("❌ Supabase connection failed")
        raise Exception("Database connection failed")

@app.get("/")
async def root():
    return {"message": "LLM Cache Proxy API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    db_status = await supabase_client.test_connection()
    
    return {
        "status": "healthy" if db_status else "unhealthy",
        "database": "connected" if db_status else "disconnected",
        "environment": settings.environment
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Phase 1 Completion Criteria

### ✅ Functional Tests to Run

**1. Database Schema Test:**
```sql
-- Verify all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_profiles', 'api_keys', 'cache_entries', 'usage_logs');

-- Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Test vector similarity function
SELECT match_cache_entries(
  ARRAY[0.1, 0.2, 0.3]::vector(3), -- Test vector (adjust dimensions)
  0.8, 
  5
);
```

**2. API Tests:**
```bash
# Start the FastAPI server
python -m app.main

# Test health endpoint
curl http://localhost:8000/health

# Expected response: {"status": "healthy", "database": "connected", "environment": "development"}
```

**3. Supabase Connection Test:**
```python
# Run this test script
from app.database.supabase_client import supabase_client
import asyncio

async def test_db():
    result = await supabase_client.test_connection()
    print(f"Database connection: {'✅ Success' if result else '❌ Failed'}")

asyncio.run(test_db())
```

**4. Environment Configuration Test:**
```python
# Test configuration loading
from app.config import settings

required_vars = ['supabase_url', 'supabase_service_role_key', 'jwt_secret']
for var in required_vars:
    value = getattr(settings, var, None)
    print(f"{var}: {'✅ Set' if value else '❌ Missing'}")
```

### ✅ Phase 1 Success Criteria

**Must Pass All:**
- [ ] All database tables created successfully
- [ ] pgvector extension enabled
- [ ] Vector similarity function working
- [ ] FastAPI server starts without errors  
- [ ] `/health` endpoint returns "healthy" status
- [ ] Supabase connection test passes
- [ ] All required environment variables configured
- [ ] No Python import errors in any module

**Ready for Phase 2 when:**
- All tests above pass ✅
- You can successfully insert a test record into `cache_entries` table
- Vector similarity search returns results (even if empty)
- FastAPI server responds to HTTP requests

---

# PHASE 2: Core Caching Logic & LLM Integration

## Goal
Implement the core caching functionality with exact and semantic matching, integrate with LLM providers (OpenAI), and create the main proxy endpoint.

## Implementation Tasks

### 2.1 Services Layer

**services/embedding_service.py:**
```python
import openai
from typing import List
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        openai.api_key = settings.openai_api_key
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using OpenAI"""
        try:
            response = openai.Embedding.create(
                input=text,
                model="text-embedding-ada-002"
            )
            return response['data'][0]['embedding']
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise

    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        try:
            response = openai.Embedding.create(
                input=texts,
                model="text-embedding-ada-002"
            )
            return [item['embedding'] for item in response['data']]
        except Exception as e:
            logger.error(f"Batch embedding generation failed: {e}")
            raise

embedding_service = EmbeddingService()
```

**services/llm_service.py:**
```python
import openai
import anthropic
from typing import Dict, Any, Optional
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.openai_client = openai.OpenAI(api_key=settings.openai_api_key)
        if settings.anthropic_api_key:
            self.anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    
    async def call_openai(self, messages: List[Dict], model: str = "gpt-3.5-turbo", **kwargs) -> Dict[str, Any]:
        """Call OpenAI API"""
        try:
            response = self.openai_client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs
            )
            
            return {
                "choices": [{"message": {"content": response.choices[0].message.content}}],
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                },
                "model": response.model
            }
        except Exception as e:
            logger.error(f"OpenAI API call failed: {e}")
            raise
    
    async def call_anthropic(self, messages: List[Dict], model: str = "claude-3-sonnet-20240229", **kwargs) -> Dict[str, Any]:
        """Call Anthropic API"""
        try:
            # Convert OpenAI format to Anthropic format
            system_message = ""
            anthropic_messages = []
            
            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                else:
                    anthropic_messages.append(msg)
            
            response = self.anthropic_client.messages.create(
                model=model,
                system=system_message,
                messages=anthropic_messages,
                max_tokens=kwargs.get("max_tokens", 1000)
            )
            
            return {
                "choices": [{"message": {"content": response.content[0].text}}],
                "usage": {
                    "prompt_tokens": response.usage.input_tokens,
                    "completion_tokens": response.usage.output_tokens,
                    "total_tokens": response.usage.input_tokens + response.usage.output_tokens
                },
                "model": model
            }
        except Exception as e:
            logger.error(f"Anthropic API call failed: {e}")
            raise

llm_service = LLMService()
```

**services/cache_service.py:**
```python
import hashlib
import json
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging

from app.database.supabase_client import supabase_client
from app.models.cache import CacheEntry, CacheSearchResult
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

class CacheService:
    def __init__(self):
        self.client = supabase_client.client
    
    def generate_query_hash(self, messages: List[Dict], model: str) -> str:
        """Generate SHA-256 hash of normalized query"""
        # Normalize the query for consistent hashing
        normalized = {
            "messages": messages,
            "model": model
        }
        query_string = json.dumps(normalized, sort_keys=True)
        return hashlib.sha256(query_string.encode()).hexdigest()
    
    async def get_exact_match(self, query_hash: str, user_id: uuid.UUID) -> Optional[CacheEntry]:
        """Check for exact cache match"""
        try:
            result = self.client.table("cache_entries").select("*").eq("query_hash", query_hash).eq("user_id", user_id).single().execute()
            
            if result.data:
                return CacheEntry(**result.data)
            return None
        except Exception as e:
            logger.info(f"No exact match found: {e}")
            return None
    
    async def get_semantic_matches(self, query_text: str, user_id: uuid.UUID, threshold: float = 0.85) -> List[CacheSearchResult]:
        """Find semantically similar cache entries"""
        try:
            # Generate embedding for the query
            embedding = await embedding_service.generate_embedding(query_text)
            
            # Search for similar entries
            result = self.client.rpc("match_cache_entries", {
                "query_embedding": embedding,
                "match_threshold": threshold,
                "match_count": 5,
                "user_id_filter": str(user_id)
            }).execute()
            
            return [CacheSearchResult(**row) for row in result.data] if result.data else []
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            return []
    
    async def store_cache_entry(self, 
                              user_id: uuid.UUID,
                              query_hash: str, 
                              query_text: str, 
                              response_text: str, 
                              model: str,
                              tokens_used: int = 0,
                              cost: float = 0.0) -> CacheEntry:
        """Store new cache entry"""
        try:
            # Generate embedding
            embedding = await embedding_service.generate_embedding(query_text)
            
            cache_entry = {
                "user_id": str(user_id),
                "query_hash": query_hash,
                "query_text": query_text,
                "query_embedding": embedding,
                "response_text": response_text,
                "model_used": model,
                "tokens_saved": tokens_used,
                "cost_saved": cost,
                "expires_at": (datetime.now() + timedelta(hours=24)).isoformat()
            }
            
            result = self.client.table("cache_entries").insert(cache_entry).execute()
            return CacheEntry(**result.data[0])
        except Exception as e:
            logger.error(f"Failed to store cache entry: {e}")
            raise
    
    async def update_hit_count(self, cache_id: uuid.UUID) -> None:
        """Increment hit count for cache entry"""
        try:
            self.client.table("cache_entries").update({
                "hit_count": self.client.table("cache_entries").select("hit_count").eq("id", str(cache_id)).single().execute().data["hit_count"] + 1
            }).eq("id", str(cache_id)).execute()
        except Exception as e:
            logger.error(f"Failed to update hit count: {e}")
    
    async def log_usage(self, 
                       user_id: uuid.UUID,
                       api_key_id: Optional[uuid.UUID],
                       cache_hit: bool,
                       tokens_used: int,
                       cost: float,
                       model: str,
                       response_time_ms: int) -> None:
        """Log usage statistics"""
        try:
            usage_log = {
                "user_id": str(user_id),
                "api_key_id": str(api_key_id) if api_key_id else None,
                "cache_hit": cache_hit,
                "tokens_used": tokens_used,
                "cost": cost,
                "model_used": model,
                "response_time_ms": response_time_ms
            }
            
            self.client.table("usage_logs").insert(usage_log).execute()
        except Exception as e:
            logger.error(f"Failed to log usage: {e}")

cache_service = CacheService()
```

### 2.2 API Routes

**routers/proxy.py:**
```python
from fastapi import APIRouter, HTTPException, Depends, Header
from typing import List, Dict, Any, Optional
import time
import uuid
import logging

from app.services.cache_service import cache_service
from app.services.llm_service import llm_service
from app.models.api import ChatCompletionRequest, ChatCompletionResponse
from app.database.supabase_client import supabase_client

logger = logging.getLogger(__name__)
router = APIRouter()

async def get_user_from_api_key(authorization: str = Header(...)) -> uuid.UUID:
    """Extract user ID from API key"""
    try:
        api_key = authorization.replace("Bearer ", "")
        
        result = supabase_client.client.table("api_keys").select("user_id").eq("api_key", api_key).eq("is_active", True).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        return uuid.UUID(result.data["user_id"])
    except Exception as e:
        logger.error(f"API key validation failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid API key")

@router.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    user_id: uuid.UUID = Depends(get_user_from_api_key)
) -> ChatCompletionResponse:
    """OpenAI-compatible chat completions with caching"""
    start_time = time.time()
    
    try:
        # Generate query hash and text
        query_hash = cache_service.generate_query_hash(request.messages, request.model)
        query_text = json.dumps(request.messages)
        
        # Check for exact match first
        exact_match = await cache_service.get_exact_match(query_hash, user_id)
        if exact_match:
            await cache_service.update_hit_count(exact_match.id)
            
            response_time = int((time.time() - start_time) * 1000)
            await cache_service.log_usage(
                user_id=user_id,
                api_key_id=None,  # TODO: Get from header
                cache_hit=True,
                tokens_used=0,
                cost=0.0,
                model=request.model,
                response_time_ms=response_time
            )
            
            return ChatCompletionResponse(
                choices=[{"message": {"content": exact_match.response_text}}],
                cached=True,
                cache_type="exact"
            )
        
        # Check for semantic matches
        semantic_matches = await cache_service.get_semantic_matches(query_text, user_id)
        if semantic_matches:
            best_match = semantic_matches[0]  # Highest similarity
            await cache_service.update_hit_count(best_match.id)
            
            response_time = int((time.time() - start_time) * 1000)
            await cache_service.log_usage(
                user_id=user_id,
                api_key_id=None,
                cache_hit=True,
                tokens_used=0,
                cost=0.0,
                model=request.model,
                response_time_ms=response_time
            )
            
            return ChatCompletionResponse(
                choices=[{"message": {"content": best_match.response_text}}],
                cached=True,
                cache_type="semantic",
                similarity=best_match.similarity
            )
        
        # Cache miss - call actual LLM
        if request.model.startswith("gpt"):
            llm_response = await llm_service.call_openai(
                messages=request.messages,
                model=request.model,
                max_tokens=request.max_tokens,
                temperature=request.temperature
            )
        elif request.model.startswith("claude"):
            llm_response = await llm_service.call_anthropic(
                messages=request.messages,
                model=request.model,
                max_tokens=request.max_tokens
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported model: {request.model}")
        
        # Store in cache
        response_text = llm_response["choices"][0]["message"]["content"]
        tokens_used = llm_response["usage"]["total_tokens"]
        
        # Calculate cost (rough estimates)
        cost_per_token = 0.002 / 1000  # GPT-3.5-turbo pricing
        cost = tokens_used * cost_per_token
        
        await cache_service.store_cache_entry(
            user_id=user_id,
            query_hash=query_hash,
            query_text=query_text,
            response_text=response_text,
            model=request.model,
            tokens_used=tokens_used,
            cost=cost
        )
        
        response_time = int((time.time() - start_time) * 1000)
        await cache_service.log_usage(
            user_id=user_id,
            api_key_id=None,
            cache_hit=False,
            tokens_used=tokens_used,
            cost=cost,
            model=request.model,
            response_time_ms=response_time
        )
        
        return ChatCompletionResponse(
            choices=llm_response["choices"],
            cached=False,
            usage=llm_response["usage"]
        )
        
    except Exception as e:
        logger.error(f"Chat completion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

**models/api.py:**
```python
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gpt-3.5-turbo"
    max_tokens: Optional[int] = None
    temperature: Optional[float] = 1.0
    stream: bool = False

class ChatCompletionResponse(BaseModel):
    choices: List[Dict[str, Any]]
    cached: bool = False
    cache_type: Optional[str] = None
    similarity: Optional[float] = None
    usage: Optional[Dict[str, int]] = None
```

### 2.3 Update main.py

```python
# Add to main.py
from app.routers import proxy

app.include_router(proxy.router, prefix="/api")
```

## Phase 2 Completion Criteria

### ✅ Functional Tests to Run

**1. Embedding Service Test:**
```python
from app.services.embedding_service import embedding_service
import asyncio

async def test_embeddings():
    text = "Hello, how are you?"
    embedding = await embedding_service.generate_embedding(text)
    print(f"Embedding length: {len(embedding)}")
    print(f"First 5 values: {embedding[:5]}")
    assert len(embedding) == 1536  # OpenAI ada-002 dimensions

asyncio.run(test_embeddings())
```

**2. Cache Service Test:**
```python
from app.services.cache_service import cache_service
import uuid
import asyncio

async def test_cache():
    user_id = uuid.uuid4()
    
    # Test hash generation
    messages = [{"role": "user", "content": "Hello"}]
    hash_val = cache_service.generate_query_hash(messages, "gpt-3.5-turbo")
    print(f"Generated hash: {hash_val}")
    
    # Test exact match (should be None)
    match = await cache_service.get_exact_match(hash_val, user_id)
    print(f"Exact match: {match}")

asyncio.run(test_cache())
```

**3. LLM Service Test:**
```python
from app.services.llm_service import llm_service
import asyncio

async def test_llm():
    messages = [{"role": "user", "content": "Say hello"}]
    response = await llm_service.call_openai(messages)
    print(f"Response: {response['choices'][0]['message']['content']}")

asyncio.run(test_llm())
```

**4. API Endpoint Test:**
```bash
# Create a test API key first in Supabase
# Then test the endpoint

curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "model": "gpt-3.5-turbo"
  }'
```

**5. Cache Hit Test:**
```bash
# Make the same request twice - second should be cached
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "model": "gpt-3.5-turbo"
  }'

# Second request (should return cached=true)
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "model": "gpt-3.5-turbo"
  }'
```

### ✅ Phase 2 Success Criteria

**Must Pass All:**
- [ ] Embedding service generates 1536-dimensional vectors
- [ ] LLM service successfully calls OpenAI API
- [ ] Cache service stores and retrieves entries
- [ ] API endpoint accepts requests and returns responses
- [ ] Exact cache matching works (same request returns cached=true)
- [ ] Semantic cache matching works (similar request returns cached=true)
- [ ] Usage logging works (entries appear in usage_logs table)
- [ ] Vector similarity search returns results
- [ ] API key authentication works

**Ready for Phase 3 when:**
- All tests above pass ✅
- You can make the same API request twice and get cached response
- Database contains cache_entries and usage_logs after API calls
- Vector similarity search finds semantically similar queries

---

# PHASE 3: Frontend Dashboard & Authentication

## Goal
Create a React/Next.js dashboard for users to monitor cache performance, manage API keys, and view analytics.

## Implementation Tasks

### 3.1 Next.js Project Setup

**Create frontend directory structure:**
```
frontend/
├── package.json
├── next.config.js
├── tailwind.config.js
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/page.tsx
│   ├── dashboard/page.tsx
│   ├── api-keys/page.tsx
│   ├── analytics/page.tsx
│   └── cache/page.tsx
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── table.tsx
│   ├── Dashboard/
│   │   ├── StatsCards.tsx
│   │   ├── CacheHitChart.tsx
│   │   └── RecentActivity.tsx
│   ├── ApiKeys/
│   │   ├── ApiKeyList.tsx
│   │   └── CreateApiKey.tsx
│   └── Layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── lib/
│   ├── supabase.ts
│   ├── utils.ts
│   └── types.ts
└── hooks/
    ├── useAuth.ts
    ├── useCache.ts
    └── useAnalytics.ts
```

**package.json:**
```json
{
  "name": "llm-cache-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.38.0",
    "@tanstack/react-query": "^5.0.0",
    "next": "14.0.0",
    "react": "^18",
    "react-dom": "^18",
    "recharts": "^2.8.0",
    "lucide-react": "^0.290.0",
    "tailwindcss": "^3.3.0",
    "typescript": "^5"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10",
    "postcss": "^8",
    "eslint": "^8",
    "eslint-config-next": "14.0.0"
  }
}
```

### 3.2 Supabase Client Setup

**lib/supabase.ts:**
```typescript
import { createClientComponentClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const createClient = () => {
  return createClientComponentClient()
}

export const createServerClient = () => {
  return createServerComponentClient({ cookies })
}

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          email: string
          plan_type: string
          created_at: string
          updated_at: string
        }
      }
      api_keys: {
        Row: {
          id: string
          user_id: string
          key_name: string
          api_key: string
          is_active: boolean
          created_at: string
        }
      }
      cache_entries: {
        Row: {
          id: string
          user_id: string
          query_text: string
          response_text: string
          model_used: string
          hit_count: number
          created_at: string
          cost_saved: number
        }
      }
      usage_logs: {
        Row: {
          id: string
          user_id: string
          cache_hit: boolean
          tokens_used: number
          cost: number
          model_used: string
          response_time_ms: number
          created_at: string
        }
      }
    }
  }
}
```

### 3.3 Authentication Hook

**hooks/useAuth.ts:**
```typescript
import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
  }
}
```

### 3.4 Dashboard Components

**components/Dashboard/StatsCards.tsx:**
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StatsCardsProps {
  totalRequests: number
  cacheHitRate: number
  costSaved: number
  avgResponseTime: number
}

export const StatsCards = ({ totalRequests, cacheHitRate, costSaved, avgResponseTime }: StatsCardsProps) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalRequests.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">+20.1% from last month</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{(cacheHitRate * 100).toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">+5.2% from last month</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cost Saved</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${costSaved.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">+12.3% from last month</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgResponseTime}ms</div>
          <p className="text-xs text-muted-foreground">-15ms from last month</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

**components/Dashboard/CacheHitChart.tsx:**
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface CacheHitChartProps {
  data: Array<{
    date: string
    cacheHits: number
    totalRequests: number
    hitRate: number
  }>
}

export const CacheHitChart = ({ data }: CacheHitChartProps) => {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" />
        <Tooltip />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="totalRequests"
          stroke="#8884d8"
          name="Total Requests"
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="cacheHits"
          stroke="#82ca9d"
          name="Cache Hits"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="hitRate"
          stroke="#ffc658"
          name="Hit Rate %"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

### 3.5 Main Dashboard Page

**app/dashboard/page.tsx:**
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatsCards } from '@/components/Dashboard/StatsCards'
import { CacheHitChart } from '@/components/Dashboard/CacheHitChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase'

export default function Dashboard() {
  const { user, loading } = useAuth()
  const [stats, setStats] = useState({
    totalRequests: 0,
    cacheHitRate: 0,
    costSaved: 0,
    avgResponseTime: 0
  })
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user])

  const fetchDashboardData = async () => {
    const supabase = createClient()
    
    try {
      // Fetch usage statistics
      const { data: usageData, error: usageError } = await supabase
        .from('usage_logs')
        .select('*')
        .eq('user_id', user?.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      if (usageError) throw usageError

      // Calculate stats
      const totalRequests = usageData?.length || 0
      const cacheHits = usageData?.filter(log => log.cache_hit).length || 0
      const cacheHitRate = totalRequests > 0 ? cacheHits / totalRequests : 0
      const costSaved = usageData?.reduce((sum, log) => sum + (log.cost || 0), 0) || 0
      const avgResponseTime = totalRequests > 0 
        ? usageData.reduce((sum, log) => sum + log.response_time_ms, 0) / totalRequests 
        : 0

      setStats({
        totalRequests,
        cacheHitRate,
        costSaved,
        avgResponseTime: Math.round(avgResponseTime)
      })

      // Generate chart data (last 7 days)
      const chartData = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
        
        const dayLogs = usageData?.filter(log => {
          const logDate = new Date(log.created_at)
          return logDate >= dayStart && logDate < dayEnd
        }) || []
        
        const dayTotal = dayLogs.length
        const dayHits = dayLogs.filter(log => log.cache_hit).length
        
        chartData.push({
          date: date.toLocaleDateString(),
          totalRequests: dayTotal,
          cacheHits: dayHits,
          hitRate: dayTotal > 0 ? (dayHits / dayTotal) * 100 : 0
        })
      }
      
      setChartData(chartData)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>
  }

  if (!user) {
    return <div>Please log in to view dashboard</div>
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>
      
      <StatsCards {...stats} />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Cache Performance</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <CacheHitChart data={chartData} />
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              <div className="flex items-center">
                <div className="ml-4 space-y-1">
                  <p className="text-sm font-medium leading-none">Cache hit for "What is AI?"</p>
                  <p className="text-sm text-muted-foreground">2 minutes ago</p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="ml-4 space-y-1">
                  <p className="text-sm font-medium leading-none">New query cached</p>
                  <p className="text-sm text-muted-foreground">5 minutes ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

### 3.6 API Keys Management

**app/api-keys/page.tsx:**
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase'
import { Plus, Copy, Trash2 } from 'lucide-react'

interface ApiKey {
  id: string
  key_name: string
  api_key: string
  is_active: boolean
  created_at: string
}

export default function ApiKeys() {
  const { user } = useAuth()
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      fetchApiKeys()
    }
  }, [user])

  const fetchApiKeys = async () => {
    const supabase = createClient()
    
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setApiKeys(data || [])
    } catch (error) {
      console.error('Error fetching API keys:', error)
    }
  }

  const generateApiKey = () => {
    return 'sk-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  const createApiKey = async () => {
    if (!newKeyName.trim()) return

    setLoading(true)
    const supabase = createClient()
    
    try {
      const apiKey = generateApiKey()
      
      const { data, error } = await supabase
        .from('api_keys')
        .insert([{
          user_id: user?.id,
          key_name: newKeyName,
          api_key: apiKey,
          is_active: true
        }])
        .select()

      if (error) throw error
      
      setNewKeyName('')
      await fetchApiKeys()
    } catch (error) {
      console.error('Error creating API key:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const deleteApiKey = async (id: string) => {
    const supabase = createClient()
    
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id)

      if (error) throw error
      await fetchApiKeys()
    } catch (error) {
      console.error('Error deleting API key:', error)
    }
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">API Keys</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create New API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Input
              placeholder="API Key Name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
            <Button onClick={createApiKey} disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Create Key
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.key_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <code className="text-sm">
                        {key.api_key.substring(0, 8)}...{key.api_key.substring(-4)}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(key.api_key)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      key.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {key.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(key.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteApiKey(key.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

## Phase 3 Completion Criteria

### ✅ Functional Tests to Run

**1. Authentication Test:**
```bash
# Start Next.js dev server
npm run dev

# Navigate to http://localhost:3000
# Test user registration and login
```

**2. Dashboard Data Test:**
```javascript
// Browser console test
const response = await fetch('/api/dashboard-stats', {
  headers: { 'Authorization': 'Bearer YOUR_SESSION_TOKEN' }
})
const data = await response.json()
console.log('Dashboard data:', data)
```

**3. API Key Creation Test:**
```javascript
// Test API key generation in browser
const generateApiKey = () => {
  return 'sk-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}
console.log('Generated key:', generateApiKey())
```

**4. Real-time Updates Test:**
```javascript
// Test Supabase real-time subscriptions
const supabase = createClient()
const subscription = supabase
  .channel('usage_logs')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'usage_logs' }, 
    payload => console.log('New usage log:', payload))
  .subscribe()
```

**5. Component Rendering Test:**
```bash
# Check all dashboard components render without errors
# Navigate through all pages: /dashboard, /api-keys, /analytics, /cache
```

### ✅ Phase 3 Success Criteria

**Must Pass All:**
- [ ] User can register and login with Supabase Auth
- [ ] Dashboard displays stats cards with real data
- [ ] Cache hit rate chart renders with data points
- [ ] API key creation and management works
- [ ] API keys can be copied to clipboard
- [ ] Real-time updates work (new usage logs appear)
- [ ] Navigation between pages works smoothly
- [ ] Mobile responsive design works
- [ ] Error states are handled gracefully

**Ready for Phase 4 when:**
- All tests above pass ✅
- User can authenticate and see personalized dashboard
- API keys can be created and used to authenticate with backend
- Charts and analytics display meaningful data
- UI is responsive and user-friendly

---

# PHASE 4: CLI Tool & Production Polish

## Goal
Create a command-line interface for easy testing and management, add production-ready features like monitoring, error handling, and deployment configuration.

## Implementation Tasks

### 4.1 CLI Tool Development

**Create CLI directory structure:**
```
cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── commands/
│   │   ├── init.ts
│   │   ├── test.ts
│   │   ├── stats.ts
│   │   ├── clear.ts
│   │   └── config.ts
│   ├── lib/
│   │   ├── api.ts
│   │   ├── config.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
└── bin/
    └── llm-cache
```

**package.json:**
```json
{
  "name": "llm-cache-cli",
  "version": "1.0.0",
  "description": "CLI tool for LLM Cache Proxy",
  "main": "dist/index.js",
  "bin": {
    "llm-cache": "bin/llm-cache"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "prepublish": "npm run build"
  },
  "dependencies": {
    "commander": "^11.0.0",
    "axios": "^1.5.0",
    "chalk": "^4.1.2",
    "inquirer": "^8.2.5",
    "ora": "^5.4.1",
    "table": "^6.8.1"
  },
  "devDependencies": {
    "@types/inquirer": "^9.0.0",
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.0.0"
  }
}
```

**src/index.ts:**
```typescript
#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import { initCommand } from './commands/init'
import { testCommand } from './commands/test'
import { statsCommand } from './commands/stats'
import { clearCommand } from './commands/clear'
import { configCommand } from './commands/config'

const program = new Command()

program
  .name('llm-cache')
  .description('CLI tool for LLM Cache Proxy')
  .version('1.0.0')

program
  .command('init')
  .description('Initialize LLM Cache configuration')
  .action(initCommand)

program
  .command('test')
  .description('Test API connectivity and cache functionality')
  .option('-m, --model <model>', 'LLM model to test', 'gpt-3.5-turbo')
  .option('-q, --query <query>', 'Test query', 'Hello, world!')
  .action(testCommand)

program
  .command('stats')
  .description('Show cache statistics')
  .option('-d, --days <days>', 'Number of days to show', '7')
  .action(statsCommand)

program
  .command('clear')
  .description('Clear cache entries')
  .option('--all', 'Clear all cache entries')
  .option('--older-than <hours>', 'Clear entries older than X hours', '24')
  .action(clearCommand)

program
  .command('config')
  .description('Manage configuration')
  .option('--show', 'Show current configuration')
  .option('--set <key=value>', 'Set configuration value')
  .action(configCommand)

program.parse()
```

**src/commands/test.ts:**
```typescript
import axios from 'axios'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig } from '../lib/config'

interface TestOptions {
  model: string
  query: string
}

export async function testCommand(options: TestOptions) {
  const config = loadConfig()
  
  if (!config.apiKey || !config.baseUrl) {
    console.log(chalk.red('❌ Configuration missing. Run `llm-cache init` first.'))
    return
  }

  const spinner = ora('Testing LLM Cache API...').start()

  try {
    // Test 1: First request (should miss cache)
    spinner.text = 'Making first request (cache miss expected)...'
    
    const firstResponse = await axios.post(`${config.baseUrl}/api/v1/chat/completions`, {
      messages: [{ role: 'user', content: options.query }],
      model: options.model
    }, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    const firstResult = firstResponse.data
    const firstTime = firstResponse.headers['x-response-time'] || 'N/A'

    spinner.text = 'Making second request (cache hit expected)...'
    
    // Test 2: Same request (should hit cache)
    const secondResponse = await axios.post(`${config.baseUrl}/api/v1/chat/completions`, {
      messages: [{ role: 'user', content: options.query }],
      model: options.model
    }, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    const secondResult = secondResponse.data
    const secondTime = secondResponse.headers['x-response-time'] || 'N/A'

    spinner.succeed('Test completed successfully!')

    console.log('\n' + chalk.bold('Test Results:'))
    console.log('═'.repeat(50))
    
    console.log(chalk.blue('\n📊 First Request (Cache Miss):'))
    console.log(`Response Time: ${firstTime}`)
    console.log(`Cached: ${firstResult.cached ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`Response: ${firstResult.choices[0].message.content.substring(0, 100)}...`)
    
    console.log(chalk.blue('\n📊 Second Request (Cache Hit):'))
    console.log(`Response Time: ${secondTime}`)
    console.log(`Cached: ${secondResult.cached ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`Cache Type: ${secondResult.cache_type || 'N/A'}`)
    
    if (secondResult.similarity) {
      console.log(`Similarity: ${(secondResult.similarity * 100).toFixed(1)}%`)
    }

    // Performance comparison
    if (firstTime !== 'N/A' && secondTime !== 'N/A') {
      const improvement = ((parseFloat(firstTime) - parseFloat(secondTime)) / parseFloat(firstTime)) * 100
      console.log(`\n${chalk.green('⚡ Performance Improvement:')} ${improvement.toFixed(1)}%`)
    }

  } catch (error: any) {
    spinner.fail('Test failed!')
    
    if (error.response) {
      console.log(chalk.red(`Error ${error.response.status}: ${error.response.data.detail || error.response.statusText}`))
    } else {
      console.log(chalk.red(`Network Error: ${error.message}`))
    }
  }
}
```

**src/commands/stats.ts:**
```typescript
import axios from 'axios'
import chalk from 'chalk'
import ora from 'ora'
import { table } from 'table'
import { loadConfig } from '../lib/config'

interface StatsOptions {
  days: string
}

export async function statsCommand(options: StatsOptions) {
  const config = loadConfig()
  
  if (!config.apiKey || !config.baseUrl) {
    console.log(chalk.red('❌ Configuration missing. Run `llm-cache init` first.'))
    return
  }

  const spinner = ora('Fetching cache statistics...').start()

  try {
    const response = await axios.get(`${config.baseUrl}/api/stats?days=${options.days}`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    })

    const stats = response.data
    spinner.succeed('Statistics retrieved!')

    console.log('\n' + chalk.bold('Cache Statistics'))
    console.log('═'.repeat(50))

    // Summary stats
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Requests', stats.totalRequests.toLocaleString()],
      ['Cache Hits', stats.cacheHits.toLocaleString()],
      ['Cache Hit Rate', `${(stats.cacheHitRate * 100).toFixed(1)}%`],
      ['Cost Saved', `${stats.costSaved.toFixed(2)}`],
      ['Avg Response Time (Cache Hit)', `${stats.avgCacheResponseTime}ms`],
      ['Avg Response Time (Cache Miss)', `${stats.avgMissResponseTime}ms`]
    ]

    console.log(table(summaryData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼'
      }
    }))

    // Top models
    if (stats.topModels && stats.topModels.length > 0) {
      console.log('\n' + chalk.bold('Top Models:'))
      const modelData = [
        ['Model', 'Requests', 'Cache Hit Rate'],
        ...stats.topModels.map((model: any) => [
          model.name,
          model.requests.toLocaleString(),
          `${(model.hitRate * 100).toFixed(1)}%`
        ])
      ]
      console.log(table(modelData))
    }

    // Recent cache performance
    if (stats.dailyStats && stats.dailyStats.length > 0) {
      console.log('\n' + chalk.bold('Daily Performance:'))
      const dailyData = [
        ['Date', 'Requests', 'Cache Hits', 'Hit Rate'],
        ...stats.dailyStats.map((day: any) => [
          day.date,
          day.requests.toLocaleString(),
          day.cacheHits.toLocaleString(),
          `${(day.hitRate * 100).toFixed(1)}%`
        ])
      ]
      console.log(table(dailyData))
    }

  } catch (error: any) {
    spinner.fail('Failed to fetch statistics!')
    
    if (error.response) {
      console.log(chalk.red(`Error ${error.response.status}: ${error.response.data.detail || error.response.statusText}`))
    } else {
      console.log(chalk.red(`Network Error: ${error.message}`))
    }
  }
}
```

**src/commands/init.ts:**
```typescript
import inquirer from 'inquirer'
import chalk from 'chalk'
import { saveConfig } from '../lib/config'

export async function initCommand() {
  console.log(chalk.blue('🚀 Welcome to LLM Cache CLI Setup'))
  console.log('Let\'s configure your connection to the LLM Cache Proxy.\n')

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Enter the base URL of your LLM Cache Proxy:',
      default: 'http://localhost:8000',
      validate: (input) => {
        try {
          new URL(input)
          return true
        } catch {
          return 'Please enter a valid URL'
        }
      }
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'Enter your API key:',
      validate: (input) => {
        if (!input.trim()) {
          return 'API key is required'
        }
        if (!input.startsWith('sk-')) {
          return 'API key should start with "sk-"'
        }
        return true
      }
    },
    {
      type: 'input',
      name: 'defaultModel',
      message: 'Default LLM model to use:',
      default: 'gpt-3.5-turbo'
    },
    {
      type: 'number',
      name: 'timeout',
      message: 'Request timeout (seconds):',
      default: 30
    }
  ])

  try {
    saveConfig(answers)
    console.log(chalk.green('\n✅ Configuration saved successfully!'))
    console.log(chalk.blue('You can now run `llm-cache test` to verify your setup.'))
  } catch (error) {
    console.log(chalk.red('❌ Failed to save configuration:'), error)
  }
}
```

**src/lib/config.ts:**
```typescript
import fs from 'fs'
import path from 'path'
import os from 'os'

interface Config {
  baseUrl: string
  apiKey: string
  defaultModel: string
  timeout: number
}

const CONFIG_DIR = path.join(os.homedir(), '.llm-cache')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export function loadConfig(): Partial<Config> {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return {}
    }
    
    const configData = fs.readFileSync(CONFIG_FILE, 'utf8')
    return JSON.parse(configData)
  } catch (error) {
    console.error('Error loading config:', error)
    return {}
  }
}

export function saveConfig(config: Config): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`)
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE
}
```

### 4.2 Production Enhancements

**Add to FastAPI backend - middleware/monitoring.py:**
```python
import time
import logging
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

# Metrics
REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint', 'status'])
REQUEST_DURATION = Histogram('http_request_duration_seconds', 'HTTP request duration')
CACHE_HITS = Counter('cache_hits_total', 'Total cache hits', ['cache_type'])
CACHE_MISSES = Counter('cache_misses_total', 'Total cache misses')

logger = logging.getLogger(__name__)

class MonitoringMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        response = await call_next(request)
        
        # Record metrics
        duration = time.time() - start_time
        REQUEST_DURATION.observe(duration)
        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()
        
        # Add response time header
        response.headers["X-Response-Time"] = f"{duration:.3f}s"
        
        return response

async def metrics_endpoint():
    """Prometheus metrics endpoint"""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

**Add error handling - middleware/error_handler.py:**
```python
import logging
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unhandled error: {e}", exc_info=True)
            
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error",
                    "message": "An unexpected error occurred",
                    "request_id": getattr(request.state, 'request_id', 'unknown')
                }
            )
```

**Enhanced main.py with production features:**
```python
import logging
import uuid
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.config import settings
from app.database.supabase_client import supabase_client
from app.routers import proxy, admin
from app.middleware.monitoring import MonitoringMiddleware, metrics_endpoint
from app.middleware.error_handler import ErrorHandlerMiddleware

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LLM Cache Proxy",
    description="Intelligent caching proxy for LLM APIs",
    version="1.0.0",
    docs_url="/docs" if settings.environment == "development" else None
)

# Middleware
app.add_middleware(ErrorHandlerMiddleware)
app.add_middleware(MonitoringMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.environment == "development" else settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request ID middleware
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request.state.request_id = str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response

# Routes
app.include_router(proxy.router, prefix="/api")
app.include_router(admin.router, prefix="/admin", tags=["admin"])

@app.on_event("startup")
async def startup_event():
    logger.info("Starting LLM Cache Proxy...")
    
    if await supabase_client.test_connection():
        logger.info("✅ Supabase connection successful")
    else:
        logger.error("❌ Supabase connection failed")
        raise Exception("Database connection failed")

@app.get("/")
async def root():
    return {
        "message": "LLM Cache Proxy API",
        "version": "1.0.0",
        "environment": settings.environment
    }

@app.get("/health")
async def health_check():
    db_status = await supabase_client.test_connection()
    
    return {
        "status": "healthy" if db_status else "unhealthy",
        "database": "connected" if db_status else "disconnected",
        "environment": settings.environment,
        "version": "1.0.0"
    }

@app.get("/metrics")
async def metrics():
    return await metrics_endpoint()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level=settings.log_level.lower()
    )
```

### 4.3 Deployment Configuration

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - ENVIRONMENT=production
      - LOG_LEVEL=INFO
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources

volumes:
  redis_data:
  prometheus_data:
  grafana_data:
```

**Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**requirements.txt:**
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
supabase==2.0.0
openai==1.3.0
anthropic==0.5.0
pydantic==2.5.0
pydantic-settings==2.1.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
prometheus-client==0.19.0
redis==5.0.1
httpx==0.25.2
sqlalchemy==2.0.23
asyncpg==0.29.0
alembic==1.13.0
```

**prometheus.yml:**
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'llm-cache-proxy'
    static_configs:
      - targets: ['app:8000']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

### 4.4 Admin Dashboard Routes

**routers/admin.py:**
```python
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
import uuid
from datetime import datetime, timedelta

from app.database.supabase_client import supabase_client
from app.services.cache_service import cache_service

router = APIRouter()

async def admin_required():
    # Add admin authentication logic here
    pass

@router.get("/stats")
async def get_admin_stats(days: int = 7):
    """Get comprehensive statistics for admin dashboard"""
    try:
        client = supabase_client.client
        since_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        # Get usage logs
        usage_result = client.table("usage_logs").select("*").gte("created_at", since_date).execute()
        usage_logs = usage_result.data or []
        
        # Calculate summary stats
        total_requests = len(usage_logs)
        cache_hits = len([log for log in usage_logs if log["cache_hit"]])
        cache_hit_rate = cache_hits / total_requests if total_requests > 0 else 0
        total_cost_saved = sum(log["cost"] for log in usage_logs if log["cache_hit"])
        
        # Response time stats
        cache_hit_times = [log["response_time_ms"] for log in usage_logs if log["cache_hit"]]
        cache_miss_times = [log["response_time_ms"] for log in usage_logs if not log["cache_hit"]]
        
        avg_cache_hit_time = sum(cache_hit_times) / len(cache_hit_times) if cache_hit_times else 0
        avg_cache_miss_time = sum(cache_miss_times) / len(cache_miss_times) if cache_miss_times else 0
        
        # Model usage stats
        model_stats = {}
        for log in usage_logs:
            model = log["model_used"]
            if model not in model_stats:
                model_stats[model] = {"total": 0, "hits": 0}
            model_stats[model]["total"] += 1
            if log["cache_hit"]:
                model_stats[model]["hits"] += 1
        
        top_models = [
            {
                "name": model,
                "requests": stats["total"],
                "hitRate": stats["hits"] / stats["total"] if stats["total"] > 0 else 0
            }
            for model, stats in sorted(model_stats.items(), key=lambda x: x[1]["total"], reverse=True)
        ][:5]
        
        # Daily stats
        daily_stats = {}
        for log in usage_logs:
            date = datetime.fromisoformat(log["created_at"]).date().isoformat()
            if date not in daily_stats:
                daily_stats[date] = {"requests": 0, "hits": 0}
            daily_stats[date]["requests"] += 1
            if log["cache_hit"]:
                daily_stats[date]["hits"] += 1
        
        daily_performance = [
            {
                "date": date,
                "requests": stats["requests"],
                "cacheHits": stats["hits"],
                "hitRate": stats["hits"] / stats["requests"] if stats["requests"] > 0 else 0
            }
            for date, stats in sorted(daily_stats.items())
        ]
        
        return {
            "totalRequests": total_requests,
            "cacheHits": cache_hits,
            "cacheHitRate": cache_hit_rate,
            "costSaved": total_cost_saved,
            "avgCacheResponseTime": round(avg_cache_hit_time),
            "avgMissResponseTime": round(avg_cache_miss_time),
            "topModels": top_models,
            "dailyStats": daily_performance
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cache/clear")
async def clear_cache(older_than_hours: int = 24):
    """Clear cache entries older than specified hours"""
    try:
        cutoff_date = (datetime.now() - timedelta(hours=older_than_hours)).isoformat()
        
        result = supabase_client.client.table("cache_entries").delete().lt("created_at", cutoff_date).execute()
        
        return {
            "message": f"Cleared cache entries older than {older_than_hours} hours",
            "deleted_count": len(result.data) if result.data else 0
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users")
async def get_users(limit: int = 50, offset: int = 0):
    """Get user list with statistics"""
    try:
        # Get user profiles with usage stats
        users_result = supabase_client.client.table("user_profiles").select("*").range(offset, offset + limit - 1).execute()
        users = users_result.data or []
        
        # Add usage stats for each user
        for user in users:
            usage_result = supabase_client.client.table("usage_logs").select("*").eq("user_id", user["id"]).execute()
            usage_logs = usage_result.data or []
            
            total_requests = len(usage_logs)
            cache_hits = len([log for log in usage_logs if log["cache_hit"]])
            
            user["total_requests"] = total_requests
            user["cache_hits"] = cache_hits
            user["cache_hit_rate"] = cache_hits / total_requests if total_requests > 0 else 0
            user["total_cost_saved"] = sum(log["cost"] for log in usage_logs if log["cache_hit"])
        
        return {
            "users": users,
            "total": len(users)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## Phase 4 Completion Criteria

### ✅ Functional Tests to Run

**1. CLI Tool Tests:**
```bash
# Build and install CLI
cd cli
npm run build
npm link

# Test commands
llm-cache init
llm-cache test
llm-cache stats
llm-cache config --show
```

**2. Production Deployment Test:**
```bash
# Test Docker build
docker build -t llm-cache-proxy .

# Test Docker Compose
docker-compose up -d

# Check all services are running
docker-compose ps

# Test health checks
curl http://localhost:8000/health
curl http://localhost:9090  # Prometheus
curl http://localhost:3001  # Grafana
```

**3. Monitoring Tests:**
```bash
# Test metrics endpoint
curl http://localhost:8000/metrics

# Make some requests and check metrics
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}], "model": "gpt-3.5-turbo"}'

# Check Prometheus metrics
curl http://localhost:9090/api/v1/query?query=http_requests_total
```

**4. Admin API Tests:**
```bash
# Test admin stats
curl http://localhost:8000/admin/stats

# Test cache clearing
curl -X DELETE http://localhost:8000/admin/cache/clear?older_than_hours=1

# Test user listing
curl http://localhost:8000/admin/users
```

**5. Error Handling Tests:**
```bash
# Test invalid API key
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Authorization: Bearer invalid-key" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'

# Test invalid model
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}], "model": "invalid-model"}'
```

**6. Performance Tests:**
```bash
# Install Apache Bench or similar
# Test concurrent requests
ab -n 100 -c 10 -H "Authorization: Bearer YOUR_API_KEY" \
   -H "Content-Type: application/json" \
   -p test_payload.json \
   http://localhost:8000/api/v1/chat/completions
```

### ✅ Phase 4 Success Criteria

**Must Pass All:**
- [ ] CLI tool installs and runs all commands successfully
- [ ] Docker containers build and start without errors
- [ ] All health checks pass (app, Redis, Prometheus, Grafana)
- [ ] Metrics are collected and exposed properly
- [ ] Error handling works gracefully for all error scenarios
- [ ] Admin API returns correct statistics
- [ ] Cache clearing functionality works
- [ ] Performance under load is acceptable (>50 req/sec)
- [ ] Monitoring dashboards display real-time data
- [ ] Production logging works properly

**Ready for Production when:**
- All tests above pass ✅
- CLI tool can successfully interact with deployed API
- Monitoring shows cache hit rates and performance metrics
- Error scenarios are handled gracefully
- System can handle expected production load
- Documentation is complete and accurate

---

# FINAL DEPLOYMENT CHECKLIST

## ✅ Pre-Production Validation

**Environment Setup:**
- [ ] Production Supabase instance configured
- [ ] Environment variables secured
- [ ] SSL certificates configured
- [ ] Domain name pointed to application
- [ ] CDN configured (if needed)

**Security:**
- [ ] API keys use proper format and entropy
- [ ] Rate limiting configured
- [ ] CORS properly restricted for production
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention verified

**Performance:**
- [ ] Database indexes optimized
- [ ] Vector similarity search performance tested
- [ ] Memory usage within acceptable limits
- [ ] Response times under 200ms for cache hits
- [ ] Load testing completed

**Monitoring:**
- [ ] Prometheus metrics collection working
- [ ] Grafana dashboards configured
- [ ] Alerting rules set up
- [ ] Log aggregation configured
- [ ] Error tracking implemented

**Documentation:**
- [ ] API documentation complete
- [ ] CLI tool documentation
- [ ] Deployment guide
- [ ] Troubleshooting guide
- [ ] User onboarding flow

## 🚀 Launch Sequence

1. **Deploy Backend**: Use your preferred platform (Railway, Render, AWS, etc.)
2. **Deploy Frontend**: Deploy to Vercel, Netlify, or similar
3. **Publish CLI**: Publish to npm registry
4. **Test End-to-End**: Full user journey from signup to API usage
5. **Monitor**: Watch metrics and logs for issues
6. **Document**: Create user guides and API documentation

The application is now ready for production use with intelligent caching, real-time monitoring, and a complete management interface!# Claude Code Prompt: LLM Caching Proxy with Supabase

Build a complete LLM caching proxy application that sits between clients and commercial LLM APIs to reduce costs through intelligent caching using semantic similarity.

## Project Overview

Create an application with the following components across 4 phases:
1. **Phase 1**: Database Setup & Basic API Structure
2. **Phase 2**: Core Caching Logic & LLM Integration  
3. **Phase 3**: Frontend Dashboard & Authentication
4. **Phase 4**: CLI Tool & Production Polish

Each phase includes completion criteria and functional tests to verify the implementation works correctly before proceeding to the next phase.

## Core Requirements

### 1. Backend API (FastAPI)

**File Structure:**
```
app/
├── main.py                 # FastAPI app entry point
├── models/                 # Pydantic models
│   ├── __init__.py
│   ├── cache.py           # Cache entry models
│   └── api.py             # API request/response models
├── services/              # Business logic
│   ├── __init__.py
│   ├── cache_service.py   # Core caching logic
│   ├── embedding_service.py # OpenAI embeddings
│   └── llm_service.py     # LLM provider integrations
├── database/              # Database operations
│   ├── __init__.py
│   ├── supabase_client.py # Supabase connection
│   └── queries.py         # SQL queries and operations
├── config.py              # Configuration management
└── utils.py               # Utility functions
```

**Key Features:**
- Proxy endpoints that match OpenAI API format (`/v1/chat/completions`)
- Support for multiple LLM providers (OpenAI, Anthropic)
- Semantic similarity search using cosine similarity
- Configurable similarity thresholds per user
- API key authentication and rate limiting
- Comprehensive logging and metrics
- Automatic cache expiration and cleanup

**Cache Logic Flow:**
1. Receive LLM request
2. Generate query hash for exact matching
3. Check exact match cache first
4. If no exact match, generate embedding
5. Perform semantic similarity search (threshold: 0.85)
6. If similar query found, return cached response
7. If cache miss, call actual LLM API
8. Store response with embedding in cache
9. Return response to client with cache metadata

### 2. Supabase Database Schema

**Tables to create:**
- `cache_entries` - Store cached LLM responses with embeddings
- `api_keys` - User API key management
- `usage_logs` - Track usage and cost savings
- `users` - User accounts (use Supabase auth)

**Required SQL:**
- Enable pgvector extension
- Create vector similarity search function
- Set up proper indexes for performance
- Row Level Security policies for multi-tenancy

### 3. Frontend Dashboard (Next.js/React)

**Pages needed:**
- `/login` - Authentication with Supabase
- `/dashboard` - Main overview with metrics
- `/api-keys` - API key management
- `/cache` - Cache entries browser
- `/analytics` - Usage and savings analytics
- `/settings` - Configuration and thresholds

**Key Components:**
- Real-time metrics using Supabase subscriptions
- Cost savings calculator and visualizations
- Cache hit rate charts
- API key generation and management
- Cache entry search and inspection

### 4. CLI Tool

**Commands to implement:**
- `llm-cache init` - Initialize configuration
- `llm-cache test` - Test API connectivity
- `llm-cache stats` - Show cache statistics
- `llm-cache clear` - Clear cache entries
- `llm-cache config` - Manage configuration

## Technical Specifications

### Environment Variables
```
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
JWT_SECRET=your-jwt-secret
REDIS_URL=optional-redis-url
```

### API Endpoints

**Core Proxy Endpoints:**
- `POST /v1/chat/completions` - OpenAI-compatible chat endpoint
- `POST /v1/claude/messages` - Anthropic-compatible endpoint

**Management Endpoints:**
- `GET /api/stats` - Cache statistics
- `GET /api/cache` - List cache entries
- `DELETE /api/cache/{id}` - Delete cache entry
- `POST /api/keys` - Generate API key
- `GET /api/usage` - Usage analytics

### Caching Strategy

**Exact Match (L1 Cache):**
- SHA-256 hash of normalized request
- Instant lookup, highest priority

**Semantic Match (L2 Cache):**
- OpenAI text-embedding-ada-002 embeddings
- Cosine similarity with configurable threshold
- pgvector for fast similarity search

**Cache Policies:**
- Default TTL: 24 hours
- Different TTL for different content types
- Manual cache invalidation
- Automatic cleanup of expired entries

### Performance Requirements
- Cache lookup should be < 50ms
- API response time should be < 200ms for cache hits
- Support for 1000+ requests per minute
- Vector similarity search should handle 100K+ cache entries

## Implementation Guidelines

### Code Quality
- Use proper TypeScript/Python type hints
- Implement comprehensive error handling
- Add detailed logging with structured format
- Write unit tests for core functionality
- Use environment-based configuration

### Security
- Validate all inputs and sanitize data
- Implement rate limiting per API key
- Use Supabase Row Level Security
- Secure API key generation and storage
- Audit logging for security events

### Monitoring & Observability
- Track cache hit rates and cost savings
- Monitor API response times
- Log all cache operations
- Implement health check endpoints
- Cost tracking per user/API key

## Specific Implementation Details

### Embedding Generation
- Use OpenAI text-embedding-ada-002
- Batch multiple requests when possible
- Cache embeddings to avoid regeneration
- Handle embedding API failures gracefully

### Similarity Matching
- Start with 0.85 cosine similarity threshold
- Make threshold configurable per user
- Consider query preprocessing/normalization
- Handle edge cases (very short queries, etc.)

### Multi-tenant Architecture
- Isolate cache entries by user/API key
- Separate usage tracking per tenant
- Configurable cache policies per user
- Fair usage quotas and rate limiting

## Deployment Instructions

### Local Development
- Set up Supabase local development environment
- Use Docker Compose for local Redis (if needed)
- Environment configuration for development
- Database migration scripts

### Production Deployment
- Deploy FastAPI to Railway/Render/Vercel
- Deploy frontend to Vercel/Netlify
- Use production Supabase instance
- Set up monitoring and alerting

## Success Metrics

The application should demonstrate:
- 30-60% cache hit rate for typical workloads
- 50-80% cost reduction for cached queries
- Sub-100ms response time for cache hits
- Support for multiple concurrent users
- Clear ROI demonstration for users

## Additional Features (Nice to Have)

- A/B testing framework for cache policies
- Custom embedding models for domain-specific use
- Integration with popular LLM libraries (LangChain, etc.)
- Webhook notifications for cache events
- Advanced analytics and reporting
- Multi-region deployment support

Build this as a production-ready application with proper error handling, logging, testing, and documentation. Focus on creating a clean, maintainable codebase that can scale and be easily extended.

# Multi-Tier Pricing System Implementation Prompt

Implement a comprehensive 4-tier pricing system (Free, Paid, Paid Plus, Enterprise) for the LLM caching application with usage tracking, billing integration, and feature gating.

## Pricing Tier Structure

### **Free Tier - "Developer"**
**Target**: Individual developers, small projects, proof of concept
**Price**: $0/month
**Limits**:
- 1,000 API requests/month
- 1 API key
- 24-hour cache retention
- Community support only
- Standard similarity threshold (0.85)
- Basic analytics (7 days)

### **Paid Tier - "Startup"** 
**Target**: Small teams, growing startups, small businesses
**Price**: $29/month
**Limits**:
- 25,000 API requests/month
- 5 API keys
- 7-day cache retention
- Email support
- Configurable similarity threshold
- Advanced analytics (30 days)
- Basic webhooks

**Overage**: $0.002 per additional request

### **Paid Plus Tier - "Business"**
**Target**: Medium businesses, scaling companies
**Price**: $199/month  
**Limits**:
- 500,000 API requests/month
- 25 API keys
- 30-day cache retention
- Priority email + chat support
- Custom similarity thresholds per endpoint
- Full analytics (90 days)
- Advanced webhooks
- A/B testing for cache policies
- Custom cache TTL
- SSO integration (Google, Microsoft)

**Overage**: $0.0015 per additional request

### **Enterprise Tier - "Scale"**
**Target**: Large enterprises, high-volume applications
**Price**: Custom pricing (starting at $999/month)
**Features**:
- Unlimited API requests (or custom high limits)
- Unlimited API keys
- Custom cache retention
- Dedicated account manager
- SLA guarantees (99.9% uptime)
- Custom integrations
- Advanced security features
- White-label options
- On-premise deployment option
- Custom similarity algorithms
- Priority feature requests
- 24/7 phone support

## Implementation Requirements

### 1. Database Schema Updates

**Add subscription management tables:**
```sql
-- Subscription plans
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- 'free', 'startup', 'business', 'enterprise'
    display_name TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    monthly_requests INTEGER, -- NULL for unlimited
    max_api_keys INTEGER NOT NULL DEFAULT 1,
    cache_retention_days INTEGER NOT NULL DEFAULT 1,
    features JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) UNIQUE,
    plan_id UUID REFERENCES subscription_plans(id),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'active', -- active, cancelled, past_due
    trial_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE monthly_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    month_year TEXT NOT NULL, -- '2024-01'
    requests_used INTEGER DEFAULT 0,
    overage_requests INTEGER DEFAULT 0,
    cost_saved DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, month_year)
);

-- Feature flags
CREATE TABLE user_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    feature_name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, feature_name)
);

-- Insert default plans
INSERT INTO subscription_plans (name, display_name, price_cents, monthly_requests, max_api_keys, cache_retention_days, features) VALUES 
('free', 'Developer', 0, 1000, 1, 1, '{"support": "community", "analytics_days": 7, "similarity_config": false}'),
('startup', 'Startup', 2900, 25000, 5, 7, '{"support": "email", "analytics_days": 30, "similarity_config": true, "webhooks": "basic"}'),
('business', 'Business', 19900, 500000, 25, 30, '{"support": "priority", "analytics_days": 90, "similarity_config": "advanced", "webhooks": "advanced", "ab_testing": true, "sso": true}'),
('enterprise', 'Scale', 99900, NULL, NULL, NULL, '{"support": "dedicated", "analytics_days": 365, "similarity_config": "custom", "webhooks": "enterprise", "sla": true, "white_label": true}');
```

### 2. Subscription Management Service

**Create subscription service:**
```python
# services/subscription_service.py
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import calendar
from app.database.supabase_client import supabase_client

class SubscriptionService:
    def __init__(self):
        self.client = supabase_client.client
    
    async def get_user_subscription(self, user_id: str) -> Dict[str, Any]:
        """Get user's current subscription with plan details"""
        result = self.client.table("user_subscriptions").select("""
            *,
            subscription_plans (
                name, display_name, price_cents, monthly_requests, 
                max_api_keys, cache_retention_days, features
            )
        """).eq("user_id", user_id).single().execute()
        
        if not result.data:
            # Create free tier subscription for new users
            return await self.assign_free_plan(user_id)
        
        return result.data
    
    async def assign_free_plan(self, user_id: str) -> Dict[str, Any]:
        """Assign free plan to new user"""
        free_plan = self.client.table("subscription_plans").select("*").eq("name", "free").single().execute()
        
        subscription_data = {
            "user_id": user_id,
            "plan_id": free_plan.data["id"],
            "status": "active",
            "current_period_start": datetime.now().isoformat(),
            "current_period_end": (datetime.now() + timedelta(days=30)).isoformat()
        }
        
        result = self.client.table("user_subscriptions").insert(subscription_data).execute()
        return result.data[0]
    
    async def check_usage_limits(self, user_id: str) -> Dict[str, Any]:
        """Check if user has exceeded usage limits"""
        subscription = await self.get_user_subscription(user_id)
        plan = subscription["subscription_plans"]
        
        # Get current month usage
        current_month = datetime.now().strftime("%Y-%m")
        usage_result = self.client.table("monthly_usage").select("*").eq("user_id", user_id).eq("month_year", current_month).single().execute()
        
        current_usage = usage_result.data["requests_used"] if usage_result.data else 0
        monthly_limit = plan["monthly_requests"]
        
        return {
            "within_limits": monthly_limit is None or current_usage < monthly_limit,
            "current_usage": current_usage,
            "monthly_limit": monthly_limit,
            "overage": max(0, current_usage - (monthly_limit or 0)) if monthly_limit else 0,
            "plan_name": plan["name"]
        }
    
    async def increment_usage(self, user_id: str, requests_count: int = 1) -> None:
        """Increment user's monthly usage"""
        current_month = datetime.now().strftime("%Y-%m")
        
        # Upsert monthly usage
        self.client.table("monthly_usage").upsert({
            "user_id": user_id,
            "month_year": current_month,
            "requests_used": requests_count
        }, on_conflict="user_id,month_year").execute()
    
    async def can_create_api_key(self, user_id: str) -> bool:
        """Check if user can create more API keys"""
        subscription = await self.get_user_subscription(user_id)
        plan = subscription["subscription_plans"]
        
        current_keys = self.client.table("api_keys").select("id").eq("user_id", user_id).eq("is_active", True).execute()
        current_count = len(current_keys.data) if current_keys.data else 0
        
        max_keys = plan["max_api_keys"]
        return max_keys is None or current_count < max_keys
    
    async def has_feature(self, user_id: str, feature_name: str) -> bool:
        """Check if user has access to a specific feature"""
        subscription = await self.get_user_subscription(user_id)
        plan_features = subscription["subscription_plans"]["features"]
        
        # Check plan-level features
        if feature_name in plan_features:
            return plan_features[feature_name] is not False
        
        # Check user-level feature flags
        feature_result = self.client.table("user_features").select("enabled").eq("user_id", user_id).eq("feature_name", feature_name).single().execute()
        
        return feature_result.data["enabled"] if feature_result.data else False

subscription_service = SubscriptionService()
```

### 3. Usage Middleware

**Create usage tracking middleware:**
```python
# middleware/usage_middleware.py
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.subscription_service import subscription_service
import time

class UsageTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip usage tracking for non-API routes
        if not request.url.path.startswith("/api/v1/"):
            return await call_next(request)
        
        # Get user from request (set by auth middleware)
        user_id = getattr(request.state, 'user_id', None)
        if not user_id:
            return await call_next(request)
        
        # Check usage limits before processing request
        usage_status = await subscription_service.check_usage_limits(user_id)
        
        if not usage_status["within_limits"]:
            # For free tier, block the request
            if usage_status["plan_name"] == "free":
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "Monthly limit exceeded",
                        "current_usage": usage_status["current_usage"],
                        "limit": usage_status["monthly_limit"],
                        "upgrade_url": "/pricing"
                    }
                )
        
        # Process the request
        start_time = time.time()
        response = await call_next(request)
        
        # Track usage if request was successful
        if 200 <= response.status_code < 300:
            await subscription_service.increment_usage(user_id)
        
        return response
```

### 4. Feature Gate Decorators

**Create feature gating system:**
```python
# utils/feature_gates.py
from functools import wraps
from fastapi import HTTPException, Depends
from app.services.subscription_service import subscription_service

def requires_feature(feature_name: str):
    """Decorator to gate features by subscription plan"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract user_id from request or dependencies
            user_id = kwargs.get('current_user_id') or kwargs.get('user_id')
            if not user_id:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            has_access = await subscription_service.has_feature(user_id, feature_name)
            if not has_access:
                raise HTTPException(
                    status_code=403, 
                    detail={
                        "error": f"Feature '{feature_name}' requires upgrade",
                        "upgrade_url": "/pricing"
                    }
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

def requires_plan(min_plan: str):
    """Decorator to require minimum plan level"""
    plan_hierarchy = {"free": 0, "startup": 1, "business": 2, "enterprise": 3}
    
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user_id = kwargs.get('current_user_id') or kwargs.get('user_id')
            subscription = await subscription_service.get_user_subscription(user_id)
            user_plan = subscription["subscription_plans"]["name"]
            
            if plan_hierarchy.get(user_plan, 0) < plan_hierarchy.get(min_plan, 999):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": f"This feature requires {min_plan} plan or higher",
                        "current_plan": user_plan,
                        "upgrade_url": "/pricing"
                    }
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator
```

### 5. Billing Integration (Stripe)

**Stripe integration service:**
```python
# services/billing_service.py
import stripe
from app.config import settings
from app.services.subscription_service import subscription_service

stripe.api_key = settings.stripe_secret_key

class BillingService:
    def __init__(self):
        self.price_ids = {
            "startup": settings.stripe_startup_price_id,
            "business": settings.stripe_business_price_id,
            "enterprise": settings.stripe_enterprise_price_id
        }
    
    async def create_checkout_session(self, user_id: str, plan_name: str, success_url: str, cancel_url: str):
        """Create Stripe checkout session for plan upgrade"""
        try:
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price': self.price_ids[plan_name],
                    'quantity': 1,
                }],
                mode='subscription',
                success_url=success_url,
                cancel_url=cancel_url,
                client_reference_id=user_id,
                metadata={
                    'user_id': user_id,
                    'plan_name': plan_name
                }
            )
            return session.url
        except Exception as e:
            raise Exception(f"Failed to create checkout session: {str(e)}")
    
    async def handle_successful_payment(self, session_id: str):
        """Handle successful payment webhook"""
        session = stripe.checkout.Session.retrieve(session_id)
        user_id = session.client_reference_id
        plan_name = session.metadata['plan_name']
        
        # Update user subscription
        await subscription_service.upgrade_plan(user_id, plan_name, session.subscription)
    
    async def calculate_overage_cost(self, user_id: str) -> float:
        """Calculate overage charges for current month"""
        usage_status = await subscription_service.check_usage_limits(user_id)
        subscription = await subscription_service.get_user_subscription(user_id)
        plan_name = subscription["subscription_plans"]["name"]
        
        if usage_status["overage"] == 0:
            return 0.0
        
        # Overage rates per plan
        overage_rates = {
            "startup": 0.002,    # $0.002 per request
            "business": 0.0015,  # $0.0015 per request
            "enterprise": 0.001  # $0.001 per request
        }
        
        rate = overage_rates.get(plan_name, 0)
        return usage_status["overage"] * rate

billing_service = BillingService()
```

### 6. API Endpoints for Subscription Management

**Subscription API routes:**
```python
# routers/subscription.py
from fastapi import APIRouter, Depends, HTTPException
from app.services.subscription_service import subscription_service
from app.services.billing_service import billing_service
from app.utils.feature_gates import requires_plan, requires_feature

router = APIRouter()

@router.get("/subscription")
async def get_subscription(current_user_id: str = Depends(get_current_user)):
    """Get user's current subscription details"""
    subscription = await subscription_service.get_user_subscription(current_user_id)
    usage_status = await subscription_service.check_usage_limits(current_user_id)
    
    return {
        "subscription": subscription,
        "usage": usage_status,
        "overage_cost": await billing_service.calculate_overage_cost(current_user_id)
    }

@router.post("/subscription/upgrade")
async def create_upgrade_session(
    plan_name: str,
    current_user_id: str = Depends(get_current_user)
):
    """Create Stripe checkout session for plan upgrade"""
    if plan_name not in ["startup", "business", "enterprise"]:
        raise HTTPException(status_code=400, detail="Invalid plan name")
    
    checkout_url = await billing_service.create_checkout_session(
        user_id=current_user_id,
        plan_name=plan_name,
        success_url="https://yourdomain.com/success",
        cancel_url="https://yourdomain.com/cancel"
    )
    
    return {"checkout_url": checkout_url}

@router.get("/subscription/usage")
async def get_usage_details(
    current_user_id: str = Depends(get_current_user)
):
    """Get detailed usage statistics"""
    # Get last 12 months of usage
    usage_history = []  # Implement usage history query
    current_usage = await subscription_service.check_usage_limits(current_user_id)
    
    return {
        "current_month": current_usage,
        "history": usage_history
    }

@router.post("/api-keys")
@requires_feature("multiple_api_keys")
async def create_api_key_with_limits(
    key_name: str,
    current_user_id: str = Depends(get_current_user)
):
    """Create API key with subscription limits"""
    can_create = await subscription_service.can_create_api_key(current_user_id)
    if not can_create:
        raise HTTPException(
            status_code=403,
            detail="API key limit reached for your plan"
        )
    
    # Create API key logic here
    return {"message": "API key created"}
```

### 7. Frontend Pricing Components

**React pricing component:**
```typescript
// components/Pricing/PricingTiers.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const pricingTiers = [
  {
    name: 'Developer',
    price: 0,
    period: 'forever',
    description: 'Perfect for getting started',
    features: [
      '1,000 requests/month',
      '1 API key',
      '24-hour cache retention',
      'Community support',
      'Basic analytics'
    ],
    limitations: ['No custom similarity'],
    cta: 'Get Started Free',
    popular: false
  },
  {
    name: 'Startup',
    price: 29,
    period: 'month',
    description: 'For growing teams',
    features: [
      '25,000 requests/month',
      '5 API keys',
      '7-day cache retention',
      'Email support',
      'Advanced analytics',
      'Custom similarity threshold',
      'Basic webhooks'
    ],
    cta: 'Start Free Trial',
    popular: true
  },
  {
    name: 'Business',
    price: 199,
    period: 'month',
    description: 'For scaling companies',
    features: [
      '500,000 requests/month',
      '25 API keys',
      '30-day cache retention',
      'Priority support',
      'Full analytics suite',
      'A/B testing',
      'Advanced webhooks',
      'SSO integration'
    ],
    cta: 'Start Free Trial',
    popular: false
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations',
    features: [
      'Unlimited requests',
      'Unlimited API keys',
      'Custom cache retention',
      'Dedicated support',
      'SLA guarantees',
      'White-label options',
      'On-premise deployment',
      'Custom integrations'
    ],
    cta: 'Contact Sales',
    popular: false
  }
]

export const PricingTiers = () => {
  const [annual, setAnnual] = useState(false)

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
      {pricingTiers.map((tier) => (
        <Card key={tier.name} className={`relative ${tier.popular ? 'border-blue-500 border-2' : ''}`}>
          {tier.popular && (
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500">
              Most Popular
            </Badge>
          )}
          <CardHeader>
            <CardTitle>{tier.name}</CardTitle>
            <div className="text-3xl font-bold">
              {typeof tier.price === 'number' ? (
                <>
                  ${tier.price}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{tier.period}
                  </span>
                </>
              ) : (
                tier.price
              )}
            </div>
            <p className="text-muted-foreground">{tier.description}</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button className="w-full" variant={tier.popular ? 'default' : 'outline'}>
              {tier.cta}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

### 8. Usage Dashboard Component

**Usage tracking dashboard:**
```typescript
// components/Dashboard/UsageDashboard.tsx
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

export const UsageDashboard = () => {
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    fetchUsageData()
  }, [])

  const fetchUsageData = async () => {
    const response = await fetch('/api/subscription/usage')
    const data = await response.json()
    setUsage(data)
  }

  if (!usage) return <div>Loading...</div>

  const usagePercentage = usage.current_month.monthly_limit 
    ? (usage.current_month.current_usage / usage.current_month.monthly_limit) * 100
    : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Monthly Usage
            <Badge variant={usagePercentage > 80 ? 'destructive' : 'secondary'}>
              {usage.current_month.plan_name}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span>Requests Used</span>
                <span>
                  {usage.current_month.current_usage.toLocaleString()} / {' '}
                  {usage.current_month.monthly_limit?.toLocaleString() || 'Unlimited'}
                </span>
              </div>
              <Progress value={usagePercentage} className="mt-2" />
            </div>
            
            {usage.current_month.overage > 0 && (
              <div className="p-4 bg-orange-50 rounded-lg">
                <h4 className="font-semibold text-orange-800">Overage Usage</h4>
                <p className="text-orange-700">
                  {usage.current_month.overage.toLocaleString()} extra requests
                </p>
                <p className="text-sm text-orange-600">
                  Additional charges: ${usage.overage_cost?.toFixed(2) || '0.00'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

## Implementation Testing

### Test Cases for Pricing Tiers

**Feature Gate Testing:**
```python
# Test feature access by plan
async def test_free_tier_limits():
    # Should block after 1000 requests
    # Should only allow 1 API key
    # Should not have access to advanced features

async def test_startup_tier_features():
    # Should allow custom similarity threshold
    # Should allow 5 API keys
    # Should have email support access

async def test_business_tier_features():
    # Should allow A/B testing
    # Should have SSO integration
    # Should allow 25 API keys

async def test_enterprise_tier_features():
    # Should have unlimited everything
    # Should have white-label options
    # Should have dedicated support
```

This comprehensive pricing tier system will:
- ✅ Generate recurring revenue across different customer segments
- ✅ Create clear upgrade incentives
- ✅ Track usage and enforce limits automatically
- ✅ Integrate with Stripe for seamless billing
- ✅ Provide feature gating for plan differentiation
- ✅ Support both self-serve and enterprise sales models

The implementation focuses on converting free users to paid plans through usage limits and feature restrictions, while providing clear value at each tier.

# Security Hardening Prompt for LLM Cache Application

Implement comprehensive security measures to protect the LLM caching application against all known vulnerabilities. Focus on defense-in-depth, zero-trust architecture, and industry security best practices.

## Core Security Requirements

### 1. Authentication & Authorization Security

**Implement Multi-Factor Authentication:**
```python
# Add to FastAPI backend
- JWT tokens with short expiration (15 minutes)
- Refresh tokens with rotation
- API key authentication with scopes and rate limiting
- Support for OAuth2 with PKCE
- Session management with secure cookies
```

**Authorization Framework:**
```python
# Role-based access control (RBAC)
- User roles: admin, user, read-only
- Resource-based permissions
- API endpoint authorization decorators
- Supabase Row Level Security (RLS) policies
- Principle of least privilege enforcement
```

### 2. Input Validation & Sanitization

**Comprehensive Input Validation:**
```python
# Implement strict validation for all inputs
- Pydantic models with field validation
- Request size limits (max 1MB per request)
- Content-type validation
- SQL injection prevention
- NoSQL injection prevention
- Command injection prevention
- Path traversal prevention
- JSON schema validation
- Regular expression validation for all string inputs
```

**Data Sanitization:**
```python
# Sanitize all user inputs
- HTML entity encoding
- JavaScript escaping
- SQL parameterized queries only
- Input length restrictions
- Character whitelist validation
- File upload validation (if applicable)
```

### 3. API Security Hardening

**Rate Limiting & DDoS Protection:**
```python
# Implement multiple layers of rate limiting
- Per-IP rate limiting (100 requests/minute)
- Per-API-key rate limiting (1000 requests/hour)
- Sliding window rate limiting
- Exponential backoff for failed requests
- CAPTCHA integration for suspicious activity
- Request queue management
```

**API Security Headers:**
```python
# Add comprehensive security headers
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy
```

### 4. Data Protection & Encryption

**Data Encryption:**
```python
# Encrypt sensitive data at rest and in transit
- TLS 1.3 for all communications
- AES-256 encryption for sensitive cache data
- Database field-level encryption
- API key encryption in database
- Secure key management with rotation
- Environment variable encryption
```

**Data Privacy:**
```python
# Implement data privacy controls
- PII detection and masking
- Data retention policies
- Right to be forgotten implementation
- Audit logging for data access
- Data anonymization for analytics
- GDPR compliance measures
```

### 5. Database Security

**Supabase Security Hardening:**
```sql
-- Implement comprehensive database security
-- Row Level Security policies
CREATE POLICY "Users can only access their own data" ON cache_entries
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "API keys are user-scoped" ON api_keys
    FOR ALL USING (auth.uid() = user_id);

-- Database connection security
- Use connection pooling with limits
- Implement prepared statements only
- Database user with minimal privileges
- Regular security updates
- Database activity monitoring
```

### 6. Secrets Management

**Secure Configuration:**
```python
# Implement secure secrets management
- Environment-based configuration
- No hardcoded secrets in code
- Secret rotation capabilities
- Encrypted configuration files
- Vault integration for production
- Separate secrets per environment
```

### 7. Logging & Monitoring

**Security Monitoring:**
```python
# Comprehensive security logging
- Authentication attempts (success/failure)
- Authorization failures
- Rate limit violations
- Suspicious activity patterns
- Database access logs
- API usage anomalies
- Error tracking with sanitized messages
- Real-time alerting for security events
```

**Audit Trail:**
```python
# Maintain detailed audit logs
- User actions with timestamps
- Data access and modifications
- Administrative actions
- Configuration changes
- API key usage
- Cache access patterns
- Compliance reporting
```

### 8. Infrastructure Security

**Container & Deployment Security:**
```dockerfile
# Secure Docker configuration
- Non-root user execution
- Minimal base images (distroless/alpine)
- Regular vulnerability scanning
- Read-only file systems where possible
- Resource limits and quotas
- Health check implementations
- Security context configurations
```

**Network Security:**
```yaml
# Network hardening
- VPC/network isolation
- Firewall rules (allow only necessary ports)
- Load balancer with SSL termination
- WAF (Web Application Firewall)
- DDoS protection
- Internal service mesh security
```

### 9. Error Handling & Information Disclosure

**Secure Error Handling:**
```python
# Prevent information leakage
- Generic error messages for users
- Detailed logging for developers only
- No stack traces in production responses
- Custom error pages
- Error code mapping
- Sanitized error responses
```

### 10. Frontend Security

**React/Next.js Security:**
```typescript
// Frontend security measures
- Content Security Policy implementation
- XSS prevention with sanitization
- CSRF protection
- Secure cookie configuration
- localStorage security
- Dependency vulnerability scanning
- Source map protection in production
```

## Implementation Checklist

### Phase 1: Core Security (Week 1-2)
- [ ] Implement JWT authentication with refresh tokens
- [ ] Add input validation on all endpoints
- [ ] Configure security headers
- [ ] Implement rate limiting
- [ ] Set up basic logging

### Phase 2: Data Protection (Week 3)
- [ ] Encrypt sensitive data fields
- [ ] Implement Row Level Security
- [ ] Add audit logging
- [ ] Configure secrets management
- [ ] Implement data retention policies

### Phase 3: Advanced Security (Week 4)
- [ ] Add threat detection
- [ ] Implement security monitoring
- [ ] Configure WAF rules
- [ ] Add vulnerability scanning
- [ ] Implement incident response procedures

## Security Testing Requirements

**Automated Security Testing:**
```bash
# Implement comprehensive security testing
- SAST (Static Application Security Testing)
- DAST (Dynamic Application Security Testing)
- Dependency vulnerability scanning
- Container security scanning
- Infrastructure as Code security scanning
- Regular penetration testing
```

**Security Test Cases:**
```python
# Test all common vulnerabilities
- SQL injection attempts
- XSS attacks
- CSRF attacks
- Authentication bypass
- Authorization escalation
- Rate limit bypass
- Data exposure tests
- Session hijacking
- API fuzzing
```

## Compliance & Standards

**Security Standards Compliance:**
- OWASP Top 10 compliance
- SOC 2 Type II preparation
- ISO 27001 alignment
- GDPR compliance
- CCPA compliance
- Industry-specific requirements

**Regular Security Reviews:**
- Monthly security assessments
- Quarterly penetration testing
- Annual third-party security audits
- Continuous vulnerability monitoring
- Security training for development team

## Incident Response Plan

**Security Incident Procedures:**
```python
# Implement incident response workflow
- Automated threat detection
- Incident classification system
- Response team notification
- Containment procedures
- Evidence collection
- Recovery processes
- Post-incident analysis
- Stakeholder communication
```

## Security Configuration Examples

**FastAPI Security Middleware:**
```python
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

**Secure API Endpoint Example:**
```python
@app.post("/api/v1/chat/completions")
@limiter.limit("100/minute")
async def secure_chat_endpoint(
    request: Request,
    chat_request: SecureChatRequest,  # Validated Pydantic model
    current_user: User = Depends(get_authenticated_user),
    api_key: str = Depends(validate_api_key)
):
    # Input validation, rate limiting, and security checks implemented
    pass
```

This comprehensive security implementation will protect against:
- OWASP Top 10 vulnerabilities
- Common API security threats
- Data breaches and unauthorized access
- DDoS and abuse attacks
- Insider threats
- Supply chain attacks
- Compliance violations

Regular security reviews and updates should be conducted to maintain protection against emerging threats.