/**
 * Context Formatters for External Application Context
 *
 * Formats structured context data into readable system prompts for LLMs.
 * Supports type-specific formatting (job, product, company) with fallback to generic.
 */

export type ContextType = 'job' | 'product' | 'company' | string;

/**
 * Format context data based on type
 */
export function formatContextData(
  data: Record<string, any>,
  contextType?: string
): string {
  if (!data || Object.keys(data).length === 0) {
    return '';
  }

  switch (contextType) {
    case 'job':
      return formatJobContext(data);
    case 'product':
      return formatProductContext(data);
    case 'company':
      return formatCompanyContext(data);
    default:
      return formatGenericContext(data);
  }
}

/**
 * Job-specific formatting with health indicators, company reputation, etc.
 */
export function formatJobContext(data: Record<string, any>): string {
  const sections: string[] = [];

  // Basic job info
  sections.push('**Job Information:**');
  sections.push(`- Title: ${data.title || 'Not specified'}`);
  sections.push(`- Company: ${data.company || 'Not specified'}`);
  sections.push(`- Location: ${data.location || 'Not specified'}`);
  sections.push(`- Remote: ${data.remoteType || 'Not specified'}`);
  sections.push(`- Salary: ${data.salary || 'Not specified'}`);

  if (data.postedDate || data.daysPosted !== undefined) {
    const posted = data.postedDate || 'Unknown';
    const days = data.daysPosted !== undefined ? ` (${data.daysPosted} days ago)` : '';
    sections.push(`- Posted: ${posted}${days}`);
  }

  sections.push(`- Employment Type: ${data.employmentType || 'Not specified'}`);
  sections.push(`- Experience Level: ${data.experienceLevel || 'Not specified'}`);

  // Health indicators
  sections.push('');
  sections.push('**Job Health Indicators:**');

  if (data.healthScore !== undefined) {
    sections.push(`- Health Score: ${(data.healthScore * 100).toFixed(0)}%`);
  }

  if (data.ghostScore !== undefined) {
    const warning = data.ghostScore >= 5 ? ' ⚠️ Possibly not actively hiring' : '';
    sections.push(`- Ghost Score: ${data.ghostScore}/10${warning}`);
  }

  if (data.repostCount !== undefined) {
    const warning = data.repostCount > 2 ? ' ⚠️ Reposted multiple times' : '';
    sections.push(`- Repost Count: ${data.repostCount}${warning}`);
  }

  if (data.daysPosted !== undefined && data.daysPosted > 60) {
    sections.push(`- Days Open: ${data.daysPosted} ⚠️ Open unusually long`);
  } else if (data.daysPosted !== undefined) {
    sections.push(`- Days Open: ${data.daysPosted}`);
  }

  // Company reputation
  if (data.companyReputation !== undefined || data.companyResponseRate !== undefined) {
    sections.push('');
    sections.push('**Company Reputation:**');

    if (data.companyReputation !== undefined) {
      sections.push(`- Reputation Score: ${(data.companyReputation * 100).toFixed(0)}%`);
    }
    if (data.companyResponseRate !== undefined) {
      sections.push(`- Response Rate: ${(data.companyResponseRate * 100).toFixed(0)}%`);
    }
    if (data.companyAvgTimeToFill) {
      sections.push(`- Average Time to Fill: ${data.companyAvgTimeToFill} days`);
    }
    if (data.companyFillRate !== undefined) {
      sections.push(`- Fill Rate: ${(data.companyFillRate * 100).toFixed(0)}%`);
    }
    if (data.companyOpenRoles !== undefined) {
      sections.push(`- Currently Open Roles: ${data.companyOpenRoles}`);
    }
  }

  // Source info
  if (data.sources || data.firstSeen || data.lastVerified) {
    sections.push('');
    sections.push('**Source Information:**');

    if (data.sources) {
      const sources = Array.isArray(data.sources) ? data.sources.join(', ') : data.sources;
      sections.push(`- Found on: ${sources}`);
    }
    if (data.firstSeen) {
      sections.push(`- First seen: ${data.firstSeen}`);
    }
    if (data.lastVerified) {
      sections.push(`- Last verified: ${data.lastVerified}`);
    }
    if (data.verificationCount !== undefined) {
      sections.push(`- Verified by: ${data.verificationCount} users`);
    }
  }

  // Description
  if (data.description) {
    sections.push('');
    sections.push('**Description:**');
    sections.push(data.description);
  }

  // Requirements
  if (data.requirements) {
    sections.push('');
    sections.push('**Requirements:**');
    if (Array.isArray(data.requirements)) {
      data.requirements.forEach((req: string) => sections.push(`- ${req}`));
    } else {
      sections.push(data.requirements);
    }
  }

  return sections.join('\n');
}

/**
 * Product-specific formatting
 */
