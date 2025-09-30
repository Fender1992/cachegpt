/**
 * Supabase Edge Function: Send Email
 *
 * This function uses Supabase's built-in Resend integration to send emails.
 *
 * Setup:
 * 1. Deploy this function: supabase functions deploy send-email
 * 2. Set your Resend API key in Supabase Dashboard > Settings > Edge Functions
 *    or use: supabase secrets set RESEND_API_KEY=your_key
 * 3. The function will be available at:
 *    https://your-project.supabase.co/functions/v1/send-email
 *
 * Note: This file uses Deno imports and runs on Supabase Edge Runtime.
 * It should NOT be imported by Next.js - it's deployed separately.
 */

// @ts-ignore - Deno imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore - Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface EmailRequest {
  to: string
  from: string
  subject: string
  html: string
  text: string
}

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const emailRequest: EmailRequest = await req.json()

    // Validate required fields
    if (!emailRequest.to || !emailRequest.from || !emailRequest.subject) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, from, subject' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get Resend API key from environment
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Send email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailRequest.from,
        to: [emailRequest.to],
        subject: emailRequest.subject,
        html: emailRequest.html,
        text: emailRequest.text,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Resend API error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: error }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('Email function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
