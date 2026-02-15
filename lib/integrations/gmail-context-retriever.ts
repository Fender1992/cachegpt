/**
 * Gmail Context Retriever
 * Fetches relevant emails on demand via Gmail API
 * No pre-sync or embeddings — queries Gmail live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { getValidGmailToken } from '@/lib/gmail/gmail-token';

const MAX_RESULTS = 10;
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailSearchResult {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

interface QueryAnalysis {
  intent: 'search_emails' | 'find_thread' | 'list_labels' | 'send_email' | 'reply_email' | 'general';
  searchTerms: string[];
  timeframe?: {
    relative?: 'today' | 'yesterday' | 'this week' | 'last week' | 'this month';
  };
  senderName?: string;
  subjectQuery?: string;
  // Parsed email details for send intents
  parsedEmail?: {
    to: string;
    subject: string;
    body: string;
  };
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Analyze query to understand user intent for Gmail
 */
export function analyzeGmailQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();

  let intent: QueryAnalysis['intent'] = 'general';
  let parsedEmail: QueryAnalysis['parsedEmail'] | undefined;

  // Write intents (check first — most specific)
  if (/(?:send|compose|write|draft)\s+(?:an?\s+)?(?:email|mail)\s+(?:to|for)/i.test(query) ||
      /(?:email|mail)\s+\S+.*\s+(?:about|regarding|saying|that|with)/i.test(query) ||
      /(?:reply|respond)\s+(?:to|back)/i.test(query)) {
    // Extract email address
    const emailMatch = query.match(/(?:to|email)\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const to = emailMatch?.[1] || '';

    // Extract subject — "about X", "regarding X", "subject X"
    const subjectMatch = query.match(/(?:about|regarding|subject|re:?)\s+["\']?([^"'\n.!?]+)/i);
    const subject = subjectMatch?.[1]?.trim() || '';

    // Extract body — "saying X", "that says X", "with message X", "body X", or text after ":"
    const bodyMatch = query.match(/(?:saying|that\s+says?|with\s+(?:the\s+)?(?:message|body|content)|body:?|message:?)\s+["\']?([^"']+)/i);
    const body = bodyMatch?.[1]?.trim() || '';

    if (/(?:reply|respond)\s+(?:to|back)/i.test(query)) {
      intent = 'reply_email';
    } else {
      intent = 'send_email';
    }

    if (to || subject || body) {
      parsedEmail = { to, subject, body };
    }
  } else if (/(?:what|which).*(?:label|folder)s?/i.test(query)) {
    intent = 'list_labels';
  } else if (/(?:find|search|look for).*(?:email|mail|message)/i.test(query)) {
    intent = 'search_emails';
  } else if (/(?:email|mail|wrote|sent|received|inbox)/i.test(query)) {
    intent = 'search_emails';
  } else if (/(?:thread|conversation|reply|replies)/i.test(query)) {
    intent = 'find_thread';
  }

  // Extract time references
  let timeframe: QueryAnalysis['timeframe'] | undefined;
  if (lowerQuery.includes('today')) {
    timeframe = { relative: 'today' };
  } else if (lowerQuery.includes('yesterday')) {
    timeframe = { relative: 'yesterday' };
  } else if (lowerQuery.includes('this week')) {
    timeframe = { relative: 'this week' };
  } else if (lowerQuery.includes('last week')) {
    timeframe = { relative: 'last week' };
  } else if (lowerQuery.includes('this month')) {
    timeframe = { relative: 'this month' };
  }

  // Extract sender
  const senderMatch = query.match(/(?:from|by)\s+([A-Za-z][A-Za-z0-9_.+-]*(?:@[A-Za-z0-9.-]+)?)/i);
  const senderName = senderMatch?.[1];

  // Extract subject
  const subjectMatch = query.match(/(?:about|subject|re:?)\s+["\']?([^"'\n]+)["\']?/i);
  const subjectQuery = subjectMatch?.[1]?.trim();

  // Extract search terms
  const stopWords = new Set([
    'gmail', 'email', 'mail', 'emails', 'mails', 'message', 'messages',
    'inbox', 'sent', 'thread', 'conversation', 'reply', 'replies',
    'find', 'search', 'show', 'what', 'where', 'when', 'who',
    'did', 'does', 'has', 'have', 'had', 'was', 'were', 'been',
    'in', 'on', 'at', 'by', 'from', 'about', 'the', 'a', 'an',
    'today', 'yesterday', 'week', 'month', 'this', 'last',
    'me', 'my', 'i', 'to', 'and', 'or', 'but', 'with',
  ]);

  const searchTerms = query
    .toLowerCase()
    .replace(/[^\w\s@.]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return {
    intent,
    searchTerms,
    timeframe,
    senderName,
    subjectQuery,
    parsedEmail,
  };
}

function getHeader(headers: any[], name: string): string {
  const header = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBody(payload: any): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return decodeBase64Url(textPart.body.data);
    }
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const body = extractBody(part);
        if (body) return body;
      }
    }
  }
  return '';
}

/**
 * Build Gmail search query from analysis
 */
function buildGmailSearchQuery(analysis: QueryAnalysis): string {
  const parts: string[] = [];

  if (analysis.senderName) {
    parts.push(`from:${analysis.senderName}`);
  }

  if (analysis.subjectQuery) {
    parts.push(`subject:(${analysis.subjectQuery})`);
  }

  if (analysis.timeframe?.relative) {
    const now = new Date();
    let afterDate: Date;

    switch (analysis.timeframe.relative) {
      case 'today':
        afterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        afterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        break;
      case 'this week':
        afterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        break;
      case 'last week':
        afterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
        break;
      case 'this month':
        afterDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        afterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    }

    const dateStr = `${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`;
    parts.push(`after:${dateStr}`);
  }

  // Add remaining search terms
  const termsWithoutSender = analysis.searchTerms.filter(t =>
    t !== analysis.senderName?.toLowerCase()
  );
  if (termsWithoutSender.length > 0) {
    parts.push(termsWithoutSender.join(' '));
  }

  return parts.join(' ') || 'in:inbox';
}

/**
 * Format Gmail search results as context
 */
export function formatGmailContext(results: GmailSearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant emails found.';
  }

  const lines = ['## Gmail Context\n'];

  // Group by thread
  const threads = new Map<string, GmailSearchResult[]>();
  for (const result of results) {
    const key = result.threadId;
    if (!threads.has(key)) {
      threads.set(key, []);
    }
    threads.get(key)!.push(result);
  }

  for (const [, threadMessages] of threads) {
    const first = threadMessages[0];
    lines.push(`\n### ${first.subject || '(no subject)'}\n`);

    for (const msg of threadMessages) {
      lines.push(`**From:** ${msg.from}`);
      if (msg.date) {
        const date = new Date(msg.date);
        lines.push(`**Date:** ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`);
      }

      // Truncate body to prevent context overflow
      const bodyLines = msg.body.split('\n').slice(0, 15);
      lines.push('```');
      lines.push(...bodyLines);
      if (msg.body.split('\n').length > 15) {
        lines.push('... (truncated)');
      }
      lines.push('```\n');
    }
  }

  return lines.join('\n');
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send an email via Gmail API (server-side)
 */
async function sendGmailEmail(
  token: string,
  fromEmail: string,
  parsedEmail: NonNullable<QueryAnalysis['parsedEmail']>
): Promise<string> {
  if (!parsedEmail.to) {
    return '## Gmail Action\n\nCould not send email — no recipient email address found. Ask the user to provide the recipient\'s email address.';
  }
  if (!parsedEmail.subject && !parsedEmail.body) {
    return '## Gmail Action\n\nCould not send email — no subject or body found. Ask the user to provide at least a subject and message body.';
  }

  const messageParts = [
    `From: ${fromEmail}`,
    `To: ${parsedEmail.to}`,
    `Subject: ${parsedEmail.subject || '(no subject)'}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    parsedEmail.body || '',
  ];

  const rawMessage = base64UrlEncode(messageParts.join('\r\n'));

  const res = await fetch(
    `${GMAIL_API}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawMessage }),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Gmail Action] Send failed:', res.status, errorText);
    if (res.status === 403) {
      return '## Gmail Action\n\nFailed to send email — permission denied (403). The Gmail token does not have send permissions.\n\nTell the user: "Your Gmail is connected with **read-only** permissions. To fix this, go to **Settings**, **disconnect** Gmail, then **reconnect** it. Google will prompt you to grant send access."';
    }
    return `## Gmail Action\n\nFailed to send email. Error: ${res.status}. Ask the user to try again or check their Gmail connection in Settings.`;
  }

  return `## Gmail Action\n\nSuccessfully sent email:\n- **To:** ${parsedEmail.to}\n- **Subject:** ${parsedEmail.subject || '(no subject)'}\n\nConfirm this to the user in a friendly way.`;
}

