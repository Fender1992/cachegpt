"""Security middleware for the application"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from typing import Optional
import time
import json
import re
from datetime import datetime

# Rate limiter configuration
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per minute", "3000 per hour"],
    storage_uri="memory://"
)

# Rate limit decorator function
def rate_limit(rate: str):
    """Decorator for rate limiting endpoints"""
    return limiter.limit(rate)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        # Content Security Policy
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co; "
            "frame-ancestors 'none';"
        )
        response.headers["Content-Security-Policy"] = csp

        return response

class InputValidationMiddleware(BaseHTTPMiddleware):
    """Validate and sanitize all incoming requests"""

    # Patterns for SQL injection detection
    SQL_INJECTION_PATTERNS = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER)\b)",
        r"(--|#|\/\*|\*\/)",
        r"(\bOR\b\s+\d+\s*=\s*\d+)",
        r"(\bAND\b\s+\d+\s*=\s*\d+)",
        r"(';|\";\s*--)",
    ]

    # Patterns for XSS detection
    XSS_PATTERNS = [
        r"<script[^>]*>.*?</script>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe[^>]*>",
        r"<embed[^>]*>",
        r"<object[^>]*>",
    ]

    # Maximum request size (1MB)
    MAX_REQUEST_SIZE = 1024 * 1024

    async def dispatch(self, request: Request, call_next):
        # Check request size
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_REQUEST_SIZE:
            raise HTTPException(status_code=413, detail="Request entity too large")

        # Skip validation for non-JSON requests
        if request.method in ["GET", "HEAD", "OPTIONS"]:
            return await call_next(request)

        # Check content type
        content_type = request.headers.get("content-type", "")
        if request.method in ["POST", "PUT", "PATCH"] and not content_type.startswith("application/json"):
            if not content_type.startswith("multipart/form-data"):
                raise HTTPException(status_code=415, detail="Unsupported media type")

        # For JSON requests, validate the body
        if content_type.startswith("application/json"):
            try:
                body = await request.body()
                if body:
                    # Decode and validate JSON
                    try:
                        data = json.loads(body)
                        self._validate_json_data(data)
                    except json.JSONDecodeError:
                        raise HTTPException(status_code=400, detail="Invalid JSON format")

                    # Reconstruct request with validated body
                    async def receive():
                        return {
                            "type": "http.request",
                            "body": body
                        }
                    request._receive = receive

            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Request validation error: {str(e)}")

        return await call_next(request)

    def _validate_json_data(self, data, depth=0, max_depth=10):
        """Recursively validate JSON data for malicious content"""
        if depth > max_depth:
            raise HTTPException(status_code=400, detail="JSON nesting too deep")

        if isinstance(data, dict):
            for key, value in data.items():
                self._validate_string(str(key))
                self._validate_json_data(value, depth + 1, max_depth)
        elif isinstance(data, list):
            for item in data:
                self._validate_json_data(item, depth + 1, max_depth)
        elif isinstance(data, str):
            self._validate_string(data)

    def _validate_string(self, value: str):
        """Validate string for SQL injection and XSS attempts"""
        if len(value) > 10000:  # Max string length
            raise HTTPException(status_code=400, detail="String value too long")

        # Check for SQL injection patterns
        for pattern in self.SQL_INJECTION_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                raise HTTPException(status_code=400, detail="Potential SQL injection detected")

        # Check for XSS patterns
        for pattern in self.XSS_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                raise HTTPException(status_code=400, detail="Potential XSS attack detected")

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests for security auditing"""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Log request details
        request_id = f"{datetime.now().isoformat()}-{id(request)}"
        request.state.request_id = request_id

        # Get response
        response = await call_next(request)

        # Calculate request duration
        process_time = time.time() - start_time

        # Log request (sanitized)
        log_data = {
            "request_id": request_id,
            "timestamp": datetime.now().isoformat(),
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(process_time * 1000, 2),
            "client_ip": get_remote_address(request),
            "user_agent": request.headers.get("user-agent", "unknown")
        }

        # Log to console (in production, use proper logging service)
        if response.status_code >= 400:
            print(f"ERROR: {json.dumps(log_data)}")
        elif response.status_code >= 300:
            print(f"WARNING: {json.dumps(log_data)}")

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id

        return response

class AuthenticationMiddleware(BaseHTTPMiddleware):
    """Handle authentication and set user context"""

    # Public endpoints that don't require authentication
    PUBLIC_PATHS = [
        "/",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/health",
        "/api/auth/login",
        "/api/auth/signup",
        "/api/auth/refresh"
    ]

    async def dispatch(self, request: Request, call_next):
        # Skip authentication for public paths
        if request.url.path in self.PUBLIC_PATHS:
            return await call_next(request)

        # Extract and validate token
        auth_header = request.headers.get("authorization")
        if not auth_header:
            # Check for API key authentication
            api_key = request.headers.get("x-api-key")
            if api_key:
                # Validate API key and set user context
                user_id = await self._validate_api_key(api_key)
                if user_id:
                    request.state.user_id = user_id
                    request.state.auth_method = "api_key"
                else:
                    raise HTTPException(status_code=401, detail="Invalid API key")
            else:
                # No authentication provided
                if request.url.path.startswith("/api/"):
                    raise HTTPException(status_code=401, detail="Authentication required")
        else:
            # Validate JWT token
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                user_id = await self._validate_jwt_token(token)
                if user_id:
                    request.state.user_id = user_id
                    request.state.auth_method = "jwt"
                else:
                    raise HTTPException(status_code=401, detail="Invalid or expired token")
            else:
                raise HTTPException(status_code=401, detail="Invalid authorization header format")

        return await call_next(request)

    async def _validate_api_key(self, api_key: str) -> Optional[str]:
        """Validate API key and return user ID"""
        # Import here to avoid circular dependency
        from app.database.supabase_client import SupabaseClient

        try:
            client = SupabaseClient().client
            result = client.table("api_keys").select("user_id").eq("api_key", api_key).eq("is_active", True).single().execute()
            return result.data["user_id"] if result.data else None
        except Exception:
            return None

    async def _validate_jwt_token(self, token: str) -> Optional[str]:
        """Validate JWT token and return user ID"""
        # Import here to avoid circular dependency
        from jose import jwt, JWTError
        from app.config import settings

        try:
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
            user_id = payload.get("sub")
            return user_id
        except JWTError:
            return None

def setup_security_middleware(app: FastAPI):
    """Setup all security middleware for the application"""

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "https://yourdomain.com"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    # Add security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # Add input validation
    app.add_middleware(InputValidationMiddleware)

    # Add request logging
    app.add_middleware(RequestLoggingMiddleware)

    # Add authentication
    app.add_middleware(AuthenticationMiddleware)

    # Add rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    return app