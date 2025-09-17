from supabase import create_client, Client
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class SupabaseClient:
    def __init__(self):
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key
        )
    
    async def test_connection(self) -> bool:
        """Test database connection"""
        try:
            result = self.client.table("user_profiles").select("id").limit(1).execute()
            return True
        except Exception as e:
            logger.error(f"Supabase connection failed: {e}")
            return False

# Global instance
supabase_client = SupabaseClient()