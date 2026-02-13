/**
 * Yahoo Mail Send API
 * POST: Send an email via SMTP/nodemailer
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidYahooToken } from '@/lib/yahoo/yahoo-token';
import nodemailer from 'nodemailer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'yahoo')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Yahoo not connected' }, { status: 404 });
    }

    const token = await getValidYahooToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const { to, subject, body, inReplyTo } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      );
    }

    const fromEmail = integration.provider_user_id;

    const transporter = nodemailer.createTransport({
      host: 'smtp.mail.yahoo.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: fromEmail,
        accessToken: token,
      },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: fromEmail,
      to,
      subject,
      text: body,
    };

    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
      mailOptions.references = inReplyTo;
    }

    const info = await transporter.sendMail(mailOptions);

    return NextResponse.json({
      id: info.messageId,
      threadId: info.messageId,
      labelIds: ['SENT'],
    });
  } catch (error) {
    console.error('[Yahoo Send] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
