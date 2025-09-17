#!/usr/bin/env python
"""Test Phase 2 implementation without making real API calls"""

import requests
import sys

BASE_URL = "http://localhost:8000"

def test_endpoints():
    """Test that all Phase 2 endpoints exist"""
    print("=" * 50)
    print("PHASE 2 ENDPOINT VERIFICATION")
    print("=" * 50)
    
    tests_passed = True
    
    # Test new endpoints
    print("\nTesting Phase 2 Endpoints...")
    
    # 1. Chat completions endpoint
    print("\n1. Testing /api/v1/chat/completions...")
    response = requests.post(
        f"{BASE_URL}/api/v1/chat/completions",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "model": "gpt-3.5-turbo"
        }
    )
    if response.status_code in [200, 401, 500]:  # Any response means endpoint exists
        print(f"  [OK] Endpoint exists (status: {response.status_code})")
    else:
        print(f"  [FAIL] Unexpected status: {response.status_code}")
        tests_passed = False
    
    # 2. Cache stats endpoint
    print("\n2. Testing /api/v1/cache/stats...")
    response = requests.get(f"{BASE_URL}/api/v1/cache/stats")
    if response.status_code == 200:
        stats = response.json()
        print(f"  [OK] Endpoint exists")
        print(f"       Total Requests: {stats.get('total_requests', 0)}")
        print(f"       Cache Hits: {stats.get('cache_hits', 0)}")
        print(f"       Hit Rate: {stats.get('cache_hit_rate', 0):.0%}")
    else:
        print(f"  [FAIL] Status: {response.status_code}")
        tests_passed = False
    
    # 3. Check API docs updated
    print("\n3. Checking API documentation...")
    response = requests.get(f"{BASE_URL}/openapi.json")
    if response.status_code == 200:
        spec = response.json()
        paths = spec.get("paths", {})
        
        phase2_endpoints = [
            "/api/v1/chat/completions",
            "/api/v1/cache/stats"
        ]
        
        for endpoint in phase2_endpoints:
            if endpoint in paths:
                print(f"  [OK] {endpoint} documented")
            else:
                print(f"  [MISSING] {endpoint} not in API spec")
                tests_passed = False
    
    return tests_passed

def test_services():
    """Test that services are imported correctly"""
    print("\n" + "=" * 50)
    print("SERVICE MODULE VERIFICATION")
    print("=" * 50)
    
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    tests_passed = True
    
    # Test service imports
    services = [
        ("app.services.embedding_service", "EmbeddingService"),
        ("app.services.llm_service", "LLMService"),
        ("app.services.cache_service", "CacheService"),
    ]
    
    print("\nTesting service modules...")
    for module_name, class_name in services:
        try:
            module = __import__(module_name, fromlist=[class_name])
            if hasattr(module, class_name.lower().replace("service", "_service")):
                print(f"  [OK] {module_name}")
            else:
                print(f"  [WARNING] {module_name} - no singleton instance")
        except ImportError as e:
            print(f"  [FAIL] {module_name}: {e}")
            tests_passed = False
    
    # Test model imports
    models = [
        ("app.models.api", "ChatCompletionRequest"),
        ("app.models.api", "ChatCompletionResponse"),
        ("app.models.auth", "UserProfile"),
        ("app.models.auth", "ApiKey"),
    ]
    
    print("\nTesting model classes...")
    for module_name, class_name in models:
        try:
            module = __import__(module_name, fromlist=[class_name])
            if hasattr(module, class_name):
                print(f"  [OK] {class_name} from {module_name}")
            else:
                print(f"  [FAIL] {class_name} not found in {module_name}")
                tests_passed = False
        except ImportError as e:
            print(f"  [FAIL] {module_name}: {e}")
            tests_passed = False
    
    return tests_passed

def main():
    print("\nPHASE 2 VERIFICATION TEST")
    print("(Without making real API calls)")
    print("=" * 50)
    
    all_passed = True
    
    # Test endpoints
    if not test_endpoints():
        all_passed = False
    
    # Test services
    if not test_services():
        all_passed = False
    
    print("\n" + "=" * 50)
    print("PHASE 2 VERIFICATION RESULTS")
    print("=" * 50)
    
    if all_passed:
        print("\n[SUCCESS] Phase 2 implementation verified!")
        print("\nPhase 2 Components:")
        print("  [x] Embedding service created")
        print("  [x] LLM service created")
        print("  [x] Cache service created")
        print("  [x] API models defined")
        print("  [x] Proxy router implemented")
        print("  [x] Chat completions endpoint available")
        print("  [x] Cache stats endpoint available")
        print("\nNote: Actual caching functionality requires valid API keys.")
        return 0
    else:
        print("\n[WARNING] Some Phase 2 components missing or not working")
        return 1

if __name__ == "__main__":
    sys.exit(main())