export function formatProductContext(data: Record<string, any>): string {
  const sections: string[] = [];

  sections.push('**Product Information:**');
  sections.push(`- Name: ${data.name || 'Not specified'}`);
  sections.push(`- Category: ${data.category || 'Not specified'}`);
  sections.push(`- Price: ${data.price || 'Not specified'}`);
  sections.push(`- Brand: ${data.brand || 'Not specified'}`);

  if (data.rating !== undefined) {
    sections.push(`- Rating: ${data.rating}/5`);
  }
  if (data.reviewCount !== undefined) {
    sections.push(`- Reviews: ${data.reviewCount}`);
  }
  if (data.inStock !== undefined) {
    sections.push(`- Availability: ${data.inStock ? 'In Stock' : 'Out of Stock'}`);
  }

  if (data.description) {
    sections.push('');
    sections.push('**Description:**');
    sections.push(data.description);
  }

  if (data.features) {
    sections.push('');
    sections.push('**Features:**');
    if (Array.isArray(data.features)) {
      data.features.forEach((f: string) => sections.push(`- ${f}`));
    } else {
      sections.push(data.features);
    }
  }

  // Add any remaining fields generically
  const handledFields = ['name', 'category', 'price', 'brand', 'rating', 'reviewCount', 'inStock', 'description', 'features'];
  const remaining = Object.entries(data).filter(([key]) => !handledFields.includes(key));

  if (remaining.length > 0) {
    sections.push('');
    sections.push('**Additional Details:**');
    remaining.forEach(([key, value]) => {
      sections.push(`- ${formatKey(key)}: ${formatValue(value)}`);
    });
  }

  return sections.join('\n');
}

/**
 * Company-specific formatting
 */
export function formatCompanyContext(data: Record<string, any>): string {
  const sections: string[] = [];

  sections.push('**Company Information:**');
  sections.push(`- Name: ${data.name || 'Not specified'}`);
  sections.push(`- Industry: ${data.industry || 'Not specified'}`);
  sections.push(`- Size: ${data.size || data.employeeCount || 'Not specified'}`);
  sections.push(`- Founded: ${data.founded || 'Not specified'}`);
  sections.push(`- Location: ${data.location || data.headquarters || 'Not specified'}`);

  if (data.website) {
    sections.push(`- Website: ${data.website}`);
  }

  if (data.description) {
    sections.push('');
    sections.push('**About:**');
    sections.push(data.description);
  }

  if (data.culture || data.values) {
    sections.push('');
    sections.push('**Culture & Values:**');
    if (data.culture) sections.push(data.culture);
    if (data.values) {
      if (Array.isArray(data.values)) {
        data.values.forEach((v: string) => sections.push(`- ${v}`));
      } else {
        sections.push(data.values);
      }
    }
  }

  // Add any remaining fields generically
  const handledFields = ['name', 'industry', 'size', 'employeeCount', 'founded', 'location', 'headquarters', 'website', 'description', 'culture', 'values'];
  const remaining = Object.entries(data).filter(([key]) => !handledFields.includes(key));

  if (remaining.length > 0) {
    sections.push('');
    sections.push('**Additional Information:**');
    remaining.forEach(([key, value]) => {
      sections.push(`- ${formatKey(key)}: ${formatValue(value)}`);
    });
  }

  return sections.join('\n');
}

/**
 * Generic key-value formatting for unknown context types
 */
export function formatGenericContext(data: Record<string, any>): string {
  const lines: string[] = ['**Context Data:**'];

  for (const [key, value] of Object.entries(data)) {
    lines.push(`- ${formatKey(key)}: ${formatValue(value)}`);
  }

  return lines.join('\n');
}

/**
 * Convert camelCase/snake_case to Title Case
 */
function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Format a value for display
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'Not specified';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format GitHub integration context chunks into a system prompt
 */
export function formatGitHubContext(
  chunks: Array<{
    source_id: string;
    title: string | null;
    content: string;
    metadata: Record<string, any>;
    similarity: number;
  }>
): string | null {
  if (!chunks || chunks.length === 0) return null;

  const sections: string[] = [
    '## Your GitHub Context',
    'The following code/docs from your repositories may be relevant:',
    '',
  ];

  for (const chunk of chunks) {
    const filePath = chunk.title || chunk.source_id;
    const lang = chunk.metadata?.extension?.replace('.', '') || '';
    const repo = chunk.metadata?.repo || '';
    const label = repo ? `${repo}/${filePath}` : filePath;

    sections.push(`**${label}**:`);
    sections.push(`\`\`\`${lang}`);
    sections.push(chunk.content);
    sections.push('```');
    sections.push('');
  }

  sections.push('Use this code context to give accurate, repo-aware answers when relevant.');

  return sections.join('\n');
}

/**
 * Build a complete system prompt with context injection
 */
export function buildSystemPromptWithContext(
  baseSystemPrompt: string | undefined | null,
  contextData: Record<string, any> | undefined,
  contextType?: string
): string {
  // If no context data, return empty string (caller will skip injection)
  if (!contextData || Object.keys(contextData).length === 0) {
    return '';
  }

  // Format the context data
  const formattedContext = formatContextData(contextData, contextType);

  // Build the context injection prompt
  const contextPrompt = `## External Context Data

You have access to the following information provided by the application. Use this data to answer questions accurately and specifically.

${formattedContext}

**Important:**
- Base your answers on the provided context data
- If the context doesn't contain information to answer a question, say so
- Be specific and reference the actual data when relevant`;

  return contextPrompt;
}
