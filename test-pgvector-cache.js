#!/usr/bin/env node

// Test pgvector cache functionality after fix
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testPgvectorCache() {
  console.log('\n🔍 Testing PgVector Cache Fix\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Test 1: Insert with pgvector format
  console.log('📝 Test 1: Inserting test entry with pgvector format...');

  // Generate a simple embedding as pgvector string
  const embedding = new Array(384).fill(0).map((_, i) => (Math.sin(i) * 0.5).toFixed(4));
  const pgvectorString = '[' + embedding.join(',') + ']';

  const testData = {
    query: 'Test pgvector format ' + Date.now(),
    response: 'This is a test response for pgvector',
    model: 'free-model',
    provider: 'mixed',
    embedding: pgvectorString, // Using pgvector string format
    user_id: null,
    access_count: 1,
    popularity_score: 50,
    ranking_version: 1,
    tier: 'cool',
    cost_saved: 0.01,
    is_archived: false,
    created_at: new Date().toISOString(),
    last_accessed: new Date().toISOString(),
    last_score_update: new Date().toISOString()
  };

  const { data: insertData, error: insertError } = await supabase
    .from('cached_responses')
    .insert(testData)
    .select('id, query, embedding');

  if (insertError) {
    console.error('❌ Insert failed:', insertError.message);
    console.error('   Error details:', JSON.stringify(insertError, null, 2));
  } else {
    console.log('✅ Successfully inserted with pgvector format');
    console.log('   ID:', insertData[0].id);
    console.log('   Query:', insertData[0].query);

    // Test 2: Retrieve and verify format
    console.log('\n📖 Test 2: Retrieving entry to check format...');

    const { data: retrieveData, error: retrieveError } = await supabase
      .from('cached_responses')
      .select('id, embedding')
      .eq('id', insertData[0].id)
      .single();

    if (retrieveError) {
      console.error('❌ Retrieve failed:', retrieveError.message);
    } else {
      console.log('✅ Successfully retrieved entry');

      const embeddingType = typeof retrieveData.embedding;
      console.log('   Embedding type:', embeddingType);

      if (embeddingType === 'string') {
        console.log('   ✅ Embedding is string (pgvector format)');

        // Try to parse it
        try {
          const parsed = JSON.parse(retrieveData.embedding);
          console.log('   ✅ Can parse back to array, length:', parsed.length);
        } catch (e) {
          console.error('   ❌ Cannot parse embedding:', e.message);
        }
      } else if (Array.isArray(retrieveData.embedding)) {
        console.log('   ⚠️  Embedding is already an array (might be auto-converted)');
      } else {
        console.log('   ❓ Unexpected embedding type:', embeddingType);
      }
    }

    // Clean up test entry
    console.log('\n🧹 Cleaning up test entry...');
    const { error: deleteError } = await supabase
      .from('cached_responses')
      .delete()
      .eq('id', insertData[0].id);

    if (!deleteError) {
      console.log('✅ Test entry cleaned up');
    }
  }

  // Test 3: Check existing entries
  console.log('\n📊 Test 3: Checking format of existing entries...');

  const { data: existingData, error: existingError } = await supabase
    .from('cached_responses')
    .select('id, query, embedding')
    .limit(3);

  if (existingError) {
    console.error('❌ Error fetching existing entries:', existingError.message);
  } else if (existingData && existingData.length > 0) {
    console.log(`✅ Found ${existingData.length} existing entries:`);

    existingData.forEach((entry, i) => {
      const embeddingType = typeof entry.embedding;
      console.log(`   Entry ${i + 1}:`);
      console.log(`     Query: "${entry.query?.substring(0, 30)}..."`);
      console.log(`     Embedding type: ${embeddingType}`);

      if (embeddingType === 'string' && entry.embedding) {
        console.log(`     Embedding preview: ${entry.embedding.substring(0, 50)}...`);
      } else if (Array.isArray(entry.embedding)) {
        console.log(`     Embedding array length: ${entry.embedding.length}`);
      }
    });
  } else {
    console.log('⚠️  No existing cache entries found');
  }

  console.log('\n✅ PgVector cache test complete!\n');
}

// Run the test
testPgvectorCache().catch(console.error);