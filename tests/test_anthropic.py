#!/usr/bin/env python
"""Test Anthropic API key"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_anthropic_api():
    """Test Anthropic API through our proxy"""
    print("=" * 50)
    print("TESTING ANTHROPIC API KEY")
    print("=" * 50)
    
    # Test with Claude model
    test_message = {
        "messages": [
            {"role": "user", "content": "Say 'Hello from Claude' in exactly 4 words"}
        ],
        "model": "claude-3-sonnet-20240229",
        "max_tokens": 50,
        "temperature": 0
    }
    
    print("\nTesting Claude API call...")
    print("-" * 40)
    print(f"Model: {test_message['model']}")
    print(f"Message: {test_message['messages'][0]['content']}")
    print("-" * 40)
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/chat/completions",
            json=test_message,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"\nResponse Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Success: API call completed")
            print(f"Cached: {data.get('cached', False)}")
            print(f"Response: {data['choices'][0]['message']['content']}")
            
            if data.get('usage'):
                print(f"\nToken Usage:")
                print(f"  Input: {data['usage'].get('prompt_tokens', 'N/A')}")
                print(f"  Output: {data['usage'].get('completion_tokens', 'N/A')}")
                print(f"  Total: {data['usage'].get('total_tokens', 'N/A')}")
            
            print("\n[SUCCESS] Anthropic API key is VALID and working!")
            return True
            
        elif response.status_code == 401:
            print("[ERROR] Authentication failed - Invalid API key")
            error_data = response.json()
            print(f"Error: {error_data.get('detail', 'Unknown error')}")
            return False
            
        elif response.status_code == 500:
            error_data = response.json()
            error_detail = error_data.get('detail', '')
            
            if 'invalid_api_key' in error_detail or '401' in error_detail:
                print("[ERROR] Anthropic API key is INVALID")
                print(f"Error: {error_detail}")
            elif 'rate_limit' in error_detail.lower():
                print("[WARNING] Rate limit exceeded - API key may be valid but limit reached")
                print(f"Error: {error_detail}")
            else:
                print("[ERROR] API call failed")
                print(f"Error: {error_detail}")
            return False
            
        else:
            print(f"Unexpected response: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("[ERROR] Request timed out after 30 seconds")
        return False
    except requests.exceptions.ConnectionError:
        print("[ERROR] Could not connect to server at", BASE_URL)
        print("Make sure the FastAPI server is running")
        return False
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        return False

def test_openai_api():
    """Test OpenAI API through our proxy"""
    print("\n" + "=" * 50)
    print("TESTING OPENAI API KEY")
    print("=" * 50)
    
    test_message = {
        "messages": [
            {"role": "user", "content": "Say 'Hello from GPT' in exactly 4 words"}
        ],
        "model": "gpt-3.5-turbo",
        "max_tokens": 50,
        "temperature": 0
    }
    
    print("\nTesting OpenAI API call...")
    print("-" * 40)
    print(f"Model: {test_message['model']}")
    print(f"Message: {test_message['messages'][0]['content']}")
    print("-" * 40)
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/chat/completions",
            json=test_message,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"\nResponse Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Success: API call completed")
            print(f"Cached: {data.get('cached', False)}")
            print(f"Response: {data['choices'][0]['message']['content']}")
            
            if data.get('usage'):
                print(f"\nToken Usage:")
                print(f"  Input: {data['usage'].get('prompt_tokens', 'N/A')}")
                print(f"  Output: {data['usage'].get('completion_tokens', 'N/A')}")
                print(f"  Total: {data['usage'].get('total_tokens', 'N/A')}")
            
            print("\n[SUCCESS] OpenAI API key is VALID and working!")
            return True
            
        elif response.status_code == 500:
            error_data = response.json()
            error_detail = error_data.get('detail', '')
            
            if 'invalid_api_key' in error_detail or '401' in error_detail:
                print("[ERROR] OpenAI API key is INVALID")
                print(f"Error: {error_detail}")
            elif 'rate_limit' in error_detail.lower():
                print("[WARNING] Rate limit exceeded - API key may be valid but limit reached")
                print(f"Error: {error_detail}")
            else:
                print("[ERROR] API call failed")
                print(f"Error: {error_detail}")
            return False
            
        else:
            print(f"Unexpected response: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        return False

if __name__ == "__main__":
    print("\nAPI KEY VALIDATION TEST")
    print("=" * 50)
    
    # Test Anthropic first
    anthropic_valid = test_anthropic_api()
    
    # Test OpenAI
    openai_valid = test_openai_api()
    
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    
    if anthropic_valid and openai_valid:
        print("[SUCCESS] Both API keys are valid and working!")
        print("\nYou can now use:")
        print("  - OpenAI models (gpt-3.5-turbo, gpt-4, etc.)")
        print("  - Anthropic models (claude-3-sonnet, claude-3-opus, etc.)")
        sys.exit(0)
    elif anthropic_valid:
        print("[SUCCESS] Anthropic API key is valid")
        print("[ERROR] OpenAI API key is invalid or has issues")
        sys.exit(1)
    elif openai_valid:
        print("[SUCCESS] OpenAI API key is valid")
        print("[ERROR] Anthropic API key is invalid or has issues")
        sys.exit(1)
    else:
        print("[ERROR] Both API keys have issues")
        print("\nPlease check your .env file and ensure the keys are correct")
        sys.exit(1)