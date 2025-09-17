import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const { method } = req;

  switch (method) {
    case 'GET':
      return getSubscription(req, res);
    case 'POST':
      return createCheckoutSession(req, res);
    case 'PUT':
      return updateSubscription(req, res);
    case 'DELETE':
      return cancelSubscription(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

async function getSubscription(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .rpc('get_user_subscription', { p_user_id: user.id });

    if (error) {
      console.error('Error fetching subscription:', error);
      return res.status(500).json({ error: 'Failed to fetch subscription' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    return res.status(200).json(data[0]);
  } catch (error) {
    console.error('Subscription fetch error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createCheckoutSession(req, res) {
  try {
    const { planName, successUrl, cancelUrl } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', planName)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (plan.name === 'enterprise') {
      return res.status(400).json({
        error: 'Enterprise plan requires contacting sales',
        contact: 'sales@cachegpt.com'
      });
    }

    if (!plan.stripe_price_id) {
      return res.status(400).json({ error: 'Plan not available for self-service' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        planId: plan.id,
        planName: plan.name
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    return res.status(200).json({ sessionUrl: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

async function updateSubscription(req, res) {
  try {
    const { newPlanName } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: currentSub, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*, subscription_plans(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (subError || !currentSub) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (!currentSub.stripe_subscription_id) {
      return res.status(400).json({ error: 'Cannot modify free subscription through API' });
    }

    const { data: newPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', newPlanName)
      .single();

    if (planError || !newPlan) {
      return res.status(404).json({ error: 'New plan not found' });
    }

    if (!newPlan.stripe_price_id) {
      return res.status(400).json({ error: 'Target plan not available for self-service' });
    }

    const subscription = await stripe.subscriptions.retrieve(
      currentSub.stripe_subscription_id
    );

    const updatedSubscription = await stripe.subscriptions.update(
      currentSub.stripe_subscription_id,
      {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPlan.stripe_price_id,
          },
        ],
        proration_behavior: 'create_prorations',
      }
    );

    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({
        plan_id: newPlan.id,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return res.status(500).json({ error: 'Failed to update subscription in database' });
    }

    return res.status(200).json({
      message: 'Subscription updated successfully',
      subscription: updatedSubscription
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    return res.status(500).json({ error: 'Failed to update subscription' });
  }
}

async function cancelSubscription(req, res) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (!subscription.stripe_subscription_id) {
      return res.status(400).json({ error: 'Cannot cancel free subscription' });
    }

    const canceledSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return res.status(500).json({ error: 'Failed to update cancellation status' });
    }

    return res.status(200).json({
      message: 'Subscription will be cancelled at end of billing period',
      cancelAt: canceledSubscription.cancel_at
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}