'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, MessageSquare, GitBranch, Folder, RefreshCw, User } from 'lucide-react';

interface Conversation {
  id: string;
  session_id: string;
  auth_user_id: string | null;
  claude_user_id: string | null;
  project_path: string;
  git_branch: string;
  started_at: string;
  last_updated: string;
  message_count: number;
  user_messages: number;
  assistant_messages: number;
  total_output_tokens: number;
  total_input_tokens: number;
}

export default function ConversationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [claimingConversations, setClaimingConversations] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      fetchConversations();
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation);
    }
  }, [selectedConversation]);

  async function fetchConversations() {
    try {
      // Fetch all conversations - RLS will filter based on user
      const { data, error } = await supabase
        .from('conversation_summaries')
        .select('*')
        .order('last_updated', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function claimConversations() {
    if (!user) return;

    setClaimingConversations(true);
    try {
      // Get the Claude user ID from local storage or config
      const claudeUserId = localStorage.getItem('claude_user_id');

      if (claudeUserId) {
        const { data, error } = await supabase
          .rpc('claim_conversations_by_claude_user', {
            claude_uid: claudeUserId
          });

        if (error) throw error;

        console.log(`Claimed ${data} conversations`);
        // Refresh the conversations list
        await fetchConversations();
      }
    } catch (error) {
      console.error('Error claiming conversations:', error);
    } finally {
      setClaimingConversations(false);
    }
  }

  async function fetchMessages(conversationId: string) {
    try {
      const { data, error } = await supabase
        .from('claude_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const formatTokens = (tokens: number) => {
    if (!tokens) return '0';
    return tokens.toLocaleString();
  };

  if (authLoading) {
    return (
      <div className="container mx-auto p-6">
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Please log in to view your conversations.
            </p>
            <Button onClick={() => window.location.href = '/login'}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const unclaimedCount = conversations.filter(c => !c.auth_user_id).length;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Claude Conversations</h1>
        <div className="flex gap-2">
          {unclaimedCount > 0 && (
            <Button
              onClick={claimConversations}
              disabled={claimingConversations}
              variant="outline"
            >
              {claimingConversations ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <User className="h-4 w-4 mr-2" />
              )}
              Claim {unclaimedCount} Unclaimed Conversations
            </Button>
          )}
          <Button onClick={fetchConversations} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {loading ? (
                  <div className="p-4">Loading...</div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-muted-foreground">
                    No conversations synced yet. Run `llm-cache sync-claude` to sync your Claude Code conversations.
                  </div>
                ) : (
                  <div className="divide-y">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`p-4 cursor-pointer hover:bg-accent transition-colors ${
                          selectedConversation === conv.id ? 'bg-accent' : ''
                        }`}
                        onClick={() => setSelectedConversation(conv.id)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Folder className="h-4 w-4" />
                            <span className="text-sm font-medium truncate max-w-[200px]">
                              {conv.project_path.split('/').pop() || 'Unknown'}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            <MessageSquare className="h-3 w-3 mr-1" />
                            {conv.message_count}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <GitBranch className="h-3 w-3" />
                          <span>{conv.git_branch}</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(conv.last_updated)}</span>
                        </div>

                        {(conv.total_input_tokens || conv.total_output_tokens) && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Tokens: {formatTokens(conv.total_input_tokens)} in / {formatTokens(conv.total_output_tokens)} out
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                {!selectedConversation ? (
                  <div className="text-muted-foreground">
                    Select a conversation to view messages
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-muted-foreground">
                    No messages to display
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-4 rounded-lg ${
                          msg.role === 'user'
                            ? 'bg-blue-50 dark:bg-blue-950 ml-8'
                            : 'bg-gray-50 dark:bg-gray-900 mr-8'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant={msg.role === 'user' ? 'default' : 'secondary'}>
                            {msg.role}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(msg.timestamp)}
                          </span>
                        </div>

                        {msg.content?.content && (
                          <div className="mt-2 text-sm">
                            {Array.isArray(msg.content.content) ? (
                              msg.content.content.map((item: any, index: number) => (
                                <div key={index} className="mb-2">
                                  {item.type === 'text' && <p>{item.text}</p>}
                                  {item.type === 'tool_use' && (
                                    <div className="p-2 bg-secondary rounded text-xs font-mono">
                                      Tool: {item.name}
                                    </div>
                                  )}
                                  {item.type === 'tool_result' && (
                                    <div className="p-2 bg-secondary rounded text-xs">
                                      <details>
                                        <summary className="cursor-pointer">Tool Result</summary>
                                        <pre className="mt-2 overflow-x-auto">{item.content}</pre>
                                      </details>
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p>{String(msg.content.content)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}