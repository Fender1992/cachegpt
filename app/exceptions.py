"""
Custom exceptions and error handling for the LLM Cache Proxy application
"""

from fastapi import HTTPException, status
from typing import Any, Dict, Optional
import logging
from enum import Enum

logger = logging.getLogger(__name__)

class ErrorCode(str, Enum):
    """Standard error codes used throughout the application"""

    # Authentication & Authorization
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    INVALID_TOKEN = "INVALID_TOKEN"
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS"

    # Subscription & Billing
    SUBSCRIPTION_NOT_FOUND = "SUBSCRIPTION_NOT_FOUND"
    INVALID_PLAN = "INVALID_PLAN"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    BILLING_ERROR = "BILLING_ERROR"

    # Usage & Limits
    USAGE_LIMIT_EXCEEDED = "USAGE_LIMIT_EXCEEDED"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    FEATURE_NOT_AVAILABLE = "FEATURE_NOT_AVAILABLE"

    # Cache & API
    CACHE_ERROR = "CACHE_ERROR"
    API_ERROR = "API_ERROR"
    LLM_SERVICE_ERROR = "LLM_SERVICE_ERROR"
    EMBEDDING_ERROR = "EMBEDDING_ERROR"

    # Validation
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_INPUT = "INVALID_INPUT"
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"

    # System
    DATABASE_ERROR = "DATABASE_ERROR"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"

class BaseCustomException(Exception):
    """Base exception class for custom application exceptions"""

    def __init__(
        self,
        message: str,
        error_code: ErrorCode,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

class AuthenticationError(BaseCustomException):
    """Authentication related errors"""

    def __init__(self, message: str = "Authentication failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_code=ErrorCode.INVALID_CREDENTIALS,
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details
        )

class AuthorizationError(BaseCustomException):
    """Authorization related errors"""

    def __init__(self, message: str = "Access denied", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_code=ErrorCode.INSUFFICIENT_PERMISSIONS,
            status_code=status.HTTP_403_FORBIDDEN,
            details=details
        )

class SubscriptionError(BaseCustomException):
    """Subscription and billing related errors"""

    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.SUBSCRIPTION_NOT_FOUND,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=details
        )

class UsageLimitError(BaseCustomException):
    """Usage limit and quota related errors"""

    def __init__(
        self,
        message: str = "Usage limit exceeded",
        error_code: ErrorCode = ErrorCode.USAGE_LIMIT_EXCEEDED,
        status_code: int = status.HTTP_429_TOO_MANY_REQUESTS,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=details
        )

class RateLimitError(BaseCustomException):
    """Rate limiting errors"""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: int = 60,
        details: Optional[Dict[str, Any]] = None
    ):
        details = details or {}
        details["retry_after"] = retry_after

        super().__init__(
            message=message,
            error_code=ErrorCode.RATE_LIMIT_EXCEEDED,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details
        )

class FeatureNotAvailableError(BaseCustomException):
    """Feature access errors based on subscription"""

    def __init__(
        self,
        feature: str,
        current_plan: str = "unknown",
        required_plan: str = "business",
        details: Optional[Dict[str, Any]] = None
    ):
        message = f"Feature '{feature}' is not available on your current plan"
        details = details or {}
        details.update({
            "feature": feature,
            "current_plan": current_plan,
            "required_plan": required_plan
        })

        super().__init__(
            message=message,
            error_code=ErrorCode.FEATURE_NOT_AVAILABLE,
            status_code=status.HTTP_403_FORBIDDEN,
            details=details
        )

class CacheError(BaseCustomException):
    """Cache operation errors"""

    def __init__(
        self,
        message: str = "Cache operation failed",
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.CACHE_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details
        )

class LLMServiceError(BaseCustomException):
    """LLM service integration errors"""

    def __init__(
        self,
        message: str = "LLM service error",
        service_name: str = "unknown",
        details: Optional[Dict[str, Any]] = None
    ):
        details = details or {}
        details["service_name"] = service_name

        super().__init__(
            message=message,
            error_code=ErrorCode.LLM_SERVICE_ERROR,
            status_code=status.HTTP_502_BAD_GATEWAY,
            details=details
        )

class ValidationError(BaseCustomException):
    """Input validation errors"""

    def __init__(
        self,
        message: str = "Validation failed",
        field_errors: Optional[Dict[str, str]] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        details = details or {}
        if field_errors:
            details["field_errors"] = field_errors

        super().__init__(
            message=message,
            error_code=ErrorCode.VALIDATION_ERROR,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details
        )

class DatabaseError(BaseCustomException):
    """Database operation errors"""

    def __init__(
        self,
        message: str = "Database operation failed",
        operation: str = "unknown",
        details: Optional[Dict[str, Any]] = None
    ):
        details = details or {}
        details["operation"] = operation

        super().__init__(
            message=message,
            error_code=ErrorCode.DATABASE_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details
        )

class ExternalServiceError(BaseCustomException):
    """External service integration errors"""

    def __init__(
        self,
        message: str = "External service error",
        service_name: str = "unknown",
        status_code: int = status.HTTP_502_BAD_GATEWAY,
        details: Optional[Dict[str, Any]] = None
    ):
        details = details or {}
        details["service_name"] = service_name

        super().__init__(
            message=message,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            status_code=status_code,
            details=details
        )

class ConfigurationError(BaseCustomException):
    """Application configuration errors"""

    def __init__(
        self,
        message: str = "Configuration error",
        config_key: str = "unknown",
        details: Optional[Dict[str, Any]] = None
    ):
        details = details or {}
        details["config_key"] = config_key

        super().__init__(
            message=message,
            error_code=ErrorCode.CONFIGURATION_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details
        )

# Helper functions for creating common errors

def create_auth_error(message: str = "Authentication failed") -> HTTPException:
    """Create a standardized authentication error"""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "error": ErrorCode.INVALID_CREDENTIALS.value,
            "message": message,
            "code": ErrorCode.INVALID_CREDENTIALS.value
        },
        headers={"WWW-Authenticate": "Bearer"}
    )

