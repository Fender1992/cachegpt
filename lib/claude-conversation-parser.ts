import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export interface ClaudeMessage {
  uuid: string;
  parentUuid?: string;
  sessionId: string;
  type: 'user' | 'assistant' | 'system';
  message?: any;
  timestamp: string;
  cwd?: string;
  gitBranch?: string;
  userType?: string;
  version?: string;
  requestId?: string;
  toolUseResult?: any;
}

export interface ParsedConversation {
  sessionId: string;
  projectPath: string;
  gitBranch: string;
  startedAt: Date;
  lastUpdated: Date;
  messages: ClaudeMessage[];
  userId?: string;
}

export async function parseClaudeConversation(filePath: string): Promise<ParsedConversation> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const messages: ClaudeMessage[] = [];
  let sessionId = '';
  let projectPath = '';
  let gitBranch = '';
  let startedAt: Date | null = null;
  let lastUpdated: Date | null = null;
  let userId = '';

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const data = JSON.parse(line);

      // Extract session metadata from first message
      if (!sessionId && data.sessionId) {
        sessionId = data.sessionId;
        projectPath = data.cwd || '';
        gitBranch = data.gitBranch || 'main';
        userId = data.userID || '';
      }

      // Track timestamps
      const timestamp = new Date(data.timestamp);
      if (!startedAt || timestamp < startedAt) {
        startedAt = timestamp;
      }
      if (!lastUpdated || timestamp > lastUpdated) {
        lastUpdated = timestamp;
      }

      messages.push(data);
    } catch (error) {
      // Skip malformed lines silently
    }
  }

  return {
    sessionId,
    projectPath,
    gitBranch,
    startedAt: startedAt || new Date(),
    lastUpdated: lastUpdated || new Date(),
    messages,
    userId
  };
}

export async function* parseClaudeConversationStream(filePath: string) {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const data = JSON.parse(line);
      yield data;
    } catch (error) {
      // Skip malformed lines silently
    }
  }
}