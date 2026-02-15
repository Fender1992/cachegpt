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
  intent: 'my_issues' | 'search' | 'specific_issue' | 'sprint' | 'create_issue' | 'update_issue' | 'general';
  issueKey: string | null;
  jql: string | null;
  searchTerms: string[];
  // Parsed issue details for create intents
  parsedCreate?: {
    summary: string;
    description?: string;
    issueType?: string;
    priority?: string;
    projectKey?: string;
  };
  // Parsed update details
  parsedUpdate?: {
    issueKey: string;
    fields: Record<string, string>;
  };
}

/**
 * Analyze query to determine Jira intent
 */
export function analyzeJiraQuery(query: string): JiraQueryAnalysis {
  const lowerQuery = query.toLowerCase();

  // Check for specific issue key (e.g., PROJ-123)
  const issueKeyMatch = query.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);

  // Write intents — check first
  if (/(?:create|make|file|open|add|new)\s+(?:a\s+)?(?:jira\s+)?(?:ticket|issue|bug|task|story)/i.test(query) ||
      /(?:jira|ticket|issue)\s+(?:for|about|to)\s+/i.test(query) && /(?:create|make|file|open|add|new)/i.test(query)) {
    // Extract project key if present (e.g., "in PROJ", "project PROJ")
    const projectMatch = query.match(/(?:in|project|for)\s+([A-Z][A-Z0-9]+)\b/);
    // Extract issue type
    let issueType = 'Task';
    if (/\bbug\b/i.test(query)) issueType = 'Bug';
    else if (/\bstory\b/i.test(query)) issueType = 'Story';
    else if (/\bepic\b/i.test(query)) issueType = 'Epic';
    // Extract priority
    let priority: string | undefined;
    if (/\b(?:critical|highest)\b/i.test(query)) priority = 'Highest';
    else if (/\bhigh\b/i.test(query)) priority = 'High';
    else if (/\blow\b/i.test(query)) priority = 'Low';
    else if (/\blowest\b/i.test(query)) priority = 'Lowest';
    // Extract summary — text after "titled/called/about/for" or remaining natural language
    const summaryMatch = query.match(/(?:titled|called|about|for|:)\s+["\']?([^"'\n]+)/i);
    const summary = summaryMatch?.[1]?.trim() || query
      .replace(/(?:create|make|file|open|add|new)\s+(?:a\s+)?(?:jira\s+)?(?:ticket|issue|bug|task|story)\s*/i, '')
      .replace(/\b(?:in|project|for)\s+[A-Z][A-Z0-9]+\b/i, '')
      .replace(/\b(?:critical|highest|high|medium|low|lowest)\s*(?:priority)?\b/i, '')
      .trim() || 'New Issue';

    return {
      isJiraQuery: true,
      intent: 'create_issue',
      issueKey: null,
      jql: null,
      searchTerms: [],
      parsedCreate: {
        summary,
        issueType,
        priority,
        projectKey: projectMatch?.[1],
      },
    };
  }

  if (issueKeyMatch && /(?:update|change|set|move|assign|close|resolve|transition|edit|modify)/i.test(query)) {
    const fields: Record<string, string> = {};
    // Extract status change
    const statusMatch = query.match(/(?:status|move|transition)\s+(?:to\s+)?["\']?([^"'\n,]+)/i);
    if (statusMatch) fields.status = statusMatch[1].trim();
    // Extract assignee change
    const assigneeMatch = query.match(/(?:assign|assignee)\s+(?:to\s+)?["\']?([^"'\n,]+)/i);
    if (assigneeMatch) fields.assignee = assigneeMatch[1].trim();
    // Close/resolve shorthand
    if (/\b(?:close|resolve)\b/i.test(query)) fields.status = 'Done';
    // Priority change
    const priMatch = query.match(/(?:priority)\s+(?:to\s+)?["\']?(highest|high|medium|low|lowest)/i);
    if (priMatch) fields.priority = priMatch[1];

    return {
      isJiraQuery: true,
      intent: 'update_issue',
      issueKey: issueKeyMatch[1],
      jql: null,
      searchTerms: [],
      parsedUpdate: {
        issueKey: issueKeyMatch[1],
        fields,
      },
    };
  }

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
 * Create a Jira issue (server-side)
 */
async function createJiraIssue(
  token: string,
  baseUrl: string,
  parsedCreate: NonNullable<JiraQueryAnalysis['parsedCreate']>
): Promise<string> {
  // If no project key provided, try to get user's default project
  let projectKey = parsedCreate.projectKey;
  if (!projectKey) {
    try {
      const projRes = await fetch(`${baseUrl}/project?maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (projRes.ok) {
        const projects = await projRes.json();
        if (projects.length > 0) {
          projectKey = projects[0].key;
        }
      }
    } catch {
      // Will fail below without project key
    }
  }

  if (!projectKey) {
    return '## Jira Action\n\nCould not create issue — no project specified and no default project found. Ask the user which Jira project to create the issue in (e.g., "Create a bug in PROJ about login failing").';
  }

  const issueBody: any = {
    fields: {
      project: { key: projectKey },
      summary: parsedCreate.summary,
      issuetype: { name: parsedCreate.issueType || 'Task' },
    },
  };

  if (parsedCreate.description) {
    issueBody.fields.description = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: parsedCreate.description }],
      }],
    };
  }

  if (parsedCreate.priority) {
    issueBody.fields.priority = { name: parsedCreate.priority };
  }

  const res = await fetch(`${baseUrl}/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(issueBody),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Jira Action] Create failed:', res.status, errorText);
    return `## Jira Action\n\nFailed to create issue. Error: ${res.status}. Ask the user to check their Jira connection in Settings.`;
  }

  const created = await res.json();
  return `## Jira Action\n\nSuccessfully created Jira issue:\n- **Key:** ${created.key}\n- **Summary:** ${parsedCreate.summary}\n- **Type:** ${parsedCreate.issueType || 'Task'}\n- **Project:** ${projectKey}\n\nConfirm this to the user in a friendly way.`;
}

/**
 * Update a Jira issue (server-side)
 */
async function updateJiraIssue(
  token: string,
  baseUrl: string,
  parsedUpdate: NonNullable<JiraQueryAnalysis['parsedUpdate']>
): Promise<string> {
  const updateBody: any = { fields: {} };
  const changes: string[] = [];

  // Handle status transitions separately (requires transition API)
  if (parsedUpdate.fields.status) {
    try {
      // Get available transitions
      const transRes = await fetch(
        `${baseUrl}/issue/${encodeURIComponent(parsedUpdate.issueKey)}/transitions`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (transRes.ok) {
        const transData = await transRes.json();
        const transition = (transData.transitions || []).find((t: any) =>
          t.name.toLowerCase().includes(parsedUpdate.fields.status!.toLowerCase()) ||
          t.to?.name?.toLowerCase().includes(parsedUpdate.fields.status!.toLowerCase())
        );

        if (transition) {
          await fetch(
            `${baseUrl}/issue/${encodeURIComponent(parsedUpdate.issueKey)}/transitions`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ transition: { id: transition.id } }),
              signal: AbortSignal.timeout(5000),
            }
          );
          changes.push(`Status → ${transition.to?.name || parsedUpdate.fields.status}`);
        }
      }
    } catch (e) {
      console.warn('[Jira Action] Transition failed:', e);
    }
  }

  // Handle priority change
  if (parsedUpdate.fields.priority) {
    updateBody.fields.priority = { name: parsedUpdate.fields.priority.charAt(0).toUpperCase() + parsedUpdate.fields.priority.slice(1).toLowerCase() };
    changes.push(`Priority → ${parsedUpdate.fields.priority}`);
  }

  // Apply field updates if any
  if (Object.keys(updateBody.fields).length > 0) {
    const res = await fetch(
      `${baseUrl}/issue/${encodeURIComponent(parsedUpdate.issueKey)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateBody),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[Jira Action] Update failed:', res.status, errorText);
      return `## Jira Action\n\nFailed to update ${parsedUpdate.issueKey}. Error: ${res.status}`;
    }
  }

  if (changes.length === 0) {
    return `## Jira Action\n\nNo changes could be applied to ${parsedUpdate.issueKey}. Ask the user what they want to change (status, priority, assignee, etc.).`;
  }

  return `## Jira Action\n\nSuccessfully updated ${parsedUpdate.issueKey}:\n${changes.map(c => `- ${c}`).join('\n')}\n\nConfirm this to the user in a friendly way.`;
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

    // Handle write intents
    if (analysis.intent === 'create_issue') {
      if (analysis.parsedCreate) {
        return await createJiraIssue(token, baseUrl, analysis.parsedCreate);
      }
      return '## Jira Action\n\nThe user wants to create a Jira issue but the request is missing details. Ask the user to provide:\n- **Summary/title** for the issue\n- **Project** key (e.g., PROJ)\n- **Type** (Bug, Task, Story)\n\nExample: "Create a bug in PROJ about login page crashing"';
    }

    if (analysis.intent === 'update_issue') {
      if (analysis.parsedUpdate) {
        return await updateJiraIssue(token, baseUrl, analysis.parsedUpdate);
      }
      return `## Jira Action\n\nThe user wants to update a Jira issue but the request is unclear. Ask the user what to change (status, priority, assignee).`;
    }

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