/**
 * Main Gmail context retrieval function
 * Fetches emails on demand via Gmail API search
 */
export async function retrieveGmailContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeGmailQuery(queryText);

  // Only retrieve context for email-related queries
  if (analysis.intent === 'general' && analysis.searchTerms.length === 0) {
    return null;
  }

  try {
    const token = await getValidGmailToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return null;
    }

    // Handle write intents (send/reply emails)
    if (analysis.intent === 'send_email' || analysis.intent === 'reply_email') {
      if (analysis.parsedEmail) {
        return await sendGmailEmail(token, integration.provider_user_id || '', analysis.parsedEmail);
      }
      return '## Gmail Action\n\nThe user wants to send an email but the request is missing details. Ask the user to provide:\n- **Recipient** email address\n- **Subject** line\n- **Message** body\n\nExample: "Send an email to john@example.com about the meeting saying Let\'s meet at 3pm"';
    }

    // Build Gmail search query
    const gmailQuery = buildGmailSearchQuery(analysis);

    // Search messages
    const searchRes = await fetch(
      `${GMAIL_API}/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=${MAX_RESULTS}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!searchRes.ok) {
      console.error('[Gmail Context] Search failed:', searchRes.status);
      return null;
    }

    const searchData = await searchRes.json();
    const messageIds = searchData.messages || [];

    if (messageIds.length === 0) {
      return null;
    }

    // Fetch full messages in parallel
    const results: GmailSearchResult[] = [];

    await Promise.all(
      messageIds.slice(0, MAX_RESULTS).map(async (m: any) => {
        try {
          const res = await fetch(
            `${GMAIL_API}/messages/${m.id}?format=full`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(5000),
            }
          );

          if (!res.ok) return;

          const msg = await res.json();
          const headers = msg.payload?.headers || [];

          results.push({
            id: msg.id,
            threadId: msg.threadId,
            from: getHeader(headers, 'From'),
            to: getHeader(headers, 'To'),
            subject: getHeader(headers, 'Subject'),
            date: getHeader(headers, 'Date'),
            snippet: msg.snippet || '',
            body: extractBody(msg.payload),
          });
        } catch (e) {
          console.warn('[Gmail Context] Failed to fetch message', m.id, e);
        }
      })
    );

    if (results.length === 0) {
      return null;
    }

    // Sort by date descending
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return formatGmailContext(results);
  } catch (error) {
    console.error('[Gmail Context] Error retrieving context:', error);
    return null;
  }
}
