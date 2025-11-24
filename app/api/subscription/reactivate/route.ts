import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthentication, isUnifiedSession } from '@/lib/unified-auth-resolver';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Admin client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Authenticate user using unified auth resolver
    const authResult = await resolveAuthentication(req);

    if (!isUnifiedSession(authResult)) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = authResult.user.id;

    // Get user's subscription details
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('stripe_subscription_id, subscription_tier')
      .eq('id', userId)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to fetch subscription details' },
        { status: 500 }
      );
    }

    if (!profile?.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    if (profile.subscription_tier === 'free') {
      return NextResponse.json(
        { error: 'You are on the free plan and have no subscription to reactivate' },
        { status: 400 }
      );
    }

    // Check if subscription is set to cancel
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('cancel_at_period_end, status')
      .eq('stripe_subscription_id', profile.stripe_subscription_id)
      .single();

    if (!subscription?.cancel_at_period_end) {
      return NextResponse.json(
        { error: 'Subscription is not scheduled for cancellation' },
        { status: 400 }
      );
    }

    if (subscription.status === 'canceled') {
      return NextResponse.json(
        { error: 'Subscription is already canceled. Please subscribe again from the pricing page.' },
        { status: 400 }
      );
    }

    // Reactivate subscription in Stripe
    await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      {
        cancel_at_period_end: false,
      }
    );

    // Update subscriptions table
    await supabaseAdmin
      .from('subscriptions')
      .update({
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', profile.stripe_subscription_id);

    return NextResponse.json({
      success: true,
      message: 'Subscription has been reactivated successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to reactivate subscription' },
      { status: 500 }
    );
  }
}
