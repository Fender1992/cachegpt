/**
 * Yahoo Mail Context Retriever
 * Fetches relevant emails on demand via IMAP
 * No pre-sync or embeddings — queries Yahoo IMAP live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { getValidYahooToken } from '@/lib/yahoo/yahoo-token';
import { ImapFlow } from 'imapflow';

const MAX_RESULTS = 10;
const IMAP_TIMEOUT = 10000; // 10 seconds

interface YahooSearchResult {
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
  intent: 'search_emails' | 'find_thread' | 'list_labels' | 'general';
  searchTerms: string[];
  timeframe?: {
    relative?: 'today' | 'yesterday' | 'this week' | 'last week' | 'this month';
  };
  senderName?: string;
  subjectQuery?: string;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Analyze query to understand user intent for Yahoo Mail
 */
function analyzeYahooQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();

  let intent: QueryAnalysis['intent'] = 'general';

  if (/(?:what|which).*(?:label|folder)s?/i.test(query)) {
    intent = 'list_labels';
  } else if (/(?:find|search|look for).*(?:email|mail|message)/i.test(query)) {
    intent = 'search_emails';
  } else if (/(?:email|mail|wrote|sent|received|inbox|yahoo)/i.test(query)) {
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
    'yahoo', 'gmail', 'email', 'mail', 'emails', 'mails', 'message', 'messages',
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
  };
}

function formatAddress(addr: any): string {
  if (!addr || !addr.length) return '';
  return addr
    .map((a: any) => {
      if (a.name) return `${a.name} <${a.address}>`;
      return a.address || '';
    })
    .join(', ');
}

/**
 * Build IMAP search criteria from query analysis
 */
function buildImapSearchCriteria(analysis: QueryAnalysis): any {
  const criteria: any = {};

  if (analysis.senderName) {
    criteria.from = analysis.senderName;
  }

  if (analysis.subjectQuery) {
    criteria.subject = analysis.subjectQuery;
  }

  if (analysis.timeframe?.relative) {
    const now = new Date();
    let sinceDate: Date;

    switch (analysis.timeframe.relative) {
      case 'today':
        sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        break;
      case 'this week':
        sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        break;
      case 'last week':
        sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
        break;
      case 'this month':
        sinceDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    }

    criteria.since = sinceDate;
  }

  // If we have search terms but no specific from/subject, use OR on subject and body
  if (analysis.searchTerms.length > 0 && !analysis.senderName && !analysis.subjectQuery) {
    const searchText = analysis.searchTerms.join(' ');
    criteria.or = [{ subject: searchText }, { body: searchText }];
  }

  // If no criteria were set, search recent inbox
  if (Object.keys(criteria).length === 0) {
    criteria.since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
  }

  return criteria;
}

/**
 * Format Yahoo search results as context
 */
function formatYahooContext(results: YahooSearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant Yahoo emails found.';
  }

  const lines = ['## Yahoo Mail Context\n'];

  // Group by thread
  const threads = new Map<string, YahooSearchResult[]>();
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

/**
 * Main Yahoo context retrieval function
 * Fetches emails on demand via IMAP search
 */
export async function retrieveYahooContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'yahoo')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeYahooQuery(queryText);

  // Only retrieve context for email-related queries
  if (analysis.intent === 'general' && analysis.searchTerms.length === 0) {
    return null;
  }

  try {
    const token = await getValidYahooToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return null;
    }

    const email = integration.provider_user_id;

    const client = new ImapFlow({
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true,
      auth: { user: email, accessToken: token },
      logger: false,
    });

    // Set overall timeout
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), IMAP_TIMEOUT);
    });

    const searchPromise = (async (): Promise<string | null> => {
      await client.connect();

      try {
        await client.mailboxOpen('INBOX');

        const criteria = buildImapSearchCriteria(analysis);
        const uids = await client.search(criteria, { uid: true });

        if (!uids || uids.length === 0) {
          await client.logout();
          return null;
        }

        // Take only the most recent MAX_RESULTS
        const recentUids = uids.slice(-MAX_RESULTS);
        const results: YahooSearchResult[] = [];

        for await (const msg of client.fetch(recentUids, {
          envelope: true,
          source: true,
          uid: true,
        }, { uid: true })) {
          const envelope = msg.envelope;
          let body = '';

          if (msg.source) {
            const sourceStr = msg.source.toString();
            // Try text/plain
            const textMatch = sourceStr.match(/Content-Type:\s*text\/plain[^\r\n]*\r?\n(?:.*?\r?\n)*?\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\.\r?\n|$)/i);
            if (textMatch) {
              body = textMatch[1].trim();
            } else {
              // Fallback: everything after headers
              const blankLine = sourceStr.indexOf('\r\n\r\n');
              if (blankLine !== -1) {
                body = sourceStr.substring(blankLine + 4).substring(0, 500).trim();
              }
            }
          }

          results.push({
            id: String(msg.uid),
            threadId: String(msg.uid),
            from: formatAddress(envelope?.from),
            to: formatAddress(envelope?.to),
            subject: envelope?.subject || '',
            date: envelope?.date?.toISOString() || '',
            snippet: body.substring(0, 200),
            body,
          });
        }

        await client.logout();

        if (results.length === 0) {
          return null;
        }

        // Sort by date descending
        results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return formatYahooContext(results);
      } catch (innerError) {
        await client.logout().catch(() => {});
        throw innerError;
      }
    })();

    return await Promise.race([searchPromise, timeoutPromise]);
  } catch (error) {
    console.error('[Yahoo Context] Error retrieving context:', error);
    return null;
  }
}
