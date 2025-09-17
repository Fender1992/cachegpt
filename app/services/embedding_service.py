import openai
from typing import List
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        self.client = openai.OpenAI(api_key=settings.openai_api_key)
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using OpenAI"""
        try:
            response = self.client.embeddings.create(
                input=text,
                model="text-embedding-ada-002"
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise
    
    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        try:
            response = self.client.embeddings.create(
                input=texts,
                model="text-embedding-ada-002"
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.error(f"Batch embedding generation failed: {e}")
            raise

embedding_service = EmbeddingService()