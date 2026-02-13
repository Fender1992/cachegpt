/**
 * Jira Context Retriever
 * Fetches relevant Jira issues on demand via Jira REST API
 * No pre-sync or embeddings — queries Jira live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { getValidJiraToken } from '@/lib/jira/jira-token';

const MAX_ISSUES = 10;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Recursively extract text from Atlassian Document Format (ADF)
 */
function extractTextFromADF(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromADF).join('');
  }
  return '';
}

interface JiraQueryAnalysis {
  isJiraQuery: boolean;
  intent: 'my_issues' | 'search' | 'specific_issue' | 'sprint' | 'general';
  issueKey: string | null;
  jql: string | null;
  searchTerms: string[];
}

/**
 * Analyze query to determine Jira intent
 */
function analyzeJiraQuery(query: string): JiraQueryAnalysis {
  const lowerQuery = query.toLowerCase();

  // Check for specific issue key (e.g., PROJ-123)
  const issueKeyMatch = query.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  if (issueKeyMatch) {
    return {
      isJiraQuery: true,
      intent: 'specific_issue',
      issueKey: issueKeyMatch[1],
      jql: null,
      searchTerms: [],
    };
  }

  const jiraKeywords = [
    'jira', 'ticket', 'tickets', 'issue', 'issues', 'task', 'tasks',
    'bug', 'bugs', 'story', 'stories', 'epic', 'epics',
    'sprint', 'backlog', 'board', 'kanban', 'scrum',
    'assigned', 'assignee', 'my tickets', 'my issues', 'my tasks',
    'open tickets', 'open issues', 'in progress',
  ];

  const isJiraQuery = jiraKeywords.some(k => lowerQuery.includes(k));

  if (!isJiraQuery) {
    return { isJiraQuery: false, intent: 'general', issueKey: null, jql: null, searchTerms: [] };
  }

  // Determine intent
  let intent: JiraQueryAnalysis['intent'] = 'general';
  let jql: string | null = null;

  if (/(?:my\s+(?:tickets?|issues?|tasks?)|assigned\s+to\s+me|my\s+work)/i.test(query)) {
    intent = 'my_issues';
    jql = 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC';
  } else if (/(?:sprint|current\s+sprint|active\s+sprint)/i.test(query)) {
    intent = 'sprint';
    jql = 'sprint in openSprints() ORDER BY priority DESC';
  } else if (/(?:search|find|look\s+for)/i.test(query)) {
    intent = 'search';
    const stopWords = new Set([
      'jira', 'ticket', 'tickets', 'issue', 'issues', 'task', 'tasks',
      'bug', 'bugs', 'story', 'epic', 'sprint', 'backlog',
      'search', 'find', 'look', 'for', 'show', 'get', 'list',
      'the', 'a', 'an', 'in', 'on', 'at', 'my', 'me', 'is', 'are',
      'what', 'where', 'how', 'which', 'about', 'with',
    ]);
    const searchTerms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    if (searchTerms.length > 0) {
      jql = `text ~ "${searchTerms.join(' ')}" ORDER BY updated DESC`;
    }
  } else {
    intent = 'my_issues';
    jql = 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC';
  }

  return { isJiraQuery: true, intent, issueKey: null, jql, searchTerms: [] };
}

/**
 * Main Jira context retrieval function
 */
export async function retrieveJiraContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, access_token, refresh_token, token_expires_at, provider_data')
    .eq('user_id', userId)
    .eq('provider', 'jira')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeJiraQuery(queryText);

  if (!analysis.isJiraQuery) {
    return null;
  }

  try {
    const token = await getValidJiraToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return null;
    }

    const cloudId = integration.provider_data?.cloud_id;
    if (!cloudId) {
      return null;
    }

    const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;

    // Handle specific issue lookup
    if (analysis.intent === 'specific_issue' && analysis.issueKey) {
      const res = await fetch(
        `${baseUrl}/issue/${encodeURIComponent(analysis.issueKey)}?fields=summary,description,status,assignee,priority,issuetype,updated,comment`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!res.ok) {
        return null;
      }

      const issue = await res.json();
      const fields = issue.fields || {};
      const description = extractTextFromADF(fields.description);
      const comments = (fields.comment?.comments || []).slice(-5).map((c: any) =>
        `${c.author?.displayName || 'Unknown'}: ${extractTextFromADF(c.body)}`
      );

      const lines = [
        '## Jira Issue Context\n',
        `### ${issue.key}: ${fields.summary || ''}`,
        `Status: ${fields.status?.name || ''} | Priority: ${fields.priority?.name || ''} | Type: ${fields.issuetype?.name || ''}`,
        `Assignee: ${fields.assignee?.displayName || 'Unassigned'}`,
        '',
      ];

      if (description) {
        lines.push(`**Description:**\n${description.substring(0, 1000)}`);
      }

      if (comments.length > 0) {
        lines.push('\n**Recent Comments:**');
        comments.forEach((c: string) => lines.push(`- ${c.substring(0, 200)}`));
      }

      return lines.join('\n');
    }

    // Handle JQL search
    if (analysis.jql) {
      const params = new URLSearchParams({
        jql: analysis.jql,
        maxResults: String(MAX_ISSUES),
        fields: 'summary,status,assignee,priority,issuetype,updated',
      });

      const res = await fetch(`${baseUrl}/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.error('[Jira Context] Search failed:', res.status);
        return null;
      }

      const data = await res.json();
      const issues = data.issues || [];

      if (issues.length === 0) {
        return '## Jira Context\n\nNo matching issues found.';
      }

      const lines = ['## Jira Context\n'];

      for (const issue of issues) {
        const f = issue.fields || {};
        lines.push(
          `- **${issue.key}**: ${f.summary || ''} — ${f.status?.name || ''} (${f.priority?.name || ''}) assigned to ${f.assignee?.displayName || 'Unassigned'}`
        );
      }

      lines.push(`\n_${data.total || issues.length} total matching issues_`);
      return lines.join('\n');
    }

    return null;
  } catch (error) {
    console.error('[Jira Context] Error:', error);
    return null;
  }
}
