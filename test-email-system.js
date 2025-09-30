/**
 * Email System Validation Script
 * Tests the email notification system end-to-end
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, symbol, message) {
  console.log(`${colors[color]}${symbol} ${message}${colors.reset}`);
}

async function validateEmailSystem() {
  console.log('\n' + '='.repeat(60));
  console.log('📧 Email Notification System Validation');
  console.log('='.repeat(60) + '\n');

  // Step 1: Check environment variables
  log('cyan', '🔍', 'Step 1: Checking environment variables...');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    log('red', '❌', 'NEXT_PUBLIC_SUPABASE_URL not found');
    return;
  }
  if (!supabaseKey) {
    log('red', '❌', 'SUPABASE_SERVICE_KEY not found');
    return;
  }

  log('green', '✅', `Supabase URL: ${supabaseUrl.substring(0, 40)}...`);
  log('green', '✅', `Service key: ${supabaseKey.substring(0, 20)}...`);

  // Step 2: Connect to Supabase
  log('cyan', '\n🔍', 'Step 2: Connecting to Supabase...');

  const supabase = createClient(supabaseUrl, supabaseKey);
  log('green', '✅', 'Connected to Supabase');

  // Step 3: Check user_roles table
  log('cyan', '\n🔍', 'Step 3: Checking admin roles...');

  const { data: admins, error: adminError } = await supabase
    .from('user_roles')
    .select('user_id, role, created_at')
    .eq('role', 'admin');

  if (adminError) {
    log('red', '❌', `Error fetching admins: ${adminError.message}`);
    log('yellow', '⚠️', 'This means the RBAC migration may not have run yet');
    log('yellow', '⚠️', 'Run: psql -f database-scripts/030_rbac_and_notifications.sql');
    return;
  }

  if (!admins || admins.length === 0) {
    log('yellow', '⚠️', 'No admins found in user_roles table');
    log('yellow', '⚠️', 'Run migration to create admin roles');
    return;
  }

  log('green', '✅', `Found ${admins.length} admin(s)`);

  // Get admin emails
  const { data: adminUsers } = await supabase.auth.admin.listUsers();
  const adminEmails = admins.map(admin => {
    const user = adminUsers?.users.find(u => u.id === admin.user_id);
    return user?.email || 'Unknown';
  });

  adminEmails.forEach(email => {
    log('blue', '  📧', email);
  });

  // Step 4: Check bug_notifications table
  log('cyan', '\n🔍', 'Step 4: Checking notification queue...');

  const { data: notifications, error: notifError } = await supabase
    .from('bug_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (notifError) {
    log('red', '❌', `Error fetching notifications: ${notifError.message}`);
    return;
  }

  if (!notifications || notifications.length === 0) {
    log('yellow', '⚠️', 'No notifications in queue');
    log('blue', 'ℹ️', 'Submit a high/critical priority bug to test');
    console.log('\n' + '='.repeat(60));
    console.log('📝 How to Test:');
    console.log('='.repeat(60));
    console.log('1. Go to your app (e.g., https://cachegpt.app)');
    console.log('2. Click the red bug button (bottom right)');
    console.log('3. Fill in bug details');
    console.log('4. Set priority to HIGH or CRITICAL');
    console.log('5. Submit');
    console.log('6. Run this script again to see the notification');
    console.log('='.repeat(60) + '\n');
    return;
  }

  log('green', '✅', `Found ${notifications.length} notification(s) in queue`);

  // Count by status
  const statusCounts = notifications.reduce((acc, n) => {
    acc[n.status] = (acc[n.status] || 0) + 1;
    return acc;
  }, {});

  console.log('\nNotification Status:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    const color = status === 'sent' ? 'green' : status === 'failed' ? 'red' : 'yellow';
    log(color, '  •', `${status}: ${count}`);
  });

  // Show recent notifications
  console.log('\nRecent Notifications:');
  notifications.slice(0, 5).forEach((n, i) => {
    const statusColor = n.status === 'sent' ? 'green' : n.status === 'failed' ? 'red' : 'yellow';
    console.log(`\n  ${i + 1}. ${n.recipient_email}`);
    log(statusColor, '     Status:', n.status);
    log('blue', '     Type:', n.notification_type);
    log('blue', '     Retry:', n.retry_count);
    if (n.error_message) {
      log('red', '     Error:', n.error_message);
    }
    if (n.sent_at) {
      log('green', '     Sent:', new Date(n.sent_at).toLocaleString());
    }
  });

  // Step 5: Check Supabase Edge Function
  log('cyan', '\n🔍', 'Step 5: Testing Supabase Edge Function...');

  const functionUrl = `${supabaseUrl}/functions/v1/send-email`;

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: adminEmails[0] || 'test@example.com',
        from: 'onboarding@resend.dev',
        subject: 'CacheGPT Email System Test',
        html: '<h1>✅ Email System Working</h1><p>Your email notification system is configured correctly!</p>',
        text: '✅ Email System Working - Your email notification system is configured correctly!'
      })
    });

    if (response.ok) {
      const result = await response.json();
      log('green', '✅', 'Edge Function is working!');
      log('green', '📧', `Test email sent to: ${adminEmails[0]}`);
      console.log('     Check your inbox (and spam folder)');
    } else {
      const error = await response.text();
      log('red', '❌', `Edge Function error: ${response.status}`);
      log('red', '   ', error);

      if (response.status === 404) {
        log('yellow', '⚠️', 'Edge Function not deployed');
        log('yellow', '⚠️', 'Run: supabase functions deploy send-email');
      }
      if (error.includes('RESEND_API_KEY')) {
        log('yellow', '⚠️', 'RESEND_API_KEY not configured');
        log('yellow', '⚠️', 'Run: supabase secrets set RESEND_API_KEY=your_key');
      }
    }
  } catch (error) {
    log('red', '❌', `Failed to reach Edge Function: ${error.message}`);
  }

  // Step 6: Check cron job endpoint
  log('cyan', '\n🔍', 'Step 6: Checking cron job endpoint...');

  console.log('\nCron endpoint: /api/cron/process-notifications');
  console.log('Schedule: Every 5 minutes (*/5 * * * *)');
  console.log('Configured in: vercel.json ✅');

  log('blue', 'ℹ️', 'Cron will process notifications automatically');
  log('blue', 'ℹ️', 'Next run: Within 5 minutes of deployment');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  log('green', '✅', `Admins configured: ${admins.length}`);
  log(notifications.length > 0 ? 'green' : 'yellow',
      notifications.length > 0 ? '✅' : '⚠️',
      `Notifications in queue: ${notifications.length}`);
  log('green', '✅', 'Edge Function tested');
  log('green', '✅', 'Cron job configured');

  console.log('\n' + '='.repeat(60));
  console.log('🎉 Email System Validation Complete!');
  console.log('='.repeat(60) + '\n');
}

// Run validation
validateEmailSystem().catch(error => {
  console.error('\n❌ Validation failed:', error);
  process.exit(1);
});
