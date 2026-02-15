import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { amount, message, is_anonymous } = await req.json();

    // Validate amount: $1 to $10,000
    const amountCents = Math.round(Number(amount));
    if (!amountCents || amountCents < 100 || amountCents > 1000000) {
      return NextResponse.json(
        { error: 'Amount must be between $1 and $10,000' },
        { status: 400 }
      );
    }

    // Check for authenticated user (optional — anonymous donations OK)
    let userId: string | null = null;
    let customerId: string | undefined;

    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);

      if (user) {
        userId = user.id;

        // Look up or create Stripe customer
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('stripe_customer_id, email')
          .eq('id', user.id)
          .single();

        customerId = profile?.stripe_customer_id ?? undefined;

        if (!customerId) {
          const customer = await stripe.customers.create({
            email: profile?.email || user.email || '',
            metadata: { supabase_user_id: user.id },
          });
          customerId = customer.id;

          await supabaseAdmin
            .from('user_profiles')
            .update({ stripe_customer_id: customerId })
            .eq('id', user.id);
        }
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'CacheGPT Donation',
              description: 'Thank you for supporting CacheGPT!',
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/donate/success`,
      cancel_url: `${baseUrl}/donate?canceled=true`,
      metadata: {
        type: 'donation',
        user_id: userId || '',
        message: (message || '').slice(0, 500),
        is_anonymous: String(is_anonymous || false),
      },
    };

    if (customerId) {
      sessionParams.customer = customerId;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Donation checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create donation session' },
      { status: 500 }
    );
  }
}
