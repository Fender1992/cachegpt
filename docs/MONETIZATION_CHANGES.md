# Monetization Changes: Paywall to Free Pivot

## Overview

CacheGPT has transitioned from a tiered paywall model to a completely free service supported by voluntary donations.

## Changes Made

### Rate Limits Unified
- All tiers (free, pro, enterprise) now receive **500 requests/day** (15,000/month)
- The rate limiter treats every user identically regardless of tier
- No feature gating or usage restrictions

### Upgrade CTAs Removed
- All "Upgrade to Pro" buttons and banners have been removed from the UI
- Pricing page converted to a "Free Forever" landing page with donation section
- No upsell modals or upgrade prompts remain in the application

### Donation System Added
- Stripe-powered one-time donation flow (no subscriptions)
- Preset amounts ($5, $10, $25, $50, $100) plus custom amount input
- Optional donor message and anonymous donation toggle
- Thank-you page with confetti animation and auto-redirect to dashboard

### Database Changes
- `051_free_tier_pivot.sql` — sets all tier limits to 500 req/day
- `052_donations_table.sql` — creates `donations` table and `public_donation_stats` view

### UI Updates
- Footer includes a "Donate" link
- Pricing page highlights the free tier with donation encouragement
- Dashboard and settings no longer reference paid plans
