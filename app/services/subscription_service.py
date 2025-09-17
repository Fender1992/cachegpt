"""Subscription and billing management service"""
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from app.database.supabase_client import SupabaseClient

class SubscriptionService:
    def __init__(self):
        self.client = SupabaseClient().client

    async def get_user_subscription(self, user_id: str) -> Dict[str, Any]:
        """Get user's current subscription with plan details"""
        try:
            result = self.client.table("user_subscriptions").select("""
                *,
                subscription_plans (
                    name, display_name, price_cents, monthly_requests,
                    max_api_keys, cache_retention_days, similarity_threshold_custom,
                    advanced_analytics, priority_support, sso_integration,
                    white_label, ab_testing, webhooks, features
                )
            """).eq("user_id", user_id).single().execute()

            if not result.data:
                # Create free tier subscription for new users
                return await self.assign_free_plan(user_id)

            return result.data
        except Exception as e:
            print(f"Error getting subscription: {e}")
            # Return free plan as fallback
            return await self.assign_free_plan(user_id)

    async def assign_free_plan(self, user_id: str) -> Dict[str, Any]:
        """Assign free plan to new user"""
        try:
            # Get free plan
            free_plan = self.client.table("subscription_plans").select("*").eq("name", "free").single().execute()

            if not free_plan.data:
                raise Exception("Free plan not found in database")

            # Check if subscription already exists
            existing = self.client.table("user_subscriptions").select("*").eq("user_id", user_id).single().execute()

            if existing.data:
                return existing.data

            # Create new subscription
            subscription_data = {
                "user_id": user_id,
                "plan_id": free_plan.data["id"],
                "status": "active",
                "current_period_start": datetime.now().isoformat(),
                "current_period_end": (datetime.now() + timedelta(days=30)).isoformat()
            }

            result = self.client.table("user_subscriptions").insert(subscription_data).execute()

            # Return subscription with plan data
            return {
                **result.data[0],
                "subscription_plans": free_plan.data
            }
        except Exception as e:
            print(f"Error assigning free plan: {e}")
            # Return minimal free plan data as fallback
            return {
                "status": "active",
                "subscription_plans": {
                    "name": "free",
                    "display_name": "Developer",
                    "monthly_requests": 1000,
                    "max_api_keys": 1,
                    "cache_retention_days": 1
                }
            }

    async def check_usage_limits(self, user_id: str) -> Dict[str, Any]:
        """Check if user has exceeded usage limits"""
        try:
            subscription = await self.get_user_subscription(user_id)
            plan = subscription.get("subscription_plans", {})

            # Get current month usage
            current_month = datetime.now().strftime("%Y-%m")
            usage_result = self.client.table("monthly_usage").select("*").eq("user_id", user_id).eq("month_year", current_month).single().execute()

            current_usage = usage_result.data["requests_used"] if usage_result.data else 0
            monthly_limit = plan.get("monthly_requests")

            return {
                "within_limits": monthly_limit is None or current_usage < monthly_limit,
                "current_usage": current_usage,
                "monthly_limit": monthly_limit,
                "overage": max(0, current_usage - (monthly_limit or 0)) if monthly_limit else 0,
                "plan_name": plan.get("name", "free")
            }
        except Exception as e:
            print(f"Error checking usage limits: {e}")
            # Default to within limits on error
            return {
                "within_limits": True,
                "current_usage": 0,
                "monthly_limit": 1000,
                "overage": 0,
                "plan_name": "free"
            }

    async def increment_usage(self, user_id: str, requests_count: int = 1, cache_hit: bool = False) -> None:
        """Increment user's monthly usage"""
        try:
            current_month = datetime.now().strftime("%Y-%m")

            # Get existing usage
            existing = self.client.table("monthly_usage").select("*").eq("user_id", user_id).eq("month_year", current_month).single().execute()

            if existing.data:
                # Update existing record
                update_data = {
                    "requests_used": existing.data["requests_used"] + requests_count,
                    "updated_at": datetime.now().isoformat()
                }

                if cache_hit:
                    update_data["cache_hits"] = existing.data.get("cache_hits", 0) + 1
                else:
                    update_data["cache_misses"] = existing.data.get("cache_misses", 0) + 1

                self.client.table("monthly_usage").update(update_data).eq("id", existing.data["id"]).execute()
            else:
                # Create new record
                insert_data = {
                    "user_id": user_id,
                    "month_year": current_month,
                    "requests_used": requests_count,
                    "cache_hits": 1 if cache_hit else 0,
                    "cache_misses": 0 if cache_hit else 1
                }

                self.client.table("monthly_usage").insert(insert_data).execute()
        except Exception as e:
            print(f"Error incrementing usage: {e}")

    async def can_create_api_key(self, user_id: str) -> bool:
        """Check if user can create more API keys"""
        try:
            subscription = await self.get_user_subscription(user_id)
            plan = subscription.get("subscription_plans", {})

            # Count active API keys
            current_keys = self.client.table("api_keys").select("id").eq("user_id", user_id).eq("is_active", True).execute()
            current_count = len(current_keys.data) if current_keys.data else 0

            max_keys = plan.get("max_api_keys", 1)
            return max_keys is None or current_count < max_keys
        except Exception as e:
            print(f"Error checking API key limit: {e}")
            return False

    async def has_feature(self, user_id: str, feature_name: str) -> bool:
        """Check if user has access to a specific feature"""
        try:
            subscription = await self.get_user_subscription(user_id)
            plan = subscription.get("subscription_plans", {})

            # Check built-in plan features
            if feature_name == "custom_similarity":
                return plan.get("similarity_threshold_custom", False)
            elif feature_name == "advanced_analytics":
                return plan.get("advanced_analytics", False)
            elif feature_name == "priority_support":
                return plan.get("priority_support", False)
            elif feature_name == "sso":
                return plan.get("sso_integration", False)
            elif feature_name == "white_label":
                return plan.get("white_label", False)
            elif feature_name == "ab_testing":
                return plan.get("ab_testing", False)
            elif feature_name == "webhooks":
                return plan.get("webhooks", False)

            # Check JSON features
            plan_features = plan.get("features", {})
            if feature_name in plan_features:
                return plan_features[feature_name] is not False

            # Check user-level feature flags
            feature_result = self.client.table("user_features").select("enabled").eq("user_id", user_id).eq("feature_name", feature_name).single().execute()

            return feature_result.data["enabled"] if feature_result.data else False
        except Exception as e:
            print(f"Error checking feature access: {e}")
            return False

    async def upgrade_plan(self, user_id: str, plan_name: str, stripe_subscription_id: Optional[str] = None) -> Dict[str, Any]:
        """Upgrade user to a new plan"""
        try:
            # Get the new plan
            new_plan = self.client.table("subscription_plans").select("*").eq("name", plan_name).single().execute()

            if not new_plan.data:
                raise Exception(f"Plan {plan_name} not found")

            # Update user subscription
            update_data = {
                "plan_id": new_plan.data["id"],
                "status": "active",
                "current_period_start": datetime.now().isoformat(),
                "current_period_end": (datetime.now() + timedelta(days=30)).isoformat(),
                "updated_at": datetime.now().isoformat()
            }

            if stripe_subscription_id:
                update_data["stripe_subscription_id"] = stripe_subscription_id

            result = self.client.table("user_subscriptions").update(update_data).eq("user_id", user_id).execute()

            return {
                **result.data[0],
                "subscription_plans": new_plan.data
            }
        except Exception as e:
            print(f"Error upgrading plan: {e}")
            raise

    async def get_usage_history(self, user_id: str, months: int = 12) -> list:
        """Get usage history for the last N months"""
        try:
            # Calculate start date
            start_date = datetime.now() - timedelta(days=months * 30)
            start_month = start_date.strftime("%Y-%m")

            result = self.client.table("monthly_usage").select("*").eq("user_id", user_id).gte("month_year", start_month).order("month_year", desc=False).execute()

            return result.data if result.data else []
        except Exception as e:
            print(f"Error getting usage history: {e}")
            return []

# Create singleton instance
subscription_service = SubscriptionService()