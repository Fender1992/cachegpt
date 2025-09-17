from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    jwt_secret: str
    environment: str = "development"
    log_level: str = "INFO"
    
    jwt_algorithm: Optional[str] = "HS256"
    jwt_expiration_minutes: Optional[int] = 15
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()