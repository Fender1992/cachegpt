from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import logging
from app.config import settings
from app.database.supabase_client import supabase_client
from app.routers import proxy
from app.middleware.security_middleware import setup_security_middleware
from app.services.subscription_service import subscription_service
import os

# Configure logging
logging.basicConfig(level=getattr(logging, settings.log_level))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LLM Cache Proxy",
    description="Intelligent caching proxy for LLM APIs with subscription management",
    version="2.0.0"
)

# Setup all security middleware (includes CORS, rate limiting, etc.)
setup_security_middleware(app)

@app.on_event("startup")
async def startup_event():
    """Test connections on startup"""
    logger.info("Starting LLM Cache Proxy...")
    
    # Test Supabase connection
    if await supabase_client.test_connection():
        logger.info("✅ Supabase connection successful")
    else:
        logger.warning("⚠️ Supabase connection failed - database tables may not be set up")
        logger.warning("Please run setup_database.sql in your Supabase SQL editor")
        # Don't crash, allow the app to start for testing

@app.get("/")
async def root():
    return {"message": "LLM Cache Proxy API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    db_status = await supabase_client.test_connection()
    
    return {
        "status": "healthy" if db_status else "unhealthy",
        "database": "connected" if db_status else "disconnected",
        "environment": settings.environment
    }

# Include routers
app.include_router(proxy.router, prefix="/api", tags=["proxy"])

# Import and include subscription router
from app.routers import subscription
app.include_router(subscription.router, prefix="/api", tags=["subscription"])

# Mount static files directory
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/download/cli/windows")
async def download_cli_windows():
    """Download the Windows CLI executable"""
    file_path = "app/static/llm-cache.exe"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="CLI executable not found")
    return FileResponse(
        path=file_path,
        filename="llm-cache.exe",
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=llm-cache.exe"}
    )

@app.get("/download/cli")
async def get_cli_info():
    """Get information about available CLI downloads"""
    return {
        "windows": {
            "platform": "Windows x64",
            "download_url": "/download/cli/windows",
            "filename": "llm-cache.exe",
            "size_mb": round(os.path.getsize("app/static/llm-cache.exe") / (1024 * 1024), 2) if os.path.exists("app/static/llm-cache.exe") else None,
            "instructions": [
                "Download the executable",
                "Place it in a folder in your PATH or run directly",
                "Run 'llm-cache init' to configure",
                "Use 'llm-cache --help' for available commands"
            ]
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)