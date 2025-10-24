const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkUserConversations() {
  try {
    // First, get the user ID
    console.log('Looking up user: rolandofender@gmail.com');
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, created_at')
      .eq('email', 'rolandofender@gmail.com')
      .single();

    if (profileError) {
      console.error('Error finding user:', profileError);
      return;
    }

    if (!profile) {
      console.log('User not found!');
      return;
    }

    console.log('\n✅ User found:');
    console.log('  ID:', profile.id);
    console.log('  Email:', profile.email);
    console.log('  Created:', profile.created_at);

    // Get conversations for this user
    console.log('\n📋 Checking conversations...');
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, title, provider, model, created_at, updated_at, platform')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (convError) {
      console.error('Error fetching conversations:', convError);
      return;
    }

    console.log(`\nFound ${conversations?.length || 0} conversations:`);

    if (conversations && conversations.length > 0) {
      for (const conv of conversations) {
        console.log('\n---');
        console.log('  ID:', conv.id);
        console.log('  Title:', conv.title);
        console.log('  Provider:', conv.provider);
        console.log('  Model:', conv.model);
        console.log('  Platform:', conv.platform);
        console.log('  Created:', conv.created_at);
        console.log('  Updated:', conv.updated_at);

        // Get message count for this conversation
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('user_id', profile.id);

        console.log('  Messages:', count || 0);
      }
    } else {
      console.log('\n⚠️  No conversations found for this user.');
      console.log('This could mean:');
      console.log('  1. User has never saved any conversations');
      console.log('  2. Conversations were created with a different user_id');
      console.log('  3. Conversations were deleted');
    }

    // Check if there are any messages for this user
    console.log('\n💬 Checking for any messages...');
    const { count: messageCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id);

    console.log(`Total messages for user: ${messageCount || 0}`);

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkUserConversations();
