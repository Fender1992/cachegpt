"""
CacheGPT SDK Models
"""

from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime


@dataclass
class ChatMessage:
    """Chat message model"""
    role: str
    content: str

    def to_dict(self) -> Dict[str, str]:
        return {"role": self.role, "content": self.content}

    @classmethod
    def from_dict(cls, data: Dict[str, str]) -> "ChatMessage":
        return cls(role=data["role"], content=data["content"])


@dataclass
class ChatResponse:
    """Chat completion response model"""
    content: str
    cached: bool
    cache_type: Optional[str] = None
    similarity: Optional[float] = None
    cost_saved: float = 0.0
    model: Optional[str] = None
    usage: Optional[Dict[str, int]] = None
    response_time_ms: Optional[int] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ChatResponse":
        return cls(
            content=data.get("content", ""),
            cached=data.get("cached", False),
            cache_type=data.get("cache_type"),
            similarity=data.get("similarity"),
            cost_saved=data.get("cost_saved", 0.0),
            model=data.get("model"),
            usage=data.get("usage"),
            response_time_ms=data.get("response_time_ms")
        )


@dataclass
class Usage:
    """Usage and quota information"""
    used: int
    remaining: int
    total: int
    reset_at: datetime
    period: str = "daily"

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Usage":
        return cls(
            used=data["used"],
            remaining=data["remaining"],
            total=data["total"],
            reset_at=datetime.fromisoformat(data["reset_at"]),
            period=data.get("period", "daily")
        )


@dataclass
class CacheStats:
    """Cache statistics model"""
    total_requests: int
    cache_hits: int
    hit_rate: float
    total_saved: float
    unique_queries: int
    avg_response_time_ms: Optional[float] = None
    model_distribution: Optional[Dict[str, int]] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CacheStats":
        return cls(
            total_requests=data["total_requests"],
            cache_hits=data["cache_hits"],
            hit_rate=data["hit_rate"],
            total_saved=data["total_saved"],
            unique_queries=data["unique_queries"],
            avg_response_time_ms=data.get("avg_response_time_ms"),
            model_distribution=data.get("model_distribution")
        )