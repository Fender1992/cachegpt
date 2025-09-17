from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

class CacheEntry(BaseModel):
    id: Optional[uuid.UUID] = None
    user_id: uuid.UUID
    query_hash: str
    query_text: str
    query_embedding: Optional[str] = None  # Stored as string in Supabase
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