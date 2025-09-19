import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseClaudeConversation } from '@/lib/claude-conversation-parser';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 503 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authenticated user from the request headers/cookies
    const authToken = req.headers.get('authorization')?.replace('Bearer ', '');
    let authUserId = null;

    if (authToken) {
      const { data: { user }, error } = await supabase.auth.getUser(authToken);
      if (!error && user) {
        authUserId = user.id;
      }
    }

    const { filePath, conversationData } = await req.json();

    let conversation;
    if (conversationData) {
      // Direct conversation data provided
      conversation = conversationData;
    } else if (filePath) {
      // Parse from file
      conversation = await parseClaudeConversation(filePath);
    } else {
      return NextResponse.json(
        { error: 'Either filePath or conversationData is required' },
        { status: 400 }
      );
    }

    // Check if conversation already exists
    const { data: existingConv } = await supabase
      .from('claude_conversations')
      .select('id')
      .eq('session_id', conversation.sessionId)
      .single();

    let conversationId;

    if (existingConv) {
      // Update existing conversation
      const { data: updatedConv, error: updateError } = await supabase
        .from('claude_conversations')
        .update({
          last_updated: conversation.lastUpdated,
          git_branch: conversation.gitBranch,
        })
        .eq('id', existingConv.id)
        .select('id')
        .single();

      if (updateError) throw updateError;
      conversationId = updatedConv.id;
    } else {
      // Create new conversation
      const { data: newConv, error: createError } = await supabase
        .from('claude_conversations')
        .insert({
          session_id: conversation.sessionId,
          user_id: conversation.userId,
          auth_user_id: authUserId, // Link to authenticated user
          project_path: conversation.projectPath,
          git_branch: conversation.gitBranch,
          started_at: conversation.startedAt,
          last_updated: conversation.lastUpdated,
        })
        .select('id')
        .single();

      if (createError) throw createError;
      conversationId = newConv.id;
    }

    // Get existing message UUIDs to avoid duplicates
    const { data: existingMessages } = await supabase
      .from('claude_messages')
      .select('uuid')
      .eq('conversation_id', conversationId);

    const existingUuids = new Set(existingMessages?.map((m: any) => m.uuid) || []);

    // Prepare messages for insertion
    const newMessages = conversation.messages
      .filter((msg: any) => !existingUuids.has(msg.uuid))
      .map((msg: any) => ({
        conversation_id: conversationId,
        message_id: msg.message?.id || null,
        parent_uuid: msg.parentUuid || null,
        uuid: msg.uuid,
        role: msg.type === 'user' ? 'user' : msg.type === 'assistant' ? 'assistant' : 'system',
        content: msg.message || {},
        model: msg.message?.model || null,
        timestamp: msg.timestamp,
        request_id: msg.requestId || null,
        usage: msg.message?.usage || null,
        tool_use_result: msg.toolUseResult || null,
      }));

    // Insert new messages in batches
    if (newMessages.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < newMessages.length; i += batchSize) {
        const batch = newMessages.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('claude_messages')
          .insert(batch);

        if (insertError) throw insertError;
      }
    }

    return NextResponse.json({
      success: true,
      conversationId,
      messagesAdded: newMessages.length,
      totalMessages: conversation.messages.length,
    });
  } catch (error) {
    console.error('Error syncing conversation:', error);
    return NextResponse.json(
      { error: 'Failed to sync conversation', details: String(error) },
      { status: 500 }
    );
  }
}