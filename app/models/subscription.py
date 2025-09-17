from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class PlanType(str, Enum):
    FREE = "free"
    STARTUP = "startup"
    BUSINESS = "business"
    ENTERPRISE = "enterprise"

class BillingCycle(str, Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"

class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    CANCELED = "canceled"
    PAST_DUE = "past_due"
    UNPAID = "unpaid"

class AlertType(str, Enum):
    USAGE_WARNING = "usage_warning"
    LIMIT_EXCEEDED = "limit_exceeded"
    BILLING_ISSUE = "billing_issue"

class SubscriptionPlan(BaseModel):
    id: str
    name: str
    display_name: str
    description: Optional[str] = None
    monthly_price: float
    yearly_price: float
    monthly_requests: int
    max_cache_entries: int
    api_keys_limit: int
    analytics_retention_days: int
    priority_support: bool = False
    custom_models: bool = False
    team_collaboration: bool = False
    advanced_caching: bool = False
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

class UserSubscription(BaseModel):
    id: str
    user_id: str
    plan_id: str
    stripe_subscription_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    status: SubscriptionStatus
    billing_cycle: BillingCycle
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    trial_end: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

class MonthlyUsage(BaseModel):
    id: str
    user_id: str
    subscription_id: Optional[str] = None
    year: int
    month: int
    requests_made: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    tokens_saved: int = 0
    cost_saved: float = 0
    overage_requests: int = 0
    overage_cost: float = 0
    created_at: datetime
    updated_at: datetime

class UserFeature(BaseModel):
    id: str
    user_id: str
    feature_name: str
    is_enabled: bool = True
    granted_at: datetime
    expires_at: Optional[datetime] = None
    granted_by: str = "system"
    metadata: dict = {}
    created_at: datetime
    updated_at: datetime

class UsageAlert(BaseModel):
    id: str
    user_id: str
    alert_type: AlertType
    threshold_percentage: int = 80
    is_active: bool = True
    last_triggered: Optional[datetime] = None
    created_at: datetime

class BillingEvent(BaseModel):
    id: str
    user_id: str
    subscription_id: Optional[str] = None
    event_type: str
    stripe_event_id: Optional[str] = None
    event_data: dict = {}
    processed: bool = False
    created_at: datetime

# Request/Response Models
class CreateSubscriptionRequest(BaseModel):
    plan_name: str
    billing_cycle: BillingCycle = BillingCycle.MONTHLY
    payment_method_id: Optional[str] = None

class UpdateSubscriptionRequest(BaseModel):
    plan_name: Optional[str] = None
    billing_cycle: Optional[BillingCycle] = None
    cancel_at_period_end: Optional[bool] = None

class SubscriptionDetails(BaseModel):
    subscription: UserSubscription
    plan: SubscriptionPlan
    usage: MonthlyUsage
    features: List[UserFeature] = []
    alerts: List[UsageAlert] = []

class UsageStats(BaseModel):
    current_month: MonthlyUsage
    previous_months: List[MonthlyUsage]
    usage_percentage: float
    requests_remaining: int
    days_until_reset: int
    is_over_limit: bool = False

class PricingInfo(BaseModel):
    plans: List[SubscriptionPlan]
    current_plan: Optional[str] = None
    recommended_plan: Optional[str] = None

class WebhookEvent(BaseModel):
    id: str
    type: str
    data: dict
    created: int
    livemode: bool

class PaymentIntent(BaseModel):
    id: str
    amount: int
    currency: str
    status: str
    client_secret: Optional[str] = None