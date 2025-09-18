"""
CacheGPT Python Client
"""

import os
import time
import json
from typing import Optional, List, Dict, Any, Union
from urllib.parse import urljoin
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

from .exceptions import (
    AuthenticationError,
    RateLimitError,
    APIError,
    NetworkError
)
from .models import ChatMessage, ChatResponse, Usage, CacheStats


class CacheGPT:
    """
    CacheGPT API Client

    Example:
        >>> from cachegpt import CacheGPT
        >>> client = CacheGPT(api_key="cgpt_...")
        >>> response = client.chat("Hello, how are you?")
        >>> print(response.content)
    """

    DEFAULT_BASE_URL = "https://api.cachegpt.io"
    DEFAULT_TIMEOUT = 30
    DEFAULT_MAX_RETRIES = 3

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        verify_ssl: bool = True
    ):
        """
        Initialize CacheGPT client

        Args:
            api_key: Your CacheGPT API key (or set CACHEGPT_API_KEY env var)
            base_url: API base URL (or set CACHEGPT_BASE_URL env var)
            timeout: Request timeout in seconds
            max_retries: Maximum number of retries for failed requests
            verify_ssl: Whether to verify SSL certificates
        """
        self.api_key = api_key or os.getenv("CACHEGPT_API_KEY")
        if not self.api_key:
            raise AuthenticationError("API key is required. Set CACHEGPT_API_KEY or pass api_key parameter")

        self.base_url = (base_url or os.getenv("CACHEGPT_BASE_URL", self.DEFAULT_BASE_URL)).rstrip("/")
        self.timeout = timeout
        self.verify_ssl = verify_ssl

        # Setup session with retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

        # Set default headers
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": f"cachegpt-python/{self._get_version()}"
        })

    def _get_version(self) -> str:
        """Get SDK version"""
        try:
            from . import __version__
            return __version__
        except:
            return "1.0.0"

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make HTTP request to API"""
        url = urljoin(self.base_url, endpoint)

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                timeout=self.timeout,
                verify=self.verify_ssl
            )

            # Handle rate limiting
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 60))
                raise RateLimitError(f"Rate limit exceeded. Retry after {retry_after} seconds", retry_after)

            # Handle authentication errors
            if response.status_code == 401:
                raise AuthenticationError("Invalid API key")

            # Handle other errors
            if response.status_code >= 400:
                error_msg = response.json().get("error", response.text)
                raise APIError(f"API error ({response.status_code}): {error_msg}")

            return response.json()

        except requests.exceptions.ConnectionError as e:
            raise NetworkError(f"Connection error: {e}")
        except requests.exceptions.Timeout as e:
            raise NetworkError(f"Request timeout: {e}")
        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Request failed: {e}")

    def chat(
        self,
        message: Union[str, List[ChatMessage]],
        model: str = "gpt-3.5-turbo",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        stream: bool = False
    ) -> ChatResponse:
        """
        Send a chat completion request

        Args:
            message: Message string or list of ChatMessage objects
            model: Model to use (gpt-3.5-turbo, gpt-4, claude-3, etc.)
            temperature: Sampling temperature (0-2)
            max_tokens: Maximum tokens in response
            stream: Whether to stream the response

        Returns:
            ChatResponse object with content, cache status, and usage info

        Example:
            >>> response = client.chat("What is Python?")
            >>> print(response.content)
            >>> print(f"Cached: {response.cached}")
            >>> print(f"Cost saved: ${response.cost_saved:.4f}")
        """
        # Convert string to message format
        if isinstance(message, str):
            messages = [{"role": "user", "content": message}]
        else:
            messages = [msg.to_dict() if hasattr(msg, 'to_dict') else msg for msg in message]

        data = {
            "messages": messages,
            "model": model,
            "temperature": temperature,
            "stream": stream
        }

        if max_tokens:
            data["max_tokens"] = max_tokens

        response = self._make_request("POST", "/v1/chat", data=data)
        return ChatResponse.from_dict(response)

    def get_stats(self, days: int = 7) -> CacheStats:
        """
        Get cache statistics

        Args:
            days: Number of days to include in stats

        Returns:
            CacheStats object with usage metrics

        Example:
            >>> stats = client.get_stats()
            >>> print(f"Hit rate: {stats.hit_rate}%")
            >>> print(f"Total saved: ${stats.total_saved:.2f}")
        """
        params = {"days": days}
        response = self._make_request("GET", "/v1/stats", params=params)
        return CacheStats.from_dict(response)

    def clear_cache(self, older_than_hours: Optional[int] = None) -> Dict[str, Any]:
        """
        Clear cache entries

        Args:
            older_than_hours: Only clear entries older than this many hours

        Returns:
            Dictionary with deletion results
        """
        data = {}
        if older_than_hours:
            data["older_than_hours"] = older_than_hours

        return self._make_request("POST", "/v1/cache/clear", data=data)

    def health_check(self) -> Dict[str, Any]:
        """
        Check API health status

        Returns:
            Dictionary with health status
        """
        return self._make_request("GET", "/v1/health")

    def get_usage(self) -> Usage:
        """
        Get current usage and quota information

        Returns:
            Usage object with quota details
        """
        response = self._make_request("GET", "/v1/usage")
        return Usage.from_dict(response)

    # Convenience methods
    def ask(self, question: str, **kwargs) -> str:
        """
        Simplified chat method that returns just the content

        Args:
            question: The question to ask
            **kwargs: Additional parameters to pass to chat()

        Returns:
            String response content
        """
        response = self.chat(question, **kwargs)
        return response.content