def create_permission_error(message: str = "Access denied", required_permission: str = None) -> HTTPException:
    """Create a standardized permission error"""
    detail = {
        "error": ErrorCode.INSUFFICIENT_PERMISSIONS.value,
        "message": message,
        "code": ErrorCode.INSUFFICIENT_PERMISSIONS.value
    }

    if required_permission:
        detail["required_permission"] = required_permission

    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=detail
    )

def create_rate_limit_error(
    message: str = "Rate limit exceeded",
    retry_after: int = 60,
    limit_type: str = "requests"
) -> HTTPException:
    """Create a standardized rate limit error"""
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "error": ErrorCode.RATE_LIMIT_EXCEEDED.value,
            "message": message,
            "code": ErrorCode.RATE_LIMIT_EXCEEDED.value,
            "retry_after": retry_after,
            "limit_type": limit_type
        },
        headers={"Retry-After": str(retry_after)}
    )

def create_validation_error(
    message: str = "Validation failed",
    field_errors: Optional[Dict[str, str]] = None
) -> HTTPException:
    """Create a standardized validation error"""
    detail = {
        "error": ErrorCode.VALIDATION_ERROR.value,
        "message": message,
        "code": ErrorCode.VALIDATION_ERROR.value
    }

    if field_errors:
        detail["field_errors"] = field_errors

    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail
    )

def create_subscription_error(
    message: str,
    error_code: ErrorCode = ErrorCode.SUBSCRIPTION_NOT_FOUND,
    current_plan: str = None,
    required_plan: str = None
) -> HTTPException:
    """Create a standardized subscription error"""
    detail = {
        "error": error_code.value,
        "message": message,
        "code": error_code.value
    }

    if current_plan:
        detail["current_plan"] = current_plan
    if required_plan:
        detail["required_plan"] = required_plan

    status_code_map = {
        ErrorCode.SUBSCRIPTION_NOT_FOUND: status.HTTP_404_NOT_FOUND,
        ErrorCode.INVALID_PLAN: status.HTTP_400_BAD_REQUEST,
        ErrorCode.PAYMENT_FAILED: status.HTTP_402_PAYMENT_REQUIRED,
        ErrorCode.FEATURE_NOT_AVAILABLE: status.HTTP_403_FORBIDDEN,
        ErrorCode.USAGE_LIMIT_EXCEEDED: status.HTTP_429_TOO_MANY_REQUESTS
    }

    return HTTPException(
        status_code=status_code_map.get(error_code, status.HTTP_400_BAD_REQUEST),
        detail=detail
    )

def create_internal_error(
    message: str = "Internal server error",
    error_id: str = None
) -> HTTPException:
    """Create a standardized internal error"""
    detail = {
        "error": ErrorCode.INTERNAL_ERROR.value,
        "message": message,
        "code": ErrorCode.INTERNAL_ERROR.value
    }

    if error_id:
        detail["error_id"] = error_id

    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=detail
    )

# Context managers for error handling

class ErrorHandler:
    """Context manager for handling exceptions and converting them to appropriate HTTP responses"""

    def __init__(self, operation: str = "operation", log_errors: bool = True):
        self.operation = operation
        self.log_errors = log_errors

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            return False

        # Log the error if enabled
        if self.log_errors:
            logger.error(f"Error in {self.operation}: {exc_val}", exc_info=True)

        # Convert known exceptions to HTTP exceptions
        if isinstance(exc_val, BaseCustomException):
            raise HTTPException(
                status_code=exc_val.status_code,
                detail={
                    "error": exc_val.error_code.value,
                    "message": exc_val.message,
                    "code": exc_val.error_code.value,
                    **exc_val.details
                }
            )
        elif isinstance(exc_val, HTTPException):
            # Re-raise HTTP exceptions as-is
            return False
        else:
            # Convert unknown exceptions to internal server errors
            error_id = f"{self.operation}_{hash(str(exc_val)) % 100000}"
            raise create_internal_error(
                message=f"An error occurred during {self.operation}",
                error_id=error_id
            )

        return True  # Suppress the exception

# Decorator for endpoint error handling
def handle_errors(operation: str = "operation", log_errors: bool = True):
    """Decorator for handling endpoint errors"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            with ErrorHandler(operation, log_errors):
                return await func(*args, **kwargs)
        return wrapper
    return decorator