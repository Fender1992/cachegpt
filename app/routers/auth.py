from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging
from app.services.auth_service import auth_service
from app.middleware.security_middleware import rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])

# Security scheme
security = HTTPBearer()

# Pydantic models
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class UserResponse(BaseModel):
    id: str
    email: str
    created_at: str

# Dependency to get current user
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from access token"""
    token = credentials.credentials
    user = await auth_service.get_current_user(token)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user

# Auth endpoints

@router.post("/register", response_model=AuthResponse)
@rate_limit("5/minute")  # Rate limit registration
async def register(request: Request, user_data: RegisterRequest):
    """Register a new user"""
    # Validate passwords match
    if user_data.password != user_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )

    # Validate password strength
    if len(user_data.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long"
        )

    try:
        # Create user
        user_id = await auth_service.create_user(
            email=user_data.email,
            password=user_data.password
        )

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        # Login the user
        tokens = await auth_service.login(user_data.email, user_data.password)
        if not tokens:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user session"
            )

        logger.info(f"New user registered: {user_data.email}")
        return AuthResponse(**tokens)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )

@router.post("/login", response_model=AuthResponse)
@rate_limit("10/minute")  # Rate limit login attempts
async def login(request: Request, credentials: LoginRequest):
    """Login with email and password"""
    try:
        tokens = await auth_service.login(credentials.email, credentials.password)

        if not tokens:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        logger.info(f"User logged in: {credentials.email}")
        return AuthResponse(**tokens)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )

@router.post("/refresh", response_model=AuthResponse)
@rate_limit("20/minute")  # Rate limit token refresh
async def refresh_token(request: Request, token_request: RefreshTokenRequest):
    """Refresh access token using refresh token"""
    try:
        tokens = await auth_service.refresh_access_token(token_request.refresh_token)

        if not tokens:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token"
            )

        return AuthResponse(**tokens)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )

@router.post("/logout")
async def logout(
    token_request: RefreshTokenRequest,
    current_user: dict = Depends(get_current_user)
):
    """Logout user by revoking refresh token"""
    try:
        success = await auth_service.logout(token_request.refresh_token)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to logout"
            )

        logger.info(f"User logged out: {current_user['email']}")
        return {"message": "Successfully logged out"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Logout error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )

@router.post("/logout-all")
async def logout_all_devices(current_user: dict = Depends(get_current_user)):
    """Logout user from all devices"""
    try:
        success = await auth_service.logout_all_devices(current_user["id"])

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to logout from all devices"
            )

        logger.info(f"User logged out from all devices: {current_user['email']}")
        return {"message": "Successfully logged out from all devices"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Logout all devices error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(**current_user)

@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Change user password"""
    # Validate passwords match
    if request.new_password != request.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New passwords do not match"
        )

    # Validate password strength
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long"
        )

    try:
        success = await auth_service.change_password(
            current_user["id"],
            request.old_password,
            request.new_password
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )

        logger.info(f"Password changed for user: {current_user['email']}")
        return {"message": "Password changed successfully. Please login again."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Change password error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to change password"
        )

@router.get("/sessions")
async def get_user_sessions(current_user: dict = Depends(get_current_user)):
    """Get user's active sessions"""
    try:
        sessions = await auth_service.get_user_sessions(current_user["id"])
        return {"sessions": sessions}

    except Exception as e:
        logger.error(f"Get sessions error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get sessions"
        )

# Password reset endpoints (simplified implementation)

@router.post("/forgot-password")
@rate_limit("3/minute")  # Strict rate limit for password reset
async def forgot_password(request: Request, email: EmailStr):
    """Request password reset (simplified - just logs the request)"""
    # In a real implementation, you would:
    # 1. Generate a secure reset token
    # 2. Store it with expiration
    # 3. Send email with reset link
    # 4. Verify token when user submits new password

    logger.info(f"Password reset requested for: {email}")
    return {"message": "If an account with this email exists, you will receive password reset instructions."}

@router.post("/reset-password")
@rate_limit("5/minute")
async def reset_password(
    request: Request,
    reset_token: str,
    new_password: str,
    confirm_password: str
):
    """Reset password with token (simplified implementation)"""
    if new_password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )

    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long"
        )

    # In a real implementation, you would verify the reset token
    # and update the user's password
    logger.info(f"Password reset attempted with token: {reset_token[:10]}...")

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Password reset not fully implemented. Please contact support."
    )

# Health check for auth service
@router.get("/health")
async def auth_health_check():
    """Health check for auth service"""
    return {
        "status": "healthy",
        "service": "authentication",
        "features": [
            "registration",
            "login",
            "refresh_tokens",
            "password_change",
            "multi_device_logout"
        ]
    }