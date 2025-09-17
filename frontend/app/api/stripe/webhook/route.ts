import { NextResponse } from 'next/server';

// Simplified initialization to avoid crashes
const isConfigured = !!(
  process.env.STRIPE_SECRET_KEY &&
  process.env.STRIPE_WEBHOOK_SECRET &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_KEY
);

export async function POST(req: Request) {
  try {
    // Simple response for now to avoid crashes
    if (!isConfigured) {
      return NextResponse.json(
        {
          error: 'Webhook not configured',
          configured: isConfigured,
          timestamp: new Date().toISOString()
        },
        { status: 200 }
      );
    }

    // For now, just return success to prevent crashes
    return NextResponse.json(
      {
        received: true,
        message: 'Webhook received but processing disabled for stability',
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      {
        error: 'Webhook failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 200 } // Return 200 to prevent retries
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      message: 'Stripe webhook endpoint is running',
      configured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
    },
    { status: 200 }
  );
}