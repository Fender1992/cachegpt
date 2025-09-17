from fastapi import Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import logging
import traceback
import time
import uuid
from typing import Callable
from app.exceptions import BaseCustomException, ErrorCode
from app.database.supabase_client import supabase_client

logger = logging.getLogger(__name__)

class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Middleware for centralized error handling and logging"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        error_id = str(uuid.uuid4())
        start_time = time.time()

        try:
            response = await call_next(request)
            return response

        except HTTPException as e:
            # Log HTTP exceptions
            await self._log_error(
                error_id=error_id,
                error_type="HTTPException",
                error_message=str(e.detail),
                status_code=e.status_code,
                request=request,
                processing_time=time.time() - start_time
            )

            # Return structured error response
            return await self._create_error_response(
                status_code=e.status_code,
                error_detail=e.detail,
                error_id=error_id,
                headers=getattr(e, 'headers', None)
            )

        except BaseCustomException as e:
            # Handle custom application exceptions
            await self._log_error(
                error_id=error_id,
                error_type=e.__class__.__name__,
                error_message=e.message,
                status_code=e.status_code,
                request=request,
                processing_time=time.time() - start_time,
                error_code=e.error_code,
                details=e.details
            )

            return await self._create_error_response(
                status_code=e.status_code,
                error_detail={
                    "error": e.error_code.value,
                    "message": e.message,
                    "code": e.error_code.value,
                    **e.details
                },
                error_id=error_id
            )

        except Exception as e:
            # Handle unexpected exceptions
            logger.error(f"Unhandled exception {error_id}: {str(e)}", exc_info=True)

            await self._log_error(
                error_id=error_id,
                error_type=e.__class__.__name__,
                error_message=str(e),
                status_code=500,
                request=request,
                processing_time=time.time() - start_time,
                stack_trace=traceback.format_exc()
            )

            # Don't expose internal errors in production
            return await self._create_error_response(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                error_detail={
                    "error": ErrorCode.INTERNAL_ERROR.value,
                    "message": "An internal server error occurred",
                    "code": ErrorCode.INTERNAL_ERROR.value,
                    "error_id": error_id
                },
                error_id=error_id
            )

    async def _create_error_response(
        self,
        status_code: int,
        error_detail: dict,
        error_id: str,
        headers: dict = None
    ) -> JSONResponse:
        """Create a standardized error response"""

        # Ensure error_detail is a dict
        if not isinstance(error_detail, dict):
            error_detail = {
                "error": "UNKNOWN_ERROR",
                "message": str(error_detail),
                "code": "UNKNOWN_ERROR"
            }

        # Add error ID to response
        error_detail["error_id"] = error_id

        # Add timestamp
        error_detail["timestamp"] = time.time()

        response_headers = {"Content-Type": "application/json"}
        if headers:
            response_headers.update(headers)

        return JSONResponse(
            status_code=status_code,
            content=error_detail,
            headers=response_headers
        )

    async def _log_error(
        self,
        error_id: str,
        error_type: str,
        error_message: str,
        status_code: int,
        request: Request,
        processing_time: float,
        error_code: ErrorCode = None,
        details: dict = None,
        stack_trace: str = None
    ):
        """Log error to both application logs and database"""

        # Extract request information
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")

        # Create log entry
        log_data = {
            "error_id": error_id,
            "error_type": error_type,
            "error_message": error_message,
            "status_code": status_code,
            "method": request.method,
            "url": str(request.url),
            "client_ip": client_ip,
            "user_agent": user_agent,
            "processing_time": processing_time
        }

        if error_code:
            log_data["error_code"] = error_code.value

        if details:
            log_data["details"] = details

        if stack_trace:
            log_data["stack_trace"] = stack_trace

        # Log to application logger
        log_level = logging.ERROR if status_code >= 500 else logging.WARNING
        logger.log(
            log_level,
            f"Error {error_id}: {error_type} - {error_message}",
            extra=log_data
        )

        # Log to database for analysis (non-blocking)
        try:
            await self._store_error_log(log_data)
        except Exception as e:
            logger.warning(f"Failed to store error log in database: {e}")

    async def _store_error_log(self, log_data: dict):
        """Store error log in database"""
        try:
            # Store in error_logs table
            await supabase_client.table("error_logs").insert({
                "error_id": log_data["error_id"],
                "error_type": log_data["error_type"],
                "error_message": log_data["error_message"],
                "status_code": log_data["status_code"],
                "method": log_data["method"],
                "url": log_data["url"],
                "client_ip": log_data["client_ip"],
                "user_agent": log_data["user_agent"],
                "processing_time": log_data["processing_time"],
                "error_code": log_data.get("error_code"),
                "details": log_data.get("details", {}),
                "stack_trace": log_data.get("stack_trace"),
                "created_at": "now()"
            }).execute()

        except Exception as e:
            # Don't let database errors break error handling
            logger.warning(f"Failed to store error log: {e}")

