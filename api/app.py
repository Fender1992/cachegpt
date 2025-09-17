"""
Vercel serverless function wrapper for FastAPI app
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
import sys
import os

# Add parent directory to path to import app module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the main FastAPI app
from app.main import app as application

# Create handler for Vercel
handler = Mangum(application)

# Export for Vercel
app = handler