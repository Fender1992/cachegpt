from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import jwt
import logging
from passlib.context import CryptContext
from app.config import settings
from app.database.supabase_client import supabase_client
import secrets
import hashlib

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class AuthService:
    """Enhanced authentication service with refresh tokens"""

    def __init__(self):
        self.supabase = supabase_client
        self.jwt_secret = settings.jwt_secret
        self.access_token_expire_minutes = 15  # Short-lived access tokens
        self.refresh_token_expire_days = 30    # Long-lived refresh tokens
        self.algorithm = "HS256"

    def hash_password(self, password: str) -> str:
        """Hash a password"""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(self, data: Dict[str, Any]) -> str:
        """Create a JWT access token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        to_encode.update({"exp": expire, "type": "access"})

        return jwt.encode(to_encode, self.jwt_secret, algorithm=self.algorithm)

    def create_refresh_token(self, user_id: str) -> str:
        """Create a refresh token"""
        # Generate a random token
        token = secrets.token_urlsafe(32)
        return token

    async def store_refresh_token(self, user_id: str, token: str) -> bool:
        """Store refresh token in database"""
        try:
            # Hash the token before storing
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            expires_at = datetime.utcnow() + timedelta(days=self.refresh_token_expire_days)

            await self.supabase.table("refresh_tokens").insert({
                "user_id": user_id,
                "token_hash": token_hash,
                "expires_at": expires_at.isoformat(),
                "is_active": True
            }).execute()

            return True
        except Exception as e:
            logger.error(f"Error storing refresh token: {e}")
            return False

    async def verify_refresh_token(self, token: str) -> Optional[str]:
        """Verify refresh token and return user_id if valid"""
        try:
            token_hash = hashlib.sha256(token.encode()).hexdigest()

            response = await self.supabase.table("refresh_tokens")\
                .select("user_id, expires_at")\
                .eq("token_hash", token_hash)\
                .eq("is_active", True)\
                .single()\
                .execute()

            if not response.data:
                return None

            # Check if token is expired
            expires_at = datetime.fromisoformat(response.data["expires_at"].replace('Z', '+00:00'))
            if expires_at < datetime.utcnow():
                # Token expired, deactivate it
                await self.revoke_refresh_token(token)
                return None

            return response.data["user_id"]

        except Exception as e:
            logger.error(f"Error verifying refresh token: {e}")
            return None

    async def revoke_refresh_token(self, token: str) -> bool:
        """Revoke a refresh token"""
        try:
            token_hash = hashlib.sha256(token.encode()).hexdigest()

            await self.supabase.table("refresh_tokens")\
                .update({"is_active": False})\
                .eq("token_hash", token_hash)\
                .execute()

            return True
        except Exception as e:
            logger.error(f"Error revoking refresh token: {e}")
            return False

    async def revoke_all_refresh_tokens(self, user_id: str) -> bool:
        """Revoke all refresh tokens for a user"""
        try:
            await self.supabase.table("refresh_tokens")\
                .update({"is_active": False})\
                .eq("user_id", user_id)\
                .execute()

            return True
        except Exception as e:
            logger.error(f"Error revoking all refresh tokens: {e}")
            return False

    def decode_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Decode and verify access token"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.algorithm])

            # Check token type
            if payload.get("type") != "access":
                return None

            return payload
        except jwt.ExpiredSignatureError:
            logger.info("Access token expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid access token: {e}")
            return None

    async def authenticate_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate user with email and password"""
        try:
            # Get user from database
            response = await self.supabase.table("user_profiles")\
                .select("id, email, password_hash")\
                .eq("email", email)\
                .single()\
                .execute()

            if not response.data:
                return None

            user = response.data

            # Verify password
            if not self.verify_password(password, user.get("password_hash", "")):
                return None

            return {
                "id": user["id"],
                "email": user["email"]
            }

        except Exception as e:
            logger.error(f"Error authenticating user: {e}")
            return None

    async def create_user(self, email: str, password: str, **extra_data) -> Optional[str]:
        """Create a new user"""
        try:
            # Check if user already exists
            existing_user = await self.supabase.table("user_profiles")\
                .select("id")\
                .eq("email", email)\
                .single()\
                .execute()

            if existing_user.data:
                return None  # User already exists

            # Hash password
            password_hash = self.hash_password(password)

            # Create user
            user_data = {
                "email": email,
                "password_hash": password_hash,
                **extra_data
            }

            response = await self.supabase.table("user_profiles")\
                .insert(user_data)\
                .execute()

            if response.data:
                user_id = response.data[0]["id"]

                # Create default free subscription
                from .subscription_service import subscription_service
                await subscription_service.create_subscription(
                    user_id=user_id,
                    plan_name="free"
                )

                return user_id

            return None

        except Exception as e:
            logger.error(f"Error creating user: {e}")
            return None

    async def login(self, email: str, password: str) -> Optional[Dict[str, str]]:
        """Login user and return access and refresh tokens"""
        user = await self.authenticate_user(email, password)
        if not user:
            return None

        # Create tokens
        access_token = self.create_access_token({"sub": user["id"], "email": user["email"]})
        refresh_token = self.create_refresh_token(user["id"])

        # Store refresh token
        if await self.store_refresh_token(user["id"], refresh_token):
            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "expires_in": self.access_token_expire_minutes * 60
            }

        return None

    async def refresh_access_token(self, refresh_token: str) -> Optional[Dict[str, str]]:
        """Refresh access token using refresh token"""
        user_id = await self.verify_refresh_token(refresh_token)
        if not user_id:
            return None

        # Get user details
        response = await self.supabase.table("user_profiles")\
            .select("id, email")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not response.data:
            return None

        user = response.data

        # Create new access token
        access_token = self.create_access_token({"sub": user["id"], "email": user["email"]})

        # Optionally rotate refresh token
        new_refresh_token = self.create_refresh_token(user["id"])
        await self.revoke_refresh_token(refresh_token)  # Revoke old token
        await self.store_refresh_token(user["id"], new_refresh_token)

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": self.access_token_expire_minutes * 60
        }

    async def logout(self, refresh_token: str) -> bool:
        """Logout user by revoking refresh token"""
        return await self.revoke_refresh_token(refresh_token)

    async def logout_all_devices(self, user_id: str) -> bool:
        """Logout user from all devices"""
        return await self.revoke_all_refresh_tokens(user_id)

    async def get_current_user(self, access_token: str) -> Optional[Dict[str, Any]]:
        """Get current user from access token"""
        payload = self.decode_access_token(access_token)
        if not payload:
            return None

        user_id = payload.get("sub")
        if not user_id:
            return None

        try:
            response = await self.supabase.table("user_profiles")\
                .select("id, email, created_at")\
                .eq("id", user_id)\
                .single()\
                .execute()

            return response.data
        except Exception as e:
            logger.error(f"Error getting current user: {e}")
            return None

    async def change_password(self, user_id: str, old_password: str, new_password: str) -> bool:
        """Change user password"""
        try:
            # Get current password hash
            response = await self.supabase.table("user_profiles")\
                .select("password_hash")\
                .eq("id", user_id)\
                .single()\
                .execute()

            if not response.data:
                return False

            # Verify old password
            if not self.verify_password(old_password, response.data["password_hash"]):
                return False

            # Hash new password
            new_password_hash = self.hash_password(new_password)

            # Update password
            await self.supabase.table("user_profiles")\
                .update({"password_hash": new_password_hash})\
                .eq("id", user_id)\
                .execute()

            # Revoke all refresh tokens to force re-login
            await self.revoke_all_refresh_tokens(user_id)

            return True

        except Exception as e:
            logger.error(f"Error changing password: {e}")
            return False

    async def cleanup_expired_tokens(self):
        """Clean up expired refresh tokens"""
        try:
            await self.supabase.table("refresh_tokens")\
                .update({"is_active": False})\
                .lt("expires_at", datetime.utcnow().isoformat())\
                .execute()

            logger.info("Expired refresh tokens cleaned up")
        except Exception as e:
            logger.error(f"Error cleaning up expired tokens: {e}")

    async def get_user_sessions(self, user_id: str) -> list:
        """Get active sessions for a user"""
        try:
            response = await self.supabase.table("refresh_tokens")\
                .select("created_at, expires_at, last_used")\
                .eq("user_id", user_id)\
                .eq("is_active", True)\
                .execute()

            return response.data or []
        except Exception as e:
            logger.error(f"Error getting user sessions: {e}")
            return []

# Global instance
auth_service = AuthService()