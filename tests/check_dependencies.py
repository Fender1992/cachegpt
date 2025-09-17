#!/usr/bin/env python
"""Check which dependencies are installed"""

import sys
import importlib

dependencies = [
    ("fastapi", "FastAPI"),
    ("uvicorn", "Uvicorn"),
    ("supabase", "Supabase"),
    ("openai", "OpenAI"),
    ("anthropic", "Anthropic"),
    ("pydantic", "Pydantic"),
    ("pydantic_settings", "Pydantic Settings"),
    ("jose", "Python-JOSE"),
    ("passlib", "Passlib"),
    ("multipart", "Python-Multipart"),
    ("prometheus_client", "Prometheus Client"),
    ("redis", "Redis"),
    ("httpx", "HTTPX"),
    ("sqlalchemy", "SQLAlchemy"),
    ("asyncpg", "AsyncPG"),
    ("alembic", "Alembic"),
]

print("=" * 50)
print("Dependency Check for LLM Cache Proxy")
print("=" * 50)
print()

installed = []
missing = []

for module_name, display_name in dependencies:
    try:
        importlib.import_module(module_name)
        installed.append(display_name)
        print(f"[OK] {display_name:<20} - Installed")
    except ImportError:
        missing.append(display_name)
        print(f"[MISSING] {display_name:<20} - Not installed")

print()
print("=" * 50)
print("Summary")
print("=" * 50)
print(f"Installed: {len(installed)}/{len(dependencies)}")
print(f"Missing: {len(missing)}/{len(dependencies)}")

if missing:
    print()
    print("Missing dependencies:")
    for dep in missing:
        print(f"  - {dep}")
    print()
    print("To install missing dependencies, fix SSL issue and run:")
    print("  pip install -r requirements.txt")
else:
    print()
    print("All dependencies are installed!")
    print("You can now run the application with:")
    print("  python -m app.main")

sys.exit(0 if not missing else 1)