from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import JSONResponse
from typing import List, Optional
import logging
from app.models.subscription import (
    SubscriptionPlan, SubscriptionDetails, UsageStats, PricingInfo,
    CreateSubscriptionRequest, UpdateSubscriptionRequest, WebhookEvent,
    PaymentIntent, BillingEvent
)
from app.services.subscription_service import subscription_service
from app.services.billing_service import billing_service
from app.utils.feature_gates import FeatureGate, get_feature_gate
from app.models.auth import get_current_user
from app.database.supabase_client import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Public endpoints (no auth required)

@router.get("/plans", response_model=List[SubscriptionPlan])
async def get_subscription_plans():
    """Get all available subscription plans"""
    try:
        plans = await subscription_service.get_all_plans()
        return plans
    except Exception as e:
        logger.error(f"Error fetching subscription plans: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch subscription plans"
        )

@router.get("/pricing", response_model=PricingInfo)
async def get_pricing_info(user_id: Optional[str] = None):
    """Get pricing information with optional user context"""
    try:
        plans = await subscription_service.get_all_plans()

        current_plan = None
        recommended_plan = None

        if user_id:
            try:
                details = await subscription_service.get_subscription_details(user_id)
                if details:
                    current_plan = details.plan.name

                    # Simple recommendation logic
                    usage_stats = await subscription_service.get_usage_stats(user_id)
                    if usage_stats.usage_percentage > 80:
                        # Recommend upgrade if using more than 80% of quota
                        current_plan_names = ["free", "startup", "business", "enterprise"]
                        try:
                            current_index = current_plan_names.index(current_plan)
                            if current_index < len(current_plan_names) - 1:
                                recommended_plan = current_plan_names[current_index + 1]
                        except ValueError:
                            recommended_plan = "startup"
            except Exception as e:
                logger.warning(f"Error getting user context for pricing: {e}")

        return PricingInfo(
            plans=plans,
            current_plan=current_plan,
            recommended_plan=recommended_plan
        )
    except Exception as e:
        logger.error(f"Error fetching pricing info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch pricing information"
        )

# Authenticated endpoints

@router.get("/current", response_model=SubscriptionDetails)
async def get_current_subscription(current_user: dict = Depends(get_current_user)):
    """Get current user's subscription details"""
    try:
        user_id = current_user["id"]
        details = await subscription_service.get_subscription_details(user_id)

        if not details:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active subscription found"
            )

        return details
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching subscription details: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch subscription details"
        )

@router.get("/usage", response_model=UsageStats)
async def get_usage_stats(current_user: dict = Depends(get_current_user)):
    """Get detailed usage statistics for current user"""
    try:
        user_id = current_user["id"]
        stats = await subscription_service.get_usage_stats(user_id)
        return stats
    except Exception as e:
        logger.error(f"Error fetching usage stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch usage statistics"
        )

@router.get("/features")
async def get_user_features(
    current_user: dict = Depends(get_current_user),
    feature_gate: FeatureGate = Depends(get_feature_gate)
):
    """Get user's available features and their status"""
    try:
        user_id = current_user["id"]
        features = await feature_gate.get_user_features(user_id)
        return features
    except Exception as e:
        logger.error(f"Error fetching user features: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user features"
        )

@router.post("/create")
async def create_subscription(
    request: CreateSubscriptionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a new subscription"""
    try:
        user_id = current_user["id"]

        # Validate plan exists
        plan = await subscription_service.get_plan_by_name(request.plan_name)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Plan '{request.plan_name}' not found"
            )

        # Free plan doesn't require payment
        if request.plan_name == "free":
            subscription = await subscription_service.create_subscription(
                user_id=user_id,
                plan_name=request.plan_name,
                billing_cycle=request.billing_cycle
            )
            return {"subscription": subscription.dict(), "client_secret": None}

        # Paid plans go through billing service
        result = await billing_service.create_subscription(user_id, request)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create subscription"
        )

@router.put("/update")
async def update_subscription(
    request: UpdateSubscriptionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update existing subscription"""
    try:
        user_id = current_user["id"]

        # Get current subscription
        current_subscription = await subscription_service.get_user_subscription(user_id)
        if not current_subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active subscription found"
            )

        # If updating plan
        if request.plan_name:
            # Validate new plan
            plan = await subscription_service.get_plan_by_name(request.plan_name)
            if not plan:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Plan '{request.plan_name}' not found"
                )

            # Handle downgrade to free
            if request.plan_name == "free":
                success = await billing_service.cancel_subscription(user_id, immediate=True)
                if success:
                    await subscription_service.create_subscription(
                        user_id=user_id,
                        plan_name="free"
                    )
                return {"success": success}

            # Handle paid plan updates
            success = await billing_service.update_subscription(
                user_id=user_id,
                plan_name=request.plan_name,
                billing_cycle=request.billing_cycle
            )

        # Handle cancellation
        elif request.cancel_at_period_end is not None:
            success = await billing_service.cancel_subscription(
                user_id=user_id,
                immediate=not request.cancel_at_period_end
            )

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid update parameters provided"
            )

        return {"success": success}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update subscription"
        )

