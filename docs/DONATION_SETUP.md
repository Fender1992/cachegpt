# Donation System Setup

## Database

### Tables
- **`donations`** — stores each donation record (amount, donor, message, Stripe session ID, status)
- **`public_donation_stats`** — aggregated view exposing total donations and donor count (no PII)

### SQL Scripts
- `database-scripts/052_donations_table.sql` — run this against your Supabase instance to create the table and view

## API

### `POST /api/donate`
Creates a Stripe Checkout session for a one-time donation.

**Request body:**
```json
{
  "amount": 2500,
  "message": "Thanks for CacheGPT!",
  "is_anonymous": false
}
```
- `amount` is in cents (minimum 100, maximum 1000000)
- `message` is optional (max 500 chars)
- `is_anonymous` defaults to false

**Response:**
```json
{ "url": "https://checkout.stripe.com/..." }
```

### Webhook: `checkout.session.completed`
The existing Stripe webhook handler at `/api/webhooks/stripe` processes `checkout.session.completed` events for donations, updating the donation record status to `completed`.

## Pages

| Route | Description |
|-------|-------------|
| `/donate` | Amount selection, message input, Stripe redirect |
| `/donate/success` | Thank-you page with confetti, auto-redirects to dashboard |

## Footer
A "Donate" link has been added to the site footer, visible on all pages.

## Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side Stripe API calls |
| `STRIPE_WEBHOOK_SECRET` | Verifying Stripe webhook signatures |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase operations |
