/**
 * Email Notification System for Bug Reports
 * Handles sending email notifications to admins about new bugs
 *
 * Supports:
 * - Supabase Edge Functions (built-in email via Resend)
 * - SendGrid
 * - Resend (direct)
 * - Postmark
 * - Console (development)
 */

interface EmailConfig {
  from: string
  apiKey?: string
  provider: 'console' | 'supabase' | 'sendgrid' | 'resend' | 'postmark'
}

interface BugNotification {
  bugId: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: string
  url?: string
  userEmail?: string
  reportedAt: string
}

interface EmailRecipient {
  email: string
  name?: string
}

/**
 * Get email configuration from environment
 */
function getEmailConfig(): EmailConfig {
  // Check for Supabase (preferred - built-in)
  // Supabase uses Resend under the hood via Edge Functions
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    return {
      from: process.env.EMAIL_FROM || 'notifications@cachegpt.app',
      apiKey: process.env.SUPABASE_SERVICE_KEY,
      provider: 'supabase'
    }
  }

  // Check for SendGrid
  if (process.env.SENDGRID_API_KEY) {
    return {
      from: process.env.EMAIL_FROM || 'notifications@cachegpt.app',
      apiKey: process.env.SENDGRID_API_KEY,
      provider: 'sendgrid'
    }
  }

  // Check for Resend (direct)
  if (process.env.RESEND_API_KEY) {
    return {
      from: process.env.EMAIL_FROM || 'notifications@cachegpt.app',
      apiKey: process.env.RESEND_API_KEY,
      provider: 'resend'
    }
  }

  // Check for Postmark
  if (process.env.POSTMARK_API_KEY) {
    return {
      from: process.env.EMAIL_FROM || 'notifications@cachegpt.app',
      apiKey: process.env.POSTMARK_API_KEY,
      provider: 'postmark'
    }
  }

  // Default to console logging (development)
  return {
    from: 'notifications@cachegpt.app',
    provider: 'console'
  }
}

/**
 * Generate HTML email template for bug notification
 */