@router.post("/cancel")
async def cancel_subscription(
    immediate: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Cancel user's subscription"""
    try:
        user_id = current_user["id"]
        success = await billing_service.cancel_subscription(user_id, immediate)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to cancel subscription"
            )

        return {"success": True, "immediate": immediate}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error canceling subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel subscription"
        )

@router.post("/reactivate")
async def reactivate_subscription(current_user: dict = Depends(get_current_user)):
    """Reactivate a canceled subscription"""
    try:
        user_id = current_user["id"]

        # Get current subscription
        subscription = await subscription_service.get_user_subscription(user_id)
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No subscription found"
            )

        if not subscription.cancel_at_period_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Subscription is not scheduled for cancellation"
            )

        # Update subscription to not cancel at period end
        await supabase_client.table("user_subscriptions")\
            .update({"cancel_at_period_end": False})\
            .eq("id", subscription.id)\
            .execute()

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reactivating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reactivate subscription"
        )

@router.get("/billing-history", response_model=List[BillingEvent])
async def get_billing_history(current_user: dict = Depends(get_current_user)):
    """Get user's billing history"""
    try:
        user_id = current_user["id"]
        history = await billing_service.get_billing_history(user_id)
        return history
    except Exception as e:
        logger.error(f"Error fetching billing history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch billing history"
        )

@router.post("/create-payment-intent")
async def create_payment_intent(
    amount: int,
    currency: str = "usd",
    current_user: dict = Depends(get_current_user)
) -> PaymentIntent:
    """Create a payment intent for one-time charges"""
    try:
        user_id = current_user["id"]
        payment_intent = await billing_service.create_payment_intent(
            user_id=user_id,
            amount=amount,
            currency=currency
        )
        return payment_intent
    except Exception as e:
        logger.error(f"Error creating payment intent: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create payment intent"
        )

# Webhook endpoint (no auth required)

@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    try:
        body = await request.body()
        # In production, verify webhook signature here
        # sig_header = request.headers.get('stripe-signature')
        # event = stripe.Webhook.construct_event(body, sig_header, webhook_secret)

        # For now, parse JSON directly
        import json
        event_data = json.loads(body.decode('utf-8'))

        webhook_event = WebhookEvent(
            id=event_data.get('id'),
            type=event_data.get('type'),
            data=event_data.get('data', {}),
            created=event_data.get('created'),
            livemode=event_data.get('livemode', False)
        )

        success = await billing_service.handle_webhook(webhook_event)

        if success:
            return JSONResponse(status_code=200, content={"received": True})
        else:
            return JSONResponse(status_code=400, content={"error": "Failed to process webhook"})

    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        return JSONResponse(status_code=400, content={"error": str(e)})

# Usage limit checking endpoints

@router.get("/limits/check")
async def check_usage_limits(current_user: dict = Depends(get_current_user)):
    """Check current usage limits"""
    try:
        user_id = current_user["id"]
        can_proceed, message = await subscription_service.check_usage_limits(user_id)

        return {
            "can_proceed": can_proceed,
            "message": message,
            "status": "ok" if can_proceed else "limit_exceeded"
        }

    except Exception as e:
        logger.error(f"Error checking usage limits: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check usage limits"
        )

@router.post("/usage/increment")
async def increment_usage(
    is_cache_hit: bool = False,
    tokens_saved: int = 0,
    cost_saved: float = 0.0,
    current_user: dict = Depends(get_current_user)
):
    """Manually increment usage counters (for testing/admin)"""
    try:
        user_id = current_user["id"]
        await subscription_service.increment_usage(
            user_id=user_id,
            is_cache_hit=is_cache_hit,
            tokens_saved=tokens_saved,
            cost_saved=cost_saved
        )

        return {"success": True}

    except Exception as e:
        logger.error(f"Error incrementing usage: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to increment usage"
        )

# Admin endpoints (would require admin auth in production)

@router.post("/admin/grant-feature")
async def grant_feature(
    user_id: str,
    feature_name: str,
    expires_at: Optional[str] = None,
    # admin_user: dict = Depends(get_admin_user)  # Would implement admin auth
):
    """Grant a feature to a user (admin only)"""
    try:
        from datetime import datetime

        feature_data = {
            "user_id": user_id,
            "feature_name": feature_name,
            "is_enabled": True,
            "granted_by": "admin",  # Would use admin_user["id"] in production
            "expires_at": expires_at
        }

        await supabase_client.table("user_features")\
            .upsert(feature_data)\
            .execute()

        return {"success": True}

    except Exception as e:
        logger.error(f"Error granting feature: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to grant feature"
        )

@router.delete("/admin/revoke-feature")
async def revoke_feature(
    user_id: str,
    feature_name: str,
    # admin_user: dict = Depends(get_admin_user)  # Would implement admin auth
):
    """Revoke a feature from a user (admin only)"""
    try:
        await supabase_client.table("user_features")\
            .update({"is_enabled": False})\
            .eq("user_id", user_id)\
            .eq("feature_name", feature_name)\
            .execute()

        return {"success": True}

    except Exception as e:
        logger.error(f"Error revoking feature: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke feature"
        )