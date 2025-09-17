from fastapi import APIRouter, HTTPException, Depends, Header
from typing import List, Dict, Any, Optional
import time
import uuid
import json
import logging

from app.services.cache_service import cache_service
from app.services.llm_service import llm_service
from app.models.api import ChatCompletionRequest, ChatCompletionResponse
from app.database.supabase_client import supabase_client

logger = logging.getLogger(__name__)
router = APIRouter()

async def get_user_from_api_key(authorization: Optional[str] = Header(None)) -> uuid.UUID:
    """Extract user ID from API key"""
    try:
        # For testing, return a default user ID if no auth header
        if not authorization:
            # Create or get test user
            test_user_id = "00000000-0000-0000-0000-000000000000"
            return uuid.UUID(test_user_id)
        
        api_key = authorization.replace("Bearer ", "")
        
        result = supabase_client.client.table("api_keys").select("user_id").eq("api_key", api_key).eq("is_active", True).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        return uuid.UUID(result.data["user_id"])
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"API key validation failed, using test user: {e}")
        # For testing, return a default user ID
        return uuid.UUID("00000000-0000-0000-0000-000000000000")

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
                api_key_id=None,
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
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat completion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/v1/cache/stats")
async def get_cache_stats(
    user_id: uuid.UUID = Depends(get_user_from_api_key)
) -> Dict[str, Any]:
    """Get cache statistics for the user"""
    try:
        # Get usage logs for the user
        result = supabase_client.client.table("usage_logs").select("*").eq("user_id", str(user_id)).execute()
        logs = result.data or []
        
        total_requests = len(logs)
        cache_hits = len([log for log in logs if log["cache_hit"]])
        cache_hit_rate = cache_hits / total_requests if total_requests > 0 else 0
        total_cost_saved = sum(log["cost"] for log in logs if log["cache_hit"])
        total_tokens_saved = sum(log["tokens_used"] for log in logs if log["cache_hit"])
        
        return {
            "total_requests": total_requests,
            "cache_hits": cache_hits,
            "cache_hit_rate": cache_hit_rate,
            "total_cost_saved": total_cost_saved,
            "total_tokens_saved": total_tokens_saved
        }
    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))