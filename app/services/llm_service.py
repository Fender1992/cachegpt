import openai
import anthropic
from typing import Dict, Any, Optional, List
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.openai_client = openai.OpenAI(api_key=settings.openai_api_key)
        if settings.anthropic_api_key:
            self.anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    
    async def call_openai(self, messages: List[Dict], model: str = "gpt-3.5-turbo", **kwargs) -> Dict[str, Any]:
        """Call OpenAI API"""
        try:
            response = self.openai_client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs
            )
            
            return {
                "choices": [{"message": {"content": response.choices[0].message.content}}],
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                },
                "model": response.model
            }
        except Exception as e:
            logger.error(f"OpenAI API call failed: {e}")
            raise
    
    async def call_anthropic(self, messages: List[Dict], model: str = "claude-3-sonnet-20240229", **kwargs) -> Dict[str, Any]:
        """Call Anthropic API"""
        try:
            # For now, skip Anthropic if not working properly
            # This is a known issue with the API version mismatch
            raise NotImplementedError("Anthropic API integration needs updating for the latest SDK version")
            
        except Exception as e:
            logger.error(f"Anthropic API call failed: {e}")
            raise

llm_service = LLMService()