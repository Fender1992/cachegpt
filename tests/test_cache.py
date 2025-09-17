#!/usr/bin/env python
"""Test the LLM caching functionality"""

import requests
import json
import time
import sys

BASE_URL = "http://localhost:8000"

def test_cache_functionality():
    """Test exact and semantic caching"""
    print("=" * 50)
    print("Testing LLM Cache Proxy - Phase 2")
    print("=" * 50)
    
    # Test message
    test_message = {
        "messages": [
            {"role": "user", "content": "What is 2+2?"}
        ],
        "model": "gpt-3.5-turbo",
        "temperature": 0
    }
    
    print("\n1. Testing FIRST request (Cache MISS expected)...")
    print("-" * 40)
    
    # First request - should be a cache miss
    start_time = time.time()
    response1 = requests.post(
        f"{BASE_URL}/api/v1/chat/completions",
        json=test_message,
        headers={"Content-Type": "application/json"}
    )
    time1 = time.time() - start_time
    
    if response1.status_code == 200:
        data1 = response1.json()
        print(f"  Status: {response1.status_code}")
        print(f"  Cached: {data1.get('cached', False)}")
        print(f"  Response Time: {time1:.3f}s")
        print(f"  Response: {data1['choices'][0]['message']['content'][:100]}...")
        if data1.get('usage'):
            print(f"  Tokens Used: {data1['usage'].get('total_tokens', 'N/A')}")
    else:
        print(f"  ERROR: {response1.status_code} - {response1.text}")
        return False
    
    print("\n2. Testing SECOND request (Cache HIT expected)...")
    print("-" * 40)
    
    # Second request - should be a cache hit (exact match)
    time.sleep(1)  # Small delay
    start_time = time.time()
    response2 = requests.post(
        f"{BASE_URL}/api/v1/chat/completions",
        json=test_message,
        headers={"Content-Type": "application/json"}
    )
    time2 = time.time() - start_time
    
    if response2.status_code == 200:
        data2 = response2.json()
        print(f"  Status: {response2.status_code}")
        print(f"  Cached: {data2.get('cached', False)}")
        print(f"  Cache Type: {data2.get('cache_type', 'N/A')}")
        print(f"  Response Time: {time2:.3f}s")
        print(f"  Response: {data2['choices'][0]['message']['content'][:100]}...")
    else:
        print(f"  ERROR: {response2.status_code} - {response2.text}")
        return False
    
    print("\n3. Testing SEMANTIC match...")
    print("-" * 40)
    
    # Similar request - should trigger semantic match
    similar_message = {
        "messages": [
            {"role": "user", "content": "Can you calculate 2 plus 2?"}
        ],
        "model": "gpt-3.5-turbo",
        "temperature": 0
    }
    
    start_time = time.time()
    response3 = requests.post(
        f"{BASE_URL}/api/v1/chat/completions",
        json=similar_message,
        headers={"Content-Type": "application/json"}
    )
    time3 = time.time() - start_time
    
    if response3.status_code == 200:
        data3 = response3.json()
        print(f"  Status: {response3.status_code}")
        print(f"  Cached: {data3.get('cached', False)}")
        print(f"  Cache Type: {data3.get('cache_type', 'N/A')}")
        print(f"  Similarity: {data3.get('similarity', 'N/A')}")
        print(f"  Response Time: {time3:.3f}s")
        print(f"  Response: {data3['choices'][0]['message']['content'][:100]}...")
    else:
        print(f"  ERROR: {response3.status_code} - {response3.text}")
    
    print("\n4. Testing Cache Statistics...")
    print("-" * 40)
    
    # Get cache statistics
    stats_response = requests.get(f"{BASE_URL}/api/v1/cache/stats")
    
    if stats_response.status_code == 200:
        stats = stats_response.json()
        print(f"  Total Requests: {stats.get('total_requests', 0)}")
        print(f"  Cache Hits: {stats.get('cache_hits', 0)}")
        print(f"  Cache Hit Rate: {stats.get('cache_hit_rate', 0):.2%}")
        print(f"  Cost Saved: ${stats.get('total_cost_saved', 0):.4f}")
        print(f"  Tokens Saved: {stats.get('total_tokens_saved', 0)}")
    else:
        print(f"  Could not retrieve stats: {stats_response.status_code}")
    
    print("\n" + "=" * 50)
    print("Performance Summary")
    print("=" * 50)
    
    if response1.status_code == 200 and response2.status_code == 200:
        speedup = time1 / time2 if time2 > 0 else 0
        print(f"  First Request (cache miss): {time1:.3f}s")
        print(f"  Second Request (cache hit): {time2:.3f}s")
        print(f"  Speedup: {speedup:.1f}x faster")
        
        if data2.get('cached'):
            print("\n[SUCCESS] Caching is working correctly!")
            return True
        else:
            print("\n[WARNING] Second request was not cached")
            return False
    
    return False

def test_api_endpoints():
    """Test that new endpoints are available"""
    print("\nTesting API Endpoints...")
    print("-" * 40)
    
    endpoints = [
        ("/api/v1/chat/completions", "POST"),
        ("/api/v1/cache/stats", "GET"),
        ("/docs", "GET")
    ]
    
    for endpoint, method in endpoints:
        try:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}")
            else:
                response = requests.options(f"{BASE_URL}{endpoint}")
            
            print(f"  [{response.status_code}] {method} {endpoint}")
        except Exception as e:
            print(f"  [ERROR] {method} {endpoint}: {e}")
    
    return True

if __name__ == "__main__":
    print("\nStarting Phase 2 Tests...")
    print("Note: This will make actual API calls to OpenAI")
    print("=" * 50)
    
    # Test endpoints
    test_api_endpoints()
    
    # Test caching
    success = test_cache_functionality()
    
    if success:
        print("\n✅ Phase 2 tests PASSED!")
        sys.exit(0)
    else:
        print("\n❌ Phase 2 tests FAILED")
        sys.exit(1)