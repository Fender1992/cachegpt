import hashlib
import json
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging

from app.database.supabase_client import supabase_client
from app.models.cache import CacheEntry, CacheSearchResult
from .embedding_service import embedding_service

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
            result = self.client.table("cache_entries").select("*").eq("query_hash", query_hash).eq("user_id", str(user_id)).single().execute()
            
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
                "query_embedding": str(embedding),  # Supabase stores vector as string
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
            # First get current hit count
            current = self.client.table("cache_entries").select("hit_count").eq("id", str(cache_id)).single().execute()
            new_count = current.data["hit_count"] + 1 if current.data else 1
            
            # Update with new count
            self.client.table("cache_entries").update({
                "hit_count": new_count
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