# Utility functions for the application
import hashlib
import json
from typing import Any, Dict

def generate_hash(data: Dict[str, Any]) -> str:
    """Generate SHA-256 hash of data"""
    json_str = json.dumps(data, sort_keys=True)
    return hashlib.sha256(json_str.encode()).hexdigest()