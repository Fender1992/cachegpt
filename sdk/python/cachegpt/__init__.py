"""
CacheGPT Python SDK
Official Python client for CacheGPT API
"""

from .client import CacheGPT
from .exceptions import (
    CacheGPTError,
    AuthenticationError,
    RateLimitError,
    APIError,
    NetworkError
)
from .models import ChatMessage, ChatResponse, Usage, CacheStats

__version__ = "1.0.0"
__all__ = [
    "CacheGPT",
    "ChatMessage",
    "ChatResponse",
    "Usage",
    "CacheStats",
    "CacheGPTError",
    "AuthenticationError",
    "RateLimitError",
    "APIError",
    "NetworkError"
]