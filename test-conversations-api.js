const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testConversationsAPI() {
  try {
    console.log('1. Getting session (simulating frontend)...');

    // First, we need to sign in as the user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: 'rolandofender@gmail.com',
      password: 'YOUR_PASSWORD_HERE' // You'll need to provide this
    });

    if (signInError) {
      console.error('❌ Sign in error:', signInError.message);
      console.log('\n⚠️  Note: This test requires your password to simulate a logged-in session.');
      console.log('Alternative: Open http://localhost:3000/chat in your browser while logged in');
      console.log('and check the browser console and network tab.\n');
      return;
    }

    console.log('✅ Signed in successfully');
    console.log('   User ID:', signInData.user.id);
    console.log('   Session token:', signInData.session.access_token.substring(0, 20) + '...');

    // Now get the session (what the frontend does)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('❌ Session error:', sessionError);
      return;
    }

    if (!session?.user?.id) {
      console.log('❌ No session found!');
      return;
    }

    console.log('\n2. Session check passed (user ID:', session.user.id + ')');

    // Now simulate the API call the frontend makes
    console.log('\n3. Making API request to /api/conversations...');

    const response = await fetch('http://localhost:3000/api/conversations?limit=20&platform=web', {
      headers: {
        'Cookie': `sb-access-token=${session.access_token}; sb-refresh-token=${session.refresh_token}`,
      }
    });

    console.log('   Response status:', response.status);
    console.log('   Response headers:', Object.fromEntries(response.headers.entries()));

    const data = await response.json();

    console.log('\n4. API Response:');
    console.log('   Conversations count:', data.conversations?.length || 0);
    console.log('   Requires auth:', data.requiresAuth);
    console.log('   User ID in response:', data.user_id);

    if (data.conversations && data.conversations.length > 0) {
      console.log('\n✅ SUCCESS! Conversations are being returned.');
      console.log('\nFirst 3 conversations:');
      data.conversations.slice(0, 3).forEach((conv, i) => {
        console.log(`\n   ${i + 1}. ${conv.title}`);
        console.log(`      ID: ${conv.conversation_id}`);
        console.log(`      Messages: ${conv.message_count}`);
      });
    } else {
      console.log('\n❌ PROBLEM: No conversations returned');
      console.log('   Full response:', JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

console.log('=== Testing Conversations API ===\n');
testConversationsAPI();
