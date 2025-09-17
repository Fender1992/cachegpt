# Setup Instructions for New Features

## 1. Database Setup (REQUIRED)

You need to run the new subscription tables script in your Supabase SQL Editor:

### Step 1: Run the subscription setup script
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `sql/setup_subscriptions.sql`
4. Click "Run" to create the subscription tables

This will create:
- `subscription_plans` table with 4 tiers (Free, Startup, Business, Enterprise)
- `user_subscriptions` table for tracking user plans
- `monthly_usage` table for usage tracking
- `user_features` table for feature flags
- `billing_history` table for payment records

## 2. Backend Dependencies

The required Python packages are already in `requirements.txt`, but make sure you have:

```bash
pip install slowapi python-jose[cryptography] passlib[bcrypt]
```

## 3. Environment Variables

Add these new variables to your `.env` file:

```env
# JWT Settings (add these if not already present)
JWT_SECRET_KEY=your-secret-key-here-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=15

# Stripe Settings (for future payment integration)
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

## 4. Test the New Features

### Test Security Features:
1. Rate limiting is automatically applied (200 requests/min)
2. Input validation protects against SQL injection and XSS
3. Security headers are added to all responses

### Test Subscription Features:
1. New users automatically get the Free plan (1,000 requests/month)
2. Visit `/pricing` page to see all plans
3. API endpoints for subscription management:
   - `GET /api/subscription` - View current subscription
   - `POST /api/subscription/upgrade` - Upgrade plan
   - `GET /api/subscription/usage` - View usage stats

### Test API Key Limits:
- Free plan: 1 API key max
- Startup plan: 5 API keys max
- Business plan: 25 API keys max
- Enterprise: Unlimited

## 5. Verify Everything is Working

### Backend:
```bash
cd app
uvicorn main:app --reload
```

Check for any errors in the console. The app should start with security middleware active.

### Frontend:
```bash
cd frontend
yarn dev
```

Visit http://localhost:3000/pricing to see the new pricing page.

## Important Notes

1. **All new users automatically get the Free plan** with 1,000 requests/month
2. **Rate limiting is active** - 200 requests per minute per IP
3. **Security headers are enforced** - This might affect some development tools
4. **Authentication is required** for most API endpoints now

## Troubleshooting

If you get errors:

1. **"subscription_plans table not found"** - Run the `sql/setup_subscriptions.sql` script
2. **"JWT_SECRET_KEY not set"** - Add the JWT settings to your .env file
3. **"slowapi not found"** - Run `pip install slowapi`
4. **CORS errors** - The security middleware includes proper CORS setup for localhost:3000

## What's New Summary

✅ **Pricing Tiers**: Free, Startup ($29), Business ($199), Enterprise (custom)
✅ **Usage Limits**: Automatic tracking and enforcement
✅ **Security**: Rate limiting, input validation, security headers
✅ **Feature Gates**: Plan-based feature restrictions
✅ **Professional UI**: New pricing page with plan comparison