class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Middleware for request validation and sanitization"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.max_request_size = 10 * 1024 * 1024  # 10MB
        self.max_header_size = 8192  # 8KB

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            # Validate request size
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > self.max_request_size:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail={
                        "error": "REQUEST_TOO_LARGE",
                        "message": f"Request size exceeds maximum allowed size of {self.max_request_size} bytes",
                        "code": "REQUEST_TOO_LARGE"
                    }
                )

            # Validate headers
            for name, value in request.headers.items():
                if len(value) > self.max_header_size:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "error": "HEADER_TOO_LARGE",
                            "message": f"Header '{name}' exceeds maximum size",
                            "code": "HEADER_TOO_LARGE"
                        }
                    )

            return await call_next(request)

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Request validation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "INVALID_REQUEST",
                    "message": "Request validation failed",
                    "code": "INVALID_REQUEST"
                }
            )

class HealthCheckMiddleware(BaseHTTPMiddleware):
    """Middleware to handle health checks and bypass other middleware"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.health_endpoints = {"/health", "/healthz", "/ping"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Fast path for health checks
        if request.url.path in self.health_endpoints:
            return JSONResponse(
                status_code=200,
                content={
                    "status": "healthy",
                    "timestamp": time.time(),
                    "version": "1.0.0"
                }
            )

        return await call_next(request)

# Error handling utilities

async def handle_database_error(error: Exception, operation: str = "database operation"):
    """Handle database errors consistently"""
    logger.error(f"Database error in {operation}: {error}")

    # Map specific database errors to user-friendly messages
    error_message = "Database operation failed"

    if "connection" in str(error).lower():
        error_message = "Database connection error"
    elif "timeout" in str(error).lower():
        error_message = "Database operation timed out"
    elif "constraint" in str(error).lower():
        error_message = "Data constraint violation"

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={
            "error": ErrorCode.DATABASE_ERROR.value,
            "message": error_message,
            "code": ErrorCode.DATABASE_ERROR.value,
            "operation": operation
        }
    )

async def handle_external_service_error(
    error: Exception,
    service_name: str,
    operation: str = "external service call"
):
    """Handle external service errors consistently"""
    logger.error(f"External service error ({service_name}) in {operation}: {error}")

    # Determine status code based on error type
    status_code = status.HTTP_502_BAD_GATEWAY

    if "timeout" in str(error).lower():
        status_code = status.HTTP_504_GATEWAY_TIMEOUT
    elif "unauthorized" in str(error).lower() or "403" in str(error):
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    raise HTTPException(
        status_code=status_code,
        detail={
            "error": ErrorCode.EXTERNAL_SERVICE_ERROR.value,
            "message": f"{service_name} service is currently unavailable",
            "code": ErrorCode.EXTERNAL_SERVICE_ERROR.value,
            "service": service_name,
            "operation": operation
        }
    )

def setup_error_handling(app):
    """Setup error handling middleware"""

    # Add middleware in reverse order (last added is executed first)
    app.add_middleware(ErrorHandlingMiddleware)
    app.add_middleware(RequestValidationMiddleware)
    app.add_middleware(HealthCheckMiddleware)

    logger.info("Error handling middleware configured")