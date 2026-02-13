/**
 * Jira Issues API
 * GET: JQL search + issue detail with comments
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidJiraToken } from '@/lib/jira/jira-token';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Recursively extract text from Atlassian Document Format (ADF)
 */
function extractTextFromADF(node: any): string {
  if (!node) return '';

  if (node.type === 'text') {
    return node.text || '';
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromADF).join('');
  }

  return '';
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at, provider_data')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'jira')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Jira not connected' }, { status: 404 });
    }

    const token = await getValidJiraToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const cloudId = integration.provider_data?.cloud_id;
    if (!cloudId) {
      return NextResponse.json({ error: 'No Jira cloud ID found' }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const issueKey = searchParams.get('issueKey');
    const jql = searchParams.get('jql');
    const projectKey = searchParams.get('projectKey');

    const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;

    // Get single issue detail
    if (issueKey) {
      return await getIssueDetail(token, baseUrl, issueKey);
    }

    // Search issues
    return await searchIssues(token, baseUrl, jql, projectKey);
  } catch (error) {
    console.error('[Jira Issues] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Jira issues' },
      { status: 500 }
    );
  }
}

async function searchIssues(
  token: string,
  baseUrl: string,
  jql: string | null,
  projectKey: string | null
) {
  let searchJql = jql || '';

  if (!searchJql && projectKey) {
    searchJql = `project = "${projectKey}" ORDER BY updated DESC`;
  } else if (!searchJql) {
    searchJql = 'assignee = currentUser() ORDER BY updated DESC';
  }

  const params = new URLSearchParams({
    jql: searchJql,
    maxResults: '20',
    fields: 'summary,status,assignee,priority,issuetype,updated,created,project',
  });

  const res = await fetch(`${baseUrl}/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Jira Issues] Search failed:', res.status, errorText);
    return NextResponse.json({ error: 'Failed to search issues' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({
    issues: (data.issues || []).map((issue: any) => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || '',
      statusCategory: issue.fields?.status?.statusCategory?.key || '',
      priority: issue.fields?.priority?.name || '',
      issueType: issue.fields?.issuetype?.name || '',
      assignee: issue.fields?.assignee?.displayName || 'Unassigned',
      projectKey: issue.fields?.project?.key || '',
      projectName: issue.fields?.project?.name || '',
      updated: issue.fields?.updated || '',
      created: issue.fields?.created || '',
    })),
    total: data.total || 0,
  });
}

async function getIssueDetail(token: string, baseUrl: string, issueKey: string) {
  const res = await fetch(
    `${baseUrl}/issue/${encodeURIComponent(issueKey)}?fields=summary,description,status,assignee,reporter,priority,issuetype,updated,created,project,comment,labels,components`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Issue not found' }, { status: res.status });
  }

  const issue = await res.json();
  const fields = issue.fields || {};

  // Extract description text from ADF
  const descriptionText = extractTextFromADF(fields.description);

  // Extract comments
  const comments = (fields.comment?.comments || []).slice(-10).map((c: any) => ({
    id: c.id,
    author: c.author?.displayName || 'Unknown',
    body: extractTextFromADF(c.body),
    created: c.created,
    updated: c.updated,
  }));

  return NextResponse.json({
    issue: {
      id: issue.id,
      key: issue.key,
      summary: fields.summary || '',
      description: descriptionText,
      status: fields.status?.name || '',
      statusCategory: fields.status?.statusCategory?.key || '',
      priority: fields.priority?.name || '',
      issueType: fields.issuetype?.name || '',
      assignee: fields.assignee?.displayName || 'Unassigned',
      reporter: fields.reporter?.displayName || 'Unknown',
      projectKey: fields.project?.key || '',
      projectName: fields.project?.name || '',
      labels: fields.labels || [],
      components: (fields.components || []).map((c: any) => c.name),
      updated: fields.updated || '',
      created: fields.created || '',
      comments,
    },
  });
}
