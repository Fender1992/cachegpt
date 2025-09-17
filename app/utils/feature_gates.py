"""Feature gating decorators for subscription-based access control"""
from functools import wraps
from fastapi import HTTPException, Request
from app.services.subscription_service import subscription_service
import asyncio

def requires_feature(feature_name: str):
    """Decorator to gate features by subscription plan"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract user_id from request or arguments
            user_id = None

            # Check if Request object is in args
            for arg in args:
                if isinstance(arg, Request):
                    user_id = getattr(arg.state, 'user_id', None)
                    break

            # Check kwargs for user_id
            if not user_id:
                user_id = kwargs.get('current_user_id') or kwargs.get('user_id')

            if not user_id:
                raise HTTPException(status_code=401, detail="Authentication required")

            # Check feature access
            has_access = await subscription_service.has_feature(user_id, feature_name)
            if not has_access:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": f"Feature '{feature_name}' requires upgrade",
                        "feature": feature_name,
                        "upgrade_url": "/pricing"
                    }
                )

            # Call the original function
            if asyncio.iscoroutinefunction(func):
                return await func(*args, **kwargs)
            else:
                return func(*args, **kwargs)
        return wrapper
    return decorator

def requires_plan(min_plan: str):
    """Decorator to require minimum plan level"""
    plan_hierarchy = {
        "free": 0,
        "startup": 1,
        "business": 2,
        "enterprise": 3
    }

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract user_id from request or arguments
            user_id = None

            # Check if Request object is in args
            for arg in args:
                if isinstance(arg, Request):
                    user_id = getattr(arg.state, 'user_id', None)
                    break

            # Check kwargs for user_id
            if not user_id:
                user_id = kwargs.get('current_user_id') or kwargs.get('user_id')

            if not user_id:
                raise HTTPException(status_code=401, detail="Authentication required")

            # Get user subscription
            subscription = await subscription_service.get_user_subscription(user_id)
            user_plan = subscription.get("subscription_plans", {}).get("name", "free")

            # Check plan level
            if plan_hierarchy.get(user_plan, 0) < plan_hierarchy.get(min_plan, 999):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": f"This feature requires {min_plan} plan or higher",
                        "current_plan": user_plan,
                        "required_plan": min_plan,
                        "upgrade_url": "/pricing"
                    }
                )

            # Call the original function
            if asyncio.iscoroutinefunction(func):
                return await func(*args, **kwargs)
            else:
                return func(*args, **kwargs)
        return wrapper
    return decorator

async def check_api_key_limit(user_id: str):
    """Check if user can create more API keys based on their plan"""
    can_create = await subscription_service.can_create_api_key(user_id)
    if not can_create:
        subscription = await subscription_service.get_user_subscription(user_id)
        plan = subscription.get("subscription_plans", {})
        max_keys = plan.get("max_api_keys", 1)

        raise HTTPException(
            status_code=403,
            detail={
                "error": f"API key limit reached. Your {plan.get('name', 'free')} plan allows {max_keys} API key(s)",
                "limit": max_keys,
                "upgrade_url": "/pricing"
            }
        )
    return True

async def check_usage_limit(user_id: str):
    """Check if user has exceeded their monthly usage limit"""
    usage_status = await subscription_service.check_usage_limits(user_id)

    if not usage_status["within_limits"]:
        # For free tier, block the request
        if usage_status["plan_name"] == "free":
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Monthly limit exceeded",
                    "current_usage": usage_status["current_usage"],
                    "limit": usage_status["monthly_limit"],
                    "upgrade_url": "/pricing"
                }
            )
        else:
            # For paid tiers, allow overage but track it
            return {
                "allow": True,
                "overage": True,
                "overage_amount": usage_status["overage"]
            }

    return {
        "allow": True,
        "overage": False
    }