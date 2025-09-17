from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import logging
import uuid
from app.models.subscription import (
    CreateSubscriptionRequest, PaymentIntent, WebhookEvent,
    BillingCycle, SubscriptionStatus, BillingEvent
)
from .subscription_service import subscription_service
from app.database.supabase_client import supabase_client

logger = logging.getLogger(__name__)

class MockStripeService:
    """Mock Stripe service for development and testing"""

    def __init__(self):
        self.customers = {}
        self.subscriptions = {}
        self.payment_intents = {}
        self.events = []

    def create_customer(self, email: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Mock Stripe customer creation"""
        customer_id = f"cus_{uuid.uuid4().hex[:24]}"
        customer = {
            "id": customer_id,
            "email": email,
            "name": name,
            "created": int(datetime.now().timestamp()),
            "metadata": {}
        }
        self.customers[customer_id] = customer
        return customer

    def create_subscription(self, customer_id: str, price_id: str,
                          payment_method_id: Optional[str] = None) -> Dict[str, Any]:
        """Mock Stripe subscription creation"""
        subscription_id = f"sub_{uuid.uuid4().hex[:24]}"
        now = datetime.now()

        subscription = {
            "id": subscription_id,
            "customer": customer_id,
            "status": "active",
            "current_period_start": int(now.timestamp()),
            "current_period_end": int((now + timedelta(days=30)).timestamp()),
            "items": {
                "data": [{
                    "id": f"si_{uuid.uuid4().hex[:24]}",
                    "price": {"id": price_id}
                }]
            },
            "latest_invoice": {
                "payment_intent": {
                    "status": "succeeded",
                    "client_secret": f"pi_{uuid.uuid4().hex[:24]}_secret_{uuid.uuid4().hex[:16]}"
                }
            },
            "metadata": {}
        }

        self.subscriptions[subscription_id] = subscription
        return subscription

    def update_subscription(self, subscription_id: str, **kwargs) -> Dict[str, Any]:
        """Mock Stripe subscription update"""
        if subscription_id not in self.subscriptions:
            raise ValueError(f"Subscription {subscription_id} not found")

        subscription = self.subscriptions[subscription_id]
        subscription.update(kwargs)
        return subscription

    def cancel_subscription(self, subscription_id: str, at_period_end: bool = True) -> Dict[str, Any]:
        """Mock Stripe subscription cancellation"""
        if subscription_id not in self.subscriptions:
            raise ValueError(f"Subscription {subscription_id} not found")

        subscription = self.subscriptions[subscription_id]
        if at_period_end:
            subscription["cancel_at_period_end"] = True
        else:
            subscription["status"] = "canceled"
            subscription["canceled_at"] = int(datetime.now().timestamp())

        return subscription

    def create_payment_intent(self, amount: int, currency: str = "usd",
                            customer_id: Optional[str] = None) -> Dict[str, Any]:
        """Mock Stripe payment intent creation"""
        payment_intent_id = f"pi_{uuid.uuid4().hex[:24]}"
        client_secret = f"{payment_intent_id}_secret_{uuid.uuid4().hex[:16]}"

        payment_intent = {
            "id": payment_intent_id,
            "amount": amount,
            "currency": currency,
            "status": "requires_payment_method",
            "client_secret": client_secret,
            "customer": customer_id,
            "created": int(datetime.now().timestamp()),
            "metadata": {}
        }

        self.payment_intents[payment_intent_id] = payment_intent
        return payment_intent

    def confirm_payment_intent(self, payment_intent_id: str,
                             payment_method_id: str) -> Dict[str, Any]:
        """Mock Stripe payment intent confirmation"""
        if payment_intent_id not in self.payment_intents:
            raise ValueError(f"Payment intent {payment_intent_id} not found")

        payment_intent = self.payment_intents[payment_intent_id]
        payment_intent["status"] = "succeeded"
        payment_intent["payment_method"] = payment_method_id

        return payment_intent

    def create_webhook_event(self, event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Mock Stripe webhook event"""
        event = {
            "id": f"evt_{uuid.uuid4().hex[:24]}",
            "type": event_type,
            "created": int(datetime.now().timestamp()),
            "data": {"object": data},
            "livemode": False,
            "pending_webhooks": 1,
            "request": {"id": None, "idempotency_key": None}
        }

        self.events.append(event)
        return event

class BillingService:
    """Billing service that handles subscription payments and Stripe integration"""

    def __init__(self):
        # In production, initialize real Stripe client here
        # import stripe
        # stripe.api_key = settings.stripe_secret_key
        # self.stripe = stripe

        # For now, use mock service
        self.stripe = MockStripeService()
        self.supabase = supabase_client

        # Price mapping (in production, these would be actual Stripe price IDs)
        self.price_mapping = {
            ("startup", "monthly"): "price_startup_monthly",
            ("startup", "yearly"): "price_startup_yearly",
            ("business", "monthly"): "price_business_monthly",
            ("business", "yearly"): "price_business_yearly",
            ("enterprise", "monthly"): "price_enterprise_monthly",
            ("enterprise", "yearly"): "price_enterprise_yearly",
        }

    async def create_customer(self, user_id: str, email: str, name: Optional[str] = None) -> str:
        """Create a Stripe customer for a user"""
        try:
            customer = self.stripe.create_customer(email=email, name=name)

            # Store customer ID in user profile
            await self.supabase.table("user_profiles")\
                .update({"stripe_customer_id": customer["id"]})\
                .eq("id", user_id)\
                .execute()

            logger.info(f"Created Stripe customer {customer['id']} for user {user_id}")
            return customer["id"]

        except Exception as e:
            logger.error(f"Error creating Stripe customer for user {user_id}: {e}")
            raise

    async def create_subscription(self, user_id: str, request: CreateSubscriptionRequest) -> Dict[str, Any]:
        """Create a new subscription with payment"""
        try:
            # Get user's email for customer creation
            user_response = await self.supabase.table("user_profiles")\
                .select("email, stripe_customer_id")\
                .eq("id", user_id)\
                .single()\
                .execute()

            if not user_response.data:
                raise ValueError("User not found")

            user_data = user_response.data
            customer_id = user_data.get("stripe_customer_id")

            # Create Stripe customer if not exists
            if not customer_id:
                customer_id = await self.create_customer(user_id, user_data["email"])

            # Get price ID for the plan and billing cycle
            price_key = (request.plan_name, request.billing_cycle.value)
            price_id = self.price_mapping.get(price_key)

            if not price_id:
                raise ValueError(f"No price found for {request.plan_name} {request.billing_cycle.value}")

            # Create Stripe subscription
            stripe_subscription = self.stripe.create_subscription(
                customer_id=customer_id,
                price_id=price_id,
                payment_method_id=request.payment_method_id
            )

            # Create internal subscription record
            subscription = await subscription_service.create_subscription(
                user_id=user_id,
                plan_name=request.plan_name,
                billing_cycle=request.billing_cycle,
                stripe_subscription_id=stripe_subscription["id"],
                stripe_customer_id=customer_id
            )

            # Log billing event
            await self._log_billing_event(
                user_id=user_id,
                subscription_id=subscription.id,
                event_type="subscription_created",
                event_data={
                    "stripe_subscription_id": stripe_subscription["id"],
                    "plan_name": request.plan_name,
                    "billing_cycle": request.billing_cycle.value
                }
            )

            return {
                "subscription": subscription.dict(),
                "client_secret": stripe_subscription["latest_invoice"]["payment_intent"]["client_secret"]
            }

        except Exception as e:
            logger.error(f"Error creating subscription for user {user_id}: {e}")
            raise

    async def update_subscription(self, user_id: str, plan_name: str,
                                billing_cycle: Optional[BillingCycle] = None) -> bool:
        """Update an existing subscription"""
        try:
            # Get current subscription
            subscription = await subscription_service.get_user_subscription(user_id)
            if not subscription or not subscription.stripe_subscription_id:
                raise ValueError("No active subscription found")

            # Get new price ID
            cycle = billing_cycle or subscription.billing_cycle
            price_key = (plan_name, cycle.value)
            price_id = self.price_mapping.get(price_key)

            if not price_id:
                raise ValueError(f"No price found for {plan_name} {cycle.value}")

            # Update Stripe subscription
            self.stripe.update_subscription(
                subscription.stripe_subscription_id,
                items=[{"price": price_id}],
                proration_behavior="always_invoice"
            )

            # Update internal subscription
            await subscription_service.create_subscription(
                user_id=user_id,
                plan_name=plan_name,
                billing_cycle=cycle,
                stripe_subscription_id=subscription.stripe_subscription_id,
                stripe_customer_id=subscription.stripe_customer_id
            )

            # Log billing event
            await self._log_billing_event(
                user_id=user_id,
                subscription_id=subscription.id,
                event_type="subscription_updated",
                event_data={
                    "old_plan": subscription.plan_id,
                    "new_plan": plan_name,
                    "billing_cycle": cycle.value
                }
            )

            return True

        except Exception as e:
            logger.error(f"Error updating subscription for user {user_id}: {e}")
            raise

    async def cancel_subscription(self, user_id: str, immediate: bool = False) -> bool:
        """Cancel a user's subscription"""
        try:
            # Get current subscription
            subscription = await subscription_service.get_user_subscription(user_id)
            if not subscription or not subscription.stripe_subscription_id:
                raise ValueError("No active subscription found")

            # Cancel Stripe subscription
            self.stripe.cancel_subscription(
                subscription.stripe_subscription_id,
                at_period_end=not immediate
            )

            # Update internal subscription
            success = await subscription_service.cancel_subscription(user_id, immediate)

            # Log billing event
            await self._log_billing_event(
                user_id=user_id,
                subscription_id=subscription.id,
                event_type="subscription_canceled",
                event_data={
                    "immediate": immediate,
                    "canceled_at": datetime.now().isoformat()
                }
            )

            return success

        except Exception as e:
            logger.error(f"Error canceling subscription for user {user_id}: {e}")
            return False

    async def create_payment_intent(self, user_id: str, amount: int,
                                  currency: str = "usd") -> PaymentIntent:
        """Create a payment intent for one-time charges"""
        try:
            # Get user's customer ID
            user_response = await self.supabase.table("user_profiles")\
                .select("stripe_customer_id")\
                .eq("id", user_id)\
                .single()\
                .execute()

            customer_id = user_response.data.get("stripe_customer_id") if user_response.data else None

            # Create payment intent
            stripe_intent = self.stripe.create_payment_intent(
                amount=amount,
                currency=currency,
                customer_id=customer_id
            )

            return PaymentIntent(
                id=stripe_intent["id"],
                amount=stripe_intent["amount"],
                currency=stripe_intent["currency"],
                status=stripe_intent["status"],
                client_secret=stripe_intent["client_secret"]
            )

        except Exception as e:
            logger.error(f"Error creating payment intent for user {user_id}: {e}")
            raise

    async def handle_webhook(self, webhook_event: WebhookEvent) -> bool:
        """Handle Stripe webhook events"""
        try:
            event_type = webhook_event.type
            event_data = webhook_event.data

            logger.info(f"Processing webhook event: {event_type}")

            if event_type == "customer.subscription.updated":
                await self._handle_subscription_updated(event_data)
            elif event_type == "customer.subscription.deleted":
                await self._handle_subscription_deleted(event_data)
            elif event_type == "invoice.payment_succeeded":
                await self._handle_payment_succeeded(event_data)
            elif event_type == "invoice.payment_failed":
                await self._handle_payment_failed(event_data)
            else:
                logger.info(f"Unhandled webhook event type: {event_type}")

            return True

        except Exception as e:
            logger.error(f"Error handling webhook event {webhook_event.id}: {e}")
            return False

    async def get_billing_history(self, user_id: str) -> List[BillingEvent]:
        """Get billing history for a user"""
        try:
            response = await self.supabase.table("billing_events")\
                .select("*")\
                .eq("user_id", user_id)\
                .order("created_at", desc=True)\
                .limit(50)\
                .execute()

            return [BillingEvent(**event) for event in response.data]

        except Exception as e:
            logger.error(f"Error fetching billing history for user {user_id}: {e}")
            return []

    # Private helper methods

    async def _log_billing_event(self, user_id: str, subscription_id: str,
                                event_type: str, event_data: Dict[str, Any],
                                stripe_event_id: Optional[str] = None):
        """Log a billing event"""
        try:
            await self.supabase.table("billing_events")\
                .insert({
                    "user_id": user_id,
                    "subscription_id": subscription_id,
                    "event_type": event_type,
                    "stripe_event_id": stripe_event_id,
                    "event_data": event_data,
                    "processed": True
                })\
                .execute()

        except Exception as e:
            logger.error(f"Error logging billing event: {e}")

    async def _handle_subscription_updated(self, event_data: Dict[str, Any]):
        """Handle subscription updated webhook"""
        stripe_subscription = event_data
        subscription_id = stripe_subscription["id"]

        # Find internal subscription
        response = await self.supabase.table("user_subscriptions")\
            .select("*")\
            .eq("stripe_subscription_id", subscription_id)\
            .single()\
            .execute()

        if not response.data:
            logger.warning(f"Subscription {subscription_id} not found in database")
            return

        # Update subscription status
        await self.supabase.table("user_subscriptions")\
            .update({
                "status": stripe_subscription["status"],
                "current_period_start": datetime.fromtimestamp(stripe_subscription["current_period_start"]),
                "current_period_end": datetime.fromtimestamp(stripe_subscription["current_period_end"]),
                "cancel_at_period_end": stripe_subscription.get("cancel_at_period_end", False),
                "updated_at": datetime.now().isoformat()
            })\
            .eq("stripe_subscription_id", subscription_id)\
            .execute()

    async def _handle_subscription_deleted(self, event_data: Dict[str, Any]):
        """Handle subscription deleted webhook"""
        stripe_subscription = event_data
        subscription_id = stripe_subscription["id"]

        # Update internal subscription
        await self.supabase.table("user_subscriptions")\
            .update({
                "status": SubscriptionStatus.CANCELED.value,
                "updated_at": datetime.now().isoformat()
            })\
            .eq("stripe_subscription_id", subscription_id)\
            .execute()

    async def _handle_payment_succeeded(self, event_data: Dict[str, Any]):
        """Handle successful payment webhook"""
        invoice = event_data
        subscription_id = invoice.get("subscription")

        if subscription_id:
            # Update subscription status to active
            await self.supabase.table("user_subscriptions")\
                .update({
                    "status": SubscriptionStatus.ACTIVE.value,
                    "updated_at": datetime.now().isoformat()
                })\
                .eq("stripe_subscription_id", subscription_id)\
                .execute()

    async def _handle_payment_failed(self, event_data: Dict[str, Any]):
        """Handle failed payment webhook"""
        invoice = event_data
        subscription_id = invoice.get("subscription")

        if subscription_id:
            # Update subscription status to past due
            await self.supabase.table("user_subscriptions")\
                .update({
                    "status": SubscriptionStatus.PAST_DUE.value,
                    "updated_at": datetime.now().isoformat()
                })\
                .eq("stripe_subscription_id", subscription_id)\
                .execute()

# Global instance
billing_service = BillingService()