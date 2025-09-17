from fastapi import Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import time
import logging
from typing import Callable, Optional
from app.services.subscription_service import subscription_service
from app.models.auth import get_user_from_api_key

logger = logging.getLogger(__name__)

class UsageTrackingMiddleware(BaseHTTPMiddleware):
    """Middleware to track API usage and enforce subscription limits"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.excluded_paths = {
            "/",
            "/health",
            "/docs",
            "/openapi.json",
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",
            "/api/subscriptions/plans",
            "/api/subscriptions/webhook"
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip tracking for excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)

        # Skip non-API paths
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        # Skip OPTIONS requests
        if request.method == "OPTIONS":
            return await call_next(request)

        start_time = time.time()
        user_id = None
        api_key_id = None
        is_cache_hit = False
        tokens_saved = 0
        cost_saved = 0.0

        try:
            # Extract user information
            user_id, api_key_id = await self._get_user_info(request)

            if user_id:
                # Check usage limits before processing request
                can_proceed, limit_message = await subscription_service.check_usage_limits(user_id)

                if not can_proceed:
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "error": "Usage limit exceeded",
                            "message": limit_message,
                            "code": "USAGE_LIMIT_EXCEEDED"
                        }
                    )

            # Process the request
            response = await call_next(request)

            # Extract cache information from response headers (set by cache service)
            if hasattr(response, 'headers'):
                is_cache_hit = response.headers.get("X-Cache-Hit") == "true"
                tokens_saved = int(response.headers.get("X-Tokens-Saved", 0))
                cost_saved = float(response.headers.get("X-Cost-Saved", 0.0))

            # Track usage if user is identified
            if user_id:
                await self._track_usage(
                    user_id=user_id,
                    api_key_id=api_key_id,
                    is_cache_hit=is_cache_hit,
                    tokens_saved=tokens_saved,
                    cost_saved=cost_saved,
                    response_time_ms=int((time.time() - start_time) * 1000),
                    status_code=response.status_code
                )

            return response

        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            logger.error(f"Error in usage tracking middleware: {e}")
            # Continue with request even if tracking fails
            return await call_next(request)

    async def _get_user_info(self, request: Request) -> tuple[Optional[str], Optional[str]]:
        """Extract user ID and API key ID from request"""
        try:
            # Check for API key in headers
            api_key = request.headers.get("X-API-Key")
            if api_key:
                user_data = await get_user_from_api_key(api_key)
                if user_data:
                    return user_data["user_id"], user_data["api_key_id"]

            # Check for JWT token in Authorization header
            authorization = request.headers.get("Authorization")
            if authorization and authorization.startswith("Bearer "):
                token = authorization.split(" ")[1]
                # You would implement JWT token validation here
                # For now, return None
                pass

            return None, None

        except Exception as e:
            logger.error(f"Error extracting user info: {e}")
            return None, None

    async def _track_usage(self, user_id: str, api_key_id: Optional[str],
                          is_cache_hit: bool, tokens_saved: int, cost_saved: float,
                          response_time_ms: int, status_code: int):
        """Track usage in database"""
        try:
            # Update monthly usage counters
            if is_cache_hit:
                await subscription_service.increment_usage(
                    user_id=user_id,
                    is_cache_hit=True,
                    tokens_saved=tokens_saved,
                    cost_saved=cost_saved
                )
            else:
                await subscription_service.increment_usage(
                    user_id=user_id,
                    is_cache_hit=False
                )

            # Log detailed usage
            await self._log_detailed_usage(
                user_id=user_id,
                api_key_id=api_key_id,
                is_cache_hit=is_cache_hit,
                tokens_saved=tokens_saved,
                cost_saved=cost_saved,
                response_time_ms=response_time_ms,
                status_code=status_code
            )

        except Exception as e:
            logger.error(f"Error tracking usage for user {user_id}: {e}")

    async def _log_detailed_usage(self, user_id: str, api_key_id: Optional[str],
                                 is_cache_hit: bool, tokens_saved: int,
                                 cost_saved: float, response_time_ms: int,
                                 status_code: int):
        """Log detailed usage information"""
        try:
            from database.supabase_client import supabase_client

            usage_data = {
                "user_id": user_id,
                "api_key_id": api_key_id,
                "cache_hit": is_cache_hit,
                "tokens_used": 0 if is_cache_hit else tokens_saved,  # Actual tokens would be calculated differently
                "cost": 0 if is_cache_hit else cost_saved,  # Actual cost would be calculated differently
                "response_time_ms": response_time_ms,
                "status_code": status_code
            }

            await supabase_client.table("usage_logs").insert(usage_data).execute()

        except Exception as e:
            logger.error(f"Error logging detailed usage: {e}")

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware based on subscription tiers"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        # Rate limits per minute by plan
        self.rate_limits = {
            "free": 10,      # 10 requests per minute
            "startup": 100,   # 100 requests per minute
            "business": 500,  # 500 requests per minute
            "enterprise": -1  # Unlimited
        }
        self.request_counts = {}  # In production, use Redis
        self.excluded_paths = {
            "/",
            "/health",
            "/docs",
            "/openapi.json",
            "/api/auth/login",
            "/api/auth/register"
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)

        # Skip non-API paths
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        try:
            # Get user information
            user_id, _ = await self._get_user_info(request)

            if user_id:
                # Check rate limit
                can_proceed = await self._check_rate_limit(user_id)
                if not can_proceed:
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "error": "Rate limit exceeded",
                            "message": "Too many requests. Please slow down.",
                            "code": "RATE_LIMIT_EXCEEDED"
                        },
                        headers={
                            "Retry-After": "60"
                        }
                    )

            return await call_next(request)

        except Exception as e:
            logger.error(f"Error in rate limit middleware: {e}")
            return await call_next(request)

    async def _get_user_info(self, request: Request) -> tuple[Optional[str], Optional[str]]:
        """Extract user ID from request (same as usage middleware)"""
        try:
            api_key = request.headers.get("X-API-Key")
            if api_key:
                user_data = await get_user_from_api_key(api_key)
                if user_data:
                    return user_data["user_id"], user_data["api_key_id"]

            return None, None

        except Exception as e:
            logger.error(f"Error extracting user info for rate limiting: {e}")
            return None, None

    async def _check_rate_limit(self, user_id: str) -> bool:
        """Check if user has exceeded rate limit"""
        try:
            # Get user's subscription details
            details = await subscription_service.get_subscription_details(user_id)
            if not details:
                return True  # Allow if no subscription found

            plan_name = details.plan.name
            rate_limit = self.rate_limits.get(plan_name, 10)

            # Unlimited requests
            if rate_limit == -1:
                return True

            # Check current request count (simplified in-memory implementation)
            current_minute = int(time.time() // 60)
            key = f"{user_id}:{current_minute}"

            current_count = self.request_counts.get(key, 0)
            if current_count >= rate_limit:
                return False

            # Increment counter
            self.request_counts[key] = current_count + 1

            # Clean up old entries (keep only last 2 minutes)
            keys_to_remove = [k for k in self.request_counts.keys()
                            if int(k.split(":")[1]) < current_minute - 1]
            for k in keys_to_remove:
                del self.request_counts[k]

            return True

        except Exception as e:
            logger.error(f"Error checking rate limit for user {user_id}: {e}")
            return True  # Allow on error

class FeatureGateMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce feature-based access control"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        # Define which endpoints require which features
        self.feature_requirements = {
            "/api/analytics/advanced": "advanced_analytics",
            "/api/models/custom": "custom_models",
            "/api/teams": "team_collaboration",
            "/api/cache/advanced": "advanced_caching"
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # Check if this path requires a specific feature
        required_feature = None
        for pattern, feature in self.feature_requirements.items():
            if path.startswith(pattern):
                required_feature = feature
                break

        if not required_feature:
            return await call_next(request)

        try:
            # Get user information
            user_id, _ = await self._get_user_info(request)

            if not user_id:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"error": "Authentication required"}
                )

            # Check if user has the required feature
            has_feature = await subscription_service.has_feature(user_id, required_feature)

            if not has_feature:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "error": "Feature not available",
                        "message": f"This feature requires a higher subscription plan",
                        "required_feature": required_feature,
                        "code": "FEATURE_NOT_AVAILABLE"
                    }
                )

            return await call_next(request)

        except Exception as e:
            logger.error(f"Error in feature gate middleware: {e}")
            return await call_next(request)

    async def _get_user_info(self, request: Request) -> tuple[Optional[str], Optional[str]]:
        """Extract user ID from request"""
        try:
            api_key = request.headers.get("X-API-Key")
            if api_key:
                user_data = await get_user_from_api_key(api_key)
                if user_data:
                    return user_data["user_id"], user_data["api_key_id"]

            return None, None

        except Exception as e:
            logger.error(f"Error extracting user info for feature gate: {e}")
            return None, None