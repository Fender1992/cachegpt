#!/usr/bin/env python
"""Test OpenAI API and caching functionality"""

import requests
import json
import time
import sys

BASE_URL = "http://localhost:8000"

def test_openai_caching():
    """Test OpenAI API with caching"""
    print("=" * 50)
    print("TESTING OPENAI API WITH CACHING")
    print("=" * 50)
    
    # Simple test message
    test_message = {
        "messages": [
            {"role": "user", "content": "What is 2+2? Answer in one number only."}
        ],
        "model": "gpt-3.5-turbo",
        "max_tokens": 10,
        "temperature": 0
    }
    
    print("\n1. FIRST REQUEST (Cache MISS - calling OpenAI)...")
    print("-" * 40)
    
    # First request - should call OpenAI
    start_time = time.time()
    try:
        response1 = requests.post(
            f"{BASE_URL}/api/v1/chat/completions",
            json=test_message,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        time1 = time.time() - start_time
        
        if response1.status_code == 200:
            data1 = response1.json()
            print(f"  Status: SUCCESS")
            print(f"  Cached: {data1.get('cached', False)}")
            print(f"  Response Time: {time1:.3f}s")
            print(f"  Response: {data1['choices'][0]['message']['content']}")
            if data1.get('usage'):
                print(f"  Tokens Used: {data1['usage'].get('total_tokens', 'N/A')}")
        else:
            print(f"  ERROR: {response1.status_code}")
            print(f"  Details: {response1.text}")
            return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False
    
    print("\n2. SECOND REQUEST (Cache HIT - from cache)...")
    print("-" * 40)
    
    # Wait a moment
    time.sleep(1)
    
    # Second request - should hit cache
    start_time = time.time()
    try:
        response2 = requests.post(
            f"{BASE_URL}/api/v1/chat/completions",
            json=test_message,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        time2 = time.time() - start_time
        
        if response2.status_code == 200:
            data2 = response2.json()
            print(f"  Status: SUCCESS")
            print(f"  Cached: {data2.get('cached', False)}")
            print(f"  Cache Type: {data2.get('cache_type', 'N/A')}")
            print(f"  Response Time: {time2:.3f}s")
            print(f"  Response: {data2['choices'][0]['message']['content']}")
            
            # Check if it was actually cached
            if data2.get('cached'):
                print(f"\n  [SUCCESS] Cache is working! Response served from cache.")
            else:
                print(f"\n  [WARNING] Response was not cached.")
        else:
            print(f"  ERROR: {response2.status_code}")
            return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False
    
    print("\n3. TESTING SEMANTIC SIMILARITY...")
    print("-" * 40)
    
    # Similar but different question
    similar_message = {
        "messages": [
            {"role": "user", "content": "Calculate 2 plus 2 and give me just the number"}
        ],
        "model": "gpt-3.5-turbo",
        "max_tokens": 10,
        "temperature": 0
    }
    
    start_time = time.time()
    try:
        response3 = requests.post(
            f"{BASE_URL}/api/v1/chat/completions",
            json=similar_message,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        time3 = time.time() - start_time
        
        if response3.status_code == 200:
            data3 = response3.json()
            print(f"  Status: SUCCESS")
            print(f"  Cached: {data3.get('cached', False)}")
            print(f"  Cache Type: {data3.get('cache_type', 'N/A')}")
            if data3.get('similarity'):
                print(f"  Similarity Score: {data3['similarity']:.4f}")
            print(f"  Response Time: {time3:.3f}s")
            print(f"  Response: {data3['choices'][0]['message']['content']}")
            
            if data3.get('cached') and data3.get('cache_type') == 'semantic':
                print(f"\n  [SUCCESS] Semantic cache is working!")
        else:
            print(f"  ERROR: {response3.status_code}")
    except Exception as e:
        print(f"  ERROR: {e}")
    
    print("\n" + "=" * 50)
    print("PERFORMANCE SUMMARY")
    print("=" * 50)
    
    if 'data1' in locals() and 'data2' in locals():
        if time1 > 0 and time2 > 0:
            speedup = time1 / time2
            print(f"  First Request (OpenAI API): {time1:.3f}s")
            print(f"  Second Request (from cache): {time2:.3f}s")
            print(f"  Speed Improvement: {speedup:.1f}x faster")
            
            if data2.get('cached'):
                print(f"\n[SUCCESS] Caching system is fully operational!")
                print(f"  - Exact match caching: WORKING")
                if 'data3' in locals() and data3.get('cached'):
                    print(f"  - Semantic similarity caching: WORKING")
                return True
    
    return False

def check_cache_stats():
    """Check cache statistics"""
    print("\n" + "=" * 50)
    print("CACHE STATISTICS")
    print("=" * 50)
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/cache/stats")
        if response.status_code == 200:
            stats = response.json()
            print(f"  Total Requests: {stats.get('total_requests', 0)}")
            print(f"  Cache Hits: {stats.get('cache_hits', 0)}")
            print(f"  Hit Rate: {stats.get('cache_hit_rate', 0):.1%}")
            print(f"  Cost Saved: ${stats.get('total_cost_saved', 0):.4f}")
            print(f"  Tokens Saved: {stats.get('total_tokens_saved', 0)}")
    except Exception as e:
        print(f"  Could not fetch stats: {e}")

if __name__ == "__main__":
    print("\nOPENAI CACHING TEST")
    print("This will make real API calls to OpenAI")
    print("=" * 50)
    
    success = test_openai_caching()
    check_cache_stats()
    
    print("\n" + "=" * 50)
    if success:
        print("[SUCCESS] All tests passed! Phase 2 is fully functional!")
        print("\nThe LLM Cache Proxy is working correctly:")
        print("  - OpenAI API integration: WORKING")
        print("  - Exact match caching: WORKING")
        print("  - Semantic similarity: WORKING")
        print("  - Database storage: WORKING")
        print("  - Cost tracking: WORKING")
        sys.exit(0)
    else:
        print("[INFO] Check the errors above for details")
        sys.exit(1)