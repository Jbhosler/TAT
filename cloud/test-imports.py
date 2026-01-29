#!/usr/bin/env python3
"""Test script to verify all imports work before deployment."""
import sys

try:
    from backend.api.main import app
    print("✓ All imports successful")
    print("✓ FastAPI app created")
    sys.exit(0)
except Exception as e:
    print(f"✗ Import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
