#!/usr/bin/env node

// Test server-side caching directly
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testServerCache() {
  console.log('\n🔍 Testing Server Cache System\n');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in environment');
    console.log('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  console.log('✅ Supabase credentials found');
  console.log(`   URL: ${supabaseUrl}`);

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Test 1: Check if cached_responses table exists
  console.log('\n📊 Checking cached_responses table...');

  const { data: tableCheck, error: tableError } = await supabase
    .from('cached_responses')
    .select('count')
    .limit(1);

  if (tableError) {
    console.error('❌ Error accessing cached_responses table:', tableError.message);

    // Try to get more info about the error
    if (tableError.message.includes('relation') && tableError.message.includes('does not exist')) {
      console.log('   ⚠️  Table might not exist or might be in a different schema');
    }
  } else {
    console.log('✅ cached_responses table is accessible');
  }

  // Test 2: Count existing cache entries
  console.log('\n📈 Checking existing cache entries...');

  const { count: totalCount, error: countError } = await supabase
    .from('cached_responses')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error counting cache entries:', countError.message);
  } else {
    console.log(`✅ Total cache entries: ${totalCount || 0}`);
  }

  // Test 3: Check recent entries
  console.log('\n🕐 Checking recent cache entries...');

  const { data: recentEntries, error: recentError } = await supabase
    .from('cached_responses')
    .select('id, query, model, provider, created_at, tier')
    .order('created_at', { ascending: false })
    .limit(5);

  if (recentError) {
    console.error('❌ Error fetching recent entries:', recentError.message);
  } else if (recentEntries && recentEntries.length > 0) {
    console.log(`✅ Found ${recentEntries.length} recent entries:`);
    recentEntries.forEach(entry => {
      console.log(`   - "${entry.query?.substring(0, 30)}..." (${entry.provider}/${entry.model}) - ${entry.created_at}`);
    });
  } else {
    console.log('⚠️  No cache entries found');
  }

  // Test 4: Try to insert a test entry
  console.log('\n🧪 Testing cache insertion...');

  const testQuery = 'Test query ' + Date.now();
  const testResponse = 'Test response';

  const { data: insertData, error: insertError } = await supabase
    .from('cached_responses')
    .insert({
      query: testQuery,
      response: testResponse,
      model: 'free-model',
      provider: 'mixed',
      embedding: new Array(384).fill(0),
      access_count: 1,
      popularity_score: 50,
      ranking_version: 1,
      tier: 'cool',
      cost_saved: 0.01,
      is_archived: false,
      created_at: new Date().toISOString(),
      last_accessed: new Date().toISOString()
    })
    .select('id');

  if (insertError) {
    console.error('❌ Error inserting test entry:', insertError.message);
    console.log('   Details:', insertError);
  } else {
    console.log('✅ Successfully inserted test entry with ID:', insertData?.[0]?.id);

    // Clean up test entry
    if (insertData?.[0]?.id) {
      const { error: deleteError } = await supabase
        .from('cached_responses')
        .delete()
        .eq('id', insertData[0].id);

      if (!deleteError) {
        console.log('   🧹 Test entry cleaned up');
      }
    }
  }

  // Test 5: Check table structure
  console.log('\n🔧 Checking table columns...');

  const { data: sampleRow, error: sampleError } = await supabase
    .from('cached_responses')
    .select('*')
    .limit(1)
    .single();

  if (sampleError && sampleError.message.includes('no rows')) {
    console.log('⚠️  Table is empty, cannot check structure');
  } else if (sampleError) {
    console.error('❌ Error fetching sample row:', sampleError.message);
  } else if (sampleRow) {
    const columns = Object.keys(sampleRow);
    console.log('✅ Table columns:', columns.join(', '));

    // Check for required columns
    const requiredColumns = ['query', 'response', 'model', 'provider', 'embedding', 'tier'];
    const missingColumns = requiredColumns.filter(col => !columns.includes(col));

    if (missingColumns.length > 0) {
      console.log('   ⚠️  Missing columns:', missingColumns.join(', '));
    } else {
      console.log('   ✅ All required columns present');
    }
  }

  console.log('\n📋 Summary:');
  console.log('- Database connection: ' + (tableError ? '❌ Failed' : '✅ Working'));
  console.log('- Table exists: ' + (tableError ? '❌ No' : '✅ Yes'));
  console.log('- Can insert: ' + (insertError ? '❌ No' : '✅ Yes'));
  console.log('- Total entries: ' + (totalCount || 0));
}

// Run the test
testServerCache().catch(console.error);