"""Subscription and billing API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict, Any
from app.services.subscription_service import subscription_service
from app.utils.feature_gates import check_api_key_limit
from pydantic import BaseModel

router = APIRouter()

class UpgradePlanRequest(BaseModel):
    plan_name: str

class CreateApiKeyRequest(BaseModel):
    key_name: str

@router.get("/subscription")
async def get_subscription(request: Request):
    """Get user's current subscription details"""
    user_id = getattr(request.state, 'user_id', None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    subscription = await subscription_service.get_user_subscription(user_id)
    usage_status = await subscription_service.check_usage_limits(user_id)

    return {
        "subscription": subscription,
        "usage": usage_status
    }

@router.post("/subscription/upgrade")
async def create_upgrade_session(plan_request: UpgradePlanRequest, request: Request):
    """Upgrade to a new subscription plan"""
    user_id = getattr(request.state, 'user_id', None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if plan_request.plan_name not in ["startup", "business", "enterprise"]:
        raise HTTPException(status_code=400, detail="Invalid plan name")

    # For now, just upgrade the plan directly (Stripe integration would go here)
    try:
        updated_subscription = await subscription_service.upgrade_plan(user_id, plan_request.plan_name)
        return {
            "message": f"Successfully upgraded to {plan_request.plan_name} plan",
            "subscription": updated_subscription
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/subscription/usage")
async def get_usage_details(request: Request):
    """Get detailed usage statistics"""
    user_id = getattr(request.state, 'user_id', None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get current month usage
    current_usage = await subscription_service.check_usage_limits(user_id)

    # Get usage history (last 12 months)
    usage_history = await subscription_service.get_usage_history(user_id, months=12)

    return {
        "current_month": current_usage,
        "history": usage_history
    }

@router.post("/api-keys")
async def create_api_key(api_key_request: CreateApiKeyRequest, request: Request):
    """Create a new API key with subscription limits"""
    user_id = getattr(request.state, 'user_id', None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Check if user can create more API keys
    await check_api_key_limit(user_id)

    # Import here to avoid circular dependency
    from database.supabase_client import SupabaseClient
    import secrets

    try:
        client = SupabaseClient().client

        # Generate API key
        api_key = f"sk-{secrets.token_urlsafe(32)}"

        # Create API key in database
        api_key_data = {
            "user_id": user_id,
            "key_name": api_key_request.key_name,
            "api_key": api_key,
            "is_active": True
        }

        result = client.table("api_keys").insert(api_key_data).execute()

        return {
            "message": "API key created successfully",
            "api_key": api_key,
            "key_name": api_key_request.key_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api-keys")
async def list_api_keys(request: Request):
    """List all API keys for the user"""
    user_id = getattr(request.state, 'user_id', None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Import here to avoid circular dependency
    from database.supabase_client import SupabaseClient

    try:
        client = SupabaseClient().client

        # Get all API keys for user
        result = client.table("api_keys").select("id, key_name, api_key, is_active, created_at").eq("user_id", user_id).execute()

        # Mask API keys for security
        masked_keys = []
        for key in result.data:
            masked_key = {
                **key,
                "api_key": key["api_key"][:8] + "..." + key["api_key"][-4:] if key["api_key"] else None
            }
            masked_keys.append(masked_key)

        return {"api_keys": masked_keys}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api-keys/{key_id}")
async def delete_api_key(key_id: str, request: Request):
    """Delete an API key"""
    user_id = getattr(request.state, 'user_id', None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Import here to avoid circular dependency
    from database.supabase_client import SupabaseClient

    try:
        client = SupabaseClient().client

        # Update API key to inactive
        result = client.table("api_keys").update({"is_active": False}).eq("id", key_id).eq("user_id", user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="API key not found")

        return {"message": "API key deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))