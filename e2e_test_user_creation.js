#!/usr/bin/env node

// E2E Test: User Creation via API
// This bypasses the interactive CLI to test the underlying API functionality

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Supabase configuration missing. Please set environment variables.');
  process.exit(1);
}

async function testUserCreation() {
  console.log('🧪 E2E Test: User Creation');
  console.log('================================\n');

  const timestamp = Date.now();
  const testEmail = `user_e2e_cli+ts${timestamp}@example.com`;
  const testPassword = 'testpassword123';

  console.log(`📧 Test email: ${testEmail}`);
  console.log(`🔐 Test password: ${testPassword}\n`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('🔄 Creating user account...');
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: `E2E Test User ${timestamp}`
        }
      }
    });

    if (error) {
      console.error('❌ User creation failed:', error.message);
      process.exit(1);
    }

    if (data.user) {
      console.log('✅ User created successfully!');
      console.log(`📋 User ID: ${data.user.id}`);
      console.log(`📧 Email: ${data.user.email}`);
      console.log(`⏰ Created: ${data.user.created_at}`);
      console.log(`🔄 Email confirmed: ${data.user.email_confirmed_at ? 'Yes' : 'Pending'}`);

      // Store test user data for subsequent phases
      const fs = require('fs');
      const path = require('path');
      const artifactsDir = path.join(__dirname, 'e2e_artifacts');

      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
      }

      const testUserData = {
        email: testEmail,
        password: testPassword,
        userId: data.user.id,
        createdAt: data.user.created_at,
        accessToken: data.session?.access_token,
        refreshToken: data.session?.refresh_token,
        session: data.session
      };

      fs.writeFileSync(
        path.join(artifactsDir, 'test_user_data.json'),
        JSON.stringify(testUserData, null, 2)
      );

      console.log('\n💾 Test user data saved to e2e_artifacts/test_user_data.json');

      return testUserData;
    } else {
      console.error('❌ No user data returned from signup');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test if called directly
if (require.main === module) {
  testUserCreation()
    .then((userData) => {
      console.log('\n🎉 Phase 1 Test: PASS');
      console.log('User creation completed successfully');
    })
    .catch((error) => {
      console.error('\n💥 Phase 1 Test: FAIL');
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = { testUserCreation };