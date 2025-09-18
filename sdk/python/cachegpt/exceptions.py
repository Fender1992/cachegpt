"""
CacheGPT SDK Exceptions
"""


class CacheGPTError(Exception):
    """Base exception for all CacheGPT errors"""
    pass


class AuthenticationError(CacheGPTError):
    """Raised when API key is invalid or missing"""
    pass


class RateLimitError(CacheGPTError):
    """Raised when rate limit is exceeded"""

    def __init__(self, message: str, retry_after: int = None):
        super().__init__(message)
        self.retry_after = retry_after


class APIError(CacheGPTError):
    """Raised when API returns an error"""
    pass


class NetworkError(CacheGPTError):
    """Raised when network request fails"""
    pass


class ValidationError(CacheGPTError):
    """Raised when input validation fails"""
    pass