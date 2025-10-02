import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Use service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id;
  const tier = session.metadata?.tier;

  if (!userId || !tier) {
    console.error('Missing metadata in checkout session');
    return;
  }

  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  // Update user profile
  await supabase.rpc('update_subscription_tier', {
    user_id_param: userId,
    tier: tier,
    stripe_customer_id_param: customerId,
    stripe_subscription_id_param: subscriptionId,
  });

  console.log(`Checkout completed for user ${userId}, tier: ${tier}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id;
  const tier = subscription.metadata?.tier;

  if (!userId) {
    console.error('Missing user_id in subscription metadata');
    return;
  }

  const status = mapStripeStatus(subscription.status);

  // Get current period dates from subscription (use type assertion for Stripe API compatibility)
  const subData = subscription as any;
  const currentPeriodStart = subData.current_period_start
    ? new Date(subData.current_period_start * 1000).toISOString()
    : new Date().toISOString();
  const currentPeriodEnd = subData.current_period_end
    ? new Date(subData.current_period_end * 1000).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Update or insert subscription record
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      tier: tier || 'pro',
      status: status,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: subData.cancel_at_period_end || false,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'stripe_subscription_id',
    });

  if (error) {
    console.error('Error updating subscription:', error);
    return;
  }

  // Update user profile
  await supabase
    .from('user_profiles')
    .update({
      subscription_status: status,
      subscription_current_period_start: currentPeriodStart,
      subscription_current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  console.log(`Subscription updated for user ${userId}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id;

  if (!userId) {
    console.error('Missing user_id in subscription metadata');
    return;
  }

  // Downgrade to free tier
  await supabase.rpc('update_subscription_tier', {
    user_id_param: userId,
    tier: 'free',
  });

  // Update subscription record
  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  console.log(`Subscription deleted for user ${userId}, downgraded to free`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const invoiceData = invoice as any;
  const subscriptionId = invoiceData.subscription as string;

  if (!subscriptionId) return;

  // Mark subscription as active
  await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  console.log(`Payment succeeded for subscription ${subscriptionId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const invoiceData = invoice as any;
  const subscriptionId = invoiceData.subscription as string;

  if (!subscriptionId) return;

  // Mark subscription as past_due
  await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  // Get user for notification
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (subscription) {
    await supabase
      .from('user_profiles')
      .update({
        subscription_status: 'past_due',
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.user_id);
  }

  console.log(`Payment failed for subscription ${subscriptionId}`);
}

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  const statusMap: Record<string, string> = {
    active: 'active',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'canceled',
    past_due: 'past_due',
    trialing: 'active',
    unpaid: 'past_due',
  };

  return statusMap[stripeStatus] || 'incomplete';
}