function generateBugEmailHtml(bug: BugNotification): string {
  const priorityColors = {
    low: '#10b981',
    medium: '#f59e0b',
    high: '#f97316',
    critical: '#ef4444'
  }

  const priorityColor = priorityColors[bug.priority]

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Bug Report - ${bug.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                🐛 New Bug Report
              </h1>
              <p style="margin: 8px 0 0 0; color: #e0e7ff; font-size: 14px;">
                CacheGPT Bug Tracker
              </p>
            </td>
          </tr>

          <!-- Priority Badge -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <div style="display: inline-block; padding: 8px 16px; background-color: ${priorityColor}; color: #ffffff; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                ${bug.priority} PRIORITY
              </div>
            </td>
          </tr>

          <!-- Bug Details -->
          <tr>
            <td style="padding: 24px 32px;">
              <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px; font-weight: 600;">
                ${bug.title}
              </h2>

              <div style="margin-bottom: 24px; padding: 16px; background-color: #f9fafb; border-left: 4px solid #6366f1; border-radius: 4px;">
                <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">
                  ${bug.description}
                </p>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">
                    <strong style="color: #374151;">Category:</strong> ${bug.category}
                  </td>
                </tr>
                ${bug.userEmail ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">
                    <strong style="color: #374151;">Reported by:</strong> ${bug.userEmail}
                  </td>
                </tr>
                ` : ''}
                ${bug.url ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">
                    <strong style="color: #374151;">Page URL:</strong> <a href="${bug.url}" style="color: #6366f1; text-decoration: none;">${bug.url}</a>
                  </td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">
                    <strong style="color: #374151;">Reported:</strong> ${new Date(bug.reportedAt).toLocaleString()}
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="https://cachegpt.app/admin/bugs?id=${bug.bugId}" style="display: inline-block; padding: 12px 32px; background-color: #6366f1; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
                      View in Bug Tracker
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
                You received this email because you're an admin of CacheGPT.<br>
                <a href="https://cachegpt.app/admin/bugs" style="color: #6366f1; text-decoration: none;">Manage Bug Notifications</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Generate plain text email for bug notification
 */
function generateBugEmailText(bug: BugNotification): string {
  return `
🐛 NEW BUG REPORT - ${bug.priority.toUpperCase()} PRIORITY

Title: ${bug.title}

Description:
${bug.description}

Details:
- Category: ${bug.category}
${bug.userEmail ? `- Reported by: ${bug.userEmail}` : ''}
${bug.url ? `- Page URL: ${bug.url}` : ''}
- Reported: ${new Date(bug.reportedAt).toLocaleString()}

View in Bug Tracker:
https://cachegpt.app/admin/bugs?id=${bug.bugId}

---
You received this email because you're an admin of CacheGPT.
Manage notifications: https://cachegpt.app/admin/bugs
  `.trim()
}

/**
 * Send email via Supabase (uses Resend under the hood)
 */
async function sendViaSupabase(
  config: EmailConfig,
  to: EmailRecipient[],
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Import Supabase client
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      config.apiKey!
    )

    // Use Supabase's built-in email functionality via auth.admin
    // This sends emails using Supabase's Resend integration
    const results = await Promise.all(
      to.map(async (recipient) => {
        try {
          // Supabase email is primarily for auth emails, but we can use their REST API
          // For custom emails, we'll use a direct Resend call via Supabase Edge Function
          const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              to: recipient.email,
              from: config.from,
              subject,
              html,
              text
            })
          })

          if (!response.ok) {
            throw new Error(`Supabase email error: ${response.status}`)
          }

          return { success: true }
        } catch (error) {
          console.error(`[EMAIL] Failed to send to ${recipient.email}:`, error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    const allSuccess = results.every(r => r.success)
    if (!allSuccess) {
      const firstError = results.find(r => !r.success)
      return { success: false, error: firstError?.error || 'Some emails failed' }
    }

    return { success: true }
  } catch (error) {
    console.error('[EMAIL] Supabase error:', error)

    // If Supabase Edge Function doesn't exist, fall back to using Resend directly
    // Supabase projects often have a Resend API key configured
    console.warn('[EMAIL] Supabase Edge Function not available, falling back to direct Resend')

    // Check if we can use Resend directly
    if (process.env.RESEND_API_KEY) {
      return sendViaResend(
        { ...config, apiKey: process.env.RESEND_API_KEY, provider: 'resend' },
        to,
        subject,
        html,
        text
      )
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Send email to console (development)
 */
async function sendViaConsole(
  to: EmailRecipient[],
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  console.log('\n' + '='.repeat(80))
  console.log('📧 EMAIL NOTIFICATION (Console Mode)')
  console.log('='.repeat(80))
  console.log(`To: ${to.map(r => r.email).join(', ')}`)
  console.log(`Subject: ${subject}`)
  console.log('-'.repeat(80))
  console.log(text)
  console.log('='.repeat(80) + '\n')

  return { success: true }
}

/**
 * Send email via SendGrid
 */
async function sendViaSendGrid(
  config: EmailConfig,
  to: EmailRecipient[],
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: to.map(r => ({ email: r.email, name: r.name }))
        }],
        from: { email: config.from },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`SendGrid API error: ${response.status} - ${errorText}`)
    }

    return { success: true }
  } catch (error) {
    console.error('[EMAIL] SendGrid error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Send email via Resend
 */
async function sendViaResend(
  config: EmailConfig,
  to: EmailRecipient[],
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: config.from,
        to: to.map(r => r.email),
        subject,
        html,
        text
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Resend API error: ${response.status} - ${errorText}`)
    }

    return { success: true }
  } catch (error) {
    console.error('[EMAIL] Resend error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Send email via Postmark
 */
async function sendViaPostmark(
  config: EmailConfig,
  to: EmailRecipient[],
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Postmark requires sending individual emails
    const results = await Promise.all(
      to.map(async (recipient) => {
        const response = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'X-Postmark-Server-Token': config.apiKey!,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            From: config.from,
            To: recipient.email,
            Subject: subject,
            HtmlBody: html,
            TextBody: text,
            MessageStream: 'outbound'
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Postmark API error: ${response.status} - ${errorText}`)
        }

        return { success: true }
      })
    )

    return { success: results.every(r => r.success) }
  } catch (error) {
    console.error('[EMAIL] Postmark error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Main function to send bug notification email
 */
export async function sendBugNotificationEmail(
  bug: BugNotification,
  recipients: EmailRecipient[]
): Promise<{ success: boolean; error?: string }> {
  if (recipients.length === 0) {
    console.warn('[EMAIL] No recipients provided for bug notification')
    return { success: false, error: 'No recipients' }
  }

  const config = getEmailConfig()
  const subject = `[${bug.priority.toUpperCase()}] ${bug.title}`
  const html = generateBugEmailHtml(bug)
  const text = generateBugEmailText(bug)

  console.log(`[EMAIL] Sending bug notification via ${config.provider} to ${recipients.length} recipient(s)`)

  switch (config.provider) {
    case 'supabase':
      return sendViaSupabase(config, recipients, subject, html, text)
    case 'sendgrid':
      return sendViaSendGrid(config, recipients, subject, html, text)
    case 'resend':
      return sendViaResend(config, recipients, subject, html, text)
    case 'postmark':
      return sendViaPostmark(config, recipients, subject, html, text)
    case 'console':
    default:
      return sendViaConsole(recipients, subject, html, text)
  }
}

/**
 * Process pending bug notifications from database
 * This should be called by a cron job or background worker
 */
export async function processPendingNotifications(supabase: any): Promise<{
  processed: number
  successful: number
  failed: number
}> {
  console.log('[EMAIL] Processing pending bug notifications...')

  // Get pending notifications
  const { data: notifications, error: fetchError } = await supabase
    .from('bug_notifications')
    .select(`
      id,
      bug_id,
      recipient_email,
      notification_type,
      retry_count,
      metadata,
      bugs (
        id,
        title,
        description,
        priority,
        category,
        url,
        user_email,
        created_at
      )
    `)
    .eq('status', 'pending')
    .lt('retry_count', 3) // Max 3 retries
    .limit(50) // Process in batches

  if (fetchError) {
    console.error('[EMAIL] Error fetching notifications:', fetchError)
    return { processed: 0, successful: 0, failed: 0 }
  }

  if (!notifications || notifications.length === 0) {
    console.log('[EMAIL] No pending notifications to process')
    return { processed: 0, successful: 0, failed: 0 }
  }

  console.log(`[EMAIL] Found ${notifications.length} pending notification(s)`)

  let successful = 0
  let failed = 0

  // Process each notification
  for (const notification of notifications) {
    const bug = notification.bugs

    if (!bug) {
      console.error(`[EMAIL] Bug not found for notification ${notification.id}`)
      failed++
      continue
    }

    const bugData: BugNotification = {
      bugId: bug.id,
      title: bug.title,
      description: bug.description,
      priority: bug.priority,
      category: bug.category,
      url: bug.url,
      userEmail: bug.user_email,
      reportedAt: bug.created_at
    }

    const result = await sendBugNotificationEmail(bugData, [
      { email: notification.recipient_email }
    ])

    if (result.success) {
      // Mark as sent
      await supabase
        .from('bug_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', notification.id)

      successful++
      console.log(`[EMAIL] ✅ Sent notification ${notification.id}`)
    } else {
      // Mark as failed and increment retry count
      await supabase
        .from('bug_notifications')
        .update({
          status: notification.retry_count >= 2 ? 'failed' : 'pending',
          retry_count: notification.retry_count + 1,
          failed_at: new Date().toISOString(),
          error_message: result.error
        })
        .eq('id', notification.id)

      failed++
      console.error(`[EMAIL] ❌ Failed to send notification ${notification.id}: ${result.error}`)
    }
  }

  console.log(`[EMAIL] Processed ${notifications.length} notifications: ${successful} sent, ${failed} failed`)

  return {
    processed: notifications.length,
    successful,
    failed
  }
}
