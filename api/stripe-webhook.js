import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { buffer } from 'micro';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

async function handleSubscriptionCreated(subscription) {
  const userId = subscription.metadata.userId;
  const planId = subscription.metadata.planId;

  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      plan_id: planId,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log(`Subscription created for user ${userId}`);
}

async function handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata.userId;

  const updateData = {
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };

  if (subscription.canceled_at) {
    updateData.cancelled_at = new Date(subscription.canceled_at * 1000).toISOString();
  }

  const { error } = await supabase
    .from('user_subscriptions')
    .update(updateData)
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log(`Subscription updated for user ${userId}`);
}

async function handleSubscriptionDeleted(subscription) {
  const userId = subscription.metadata.userId;

  const { data: freePlan, error: planError } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('name', 'free')
    .single();

  if (planError) {
    console.error('Failed to find free plan:', planError);
    throw planError;
  }

  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      plan_id: freePlan.id,
      status: 'active',
      stripe_subscription_id: null,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelled_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to downgrade to free plan:', error);
    throw error;
  }

  console.log(`User ${userId} downgraded to free plan`);
}

async function handleInvoicePaymentSucceeded(invoice) {
  const subscription = invoice.subscription;
  const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;

  if (!userId) {
    console.error('No userId in invoice metadata');
    return;
  }

  const { error } = await supabase
    .from('billing_history')
    .insert({
      user_id: userId,
      invoice_id: invoice.id,
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_paid,
      currency: invoice.currency.toUpperCase(),
      status: 'paid',
      description: `Payment for ${invoice.lines.data[0]?.description || 'subscription'}`,
      billing_period_start: new Date(invoice.period_start * 1000).toISOString(),
      billing_period_end: new Date(invoice.period_end * 1000).toISOString(),
      paid_at: new Date(invoice.status_transitions.paid_at * 1000).toISOString()
    });

  if (error) {
    console.error('Failed to record billing history:', error);
  }

  console.log(`Invoice payment recorded for user ${userId}`);
}

async function handleInvoicePaymentFailed(invoice) {
  const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;

  if (!userId) {
    console.error('No userId in invoice metadata');
    return;
  }

  const { error: billingError } = await supabase
    .from('billing_history')
    .insert({
      user_id: userId,
      invoice_id: invoice.id,
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_due,
      currency: invoice.currency.toUpperCase(),
      status: 'failed',
      description: 'Payment failed',
      billing_period_start: new Date(invoice.period_start * 1000).toISOString(),
      billing_period_end: new Date(invoice.period_end * 1000).toISOString()
    });

  if (billingError) {
    console.error('Failed to record failed payment:', billingError);
  }

  const { error: subError } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', invoice.subscription);

  if (subError) {
    console.error('Failed to update subscription status:', subError);
  }

  console.log(`Payment failed for user ${userId}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
    return;
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        console.log('Trial ending soon for:', event.data.object.metadata.userId);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error(`Webhook handler error: ${error.message}`);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}