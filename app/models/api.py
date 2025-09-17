from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    messages: List[Dict[str, str]]
    model: str = "gpt-3.5-turbo"
    max_tokens: Optional[int] = None
    temperature: Optional[float] = 1.0
    stream: bool = False

class ChatCompletionResponse(BaseModel):
    choices: List[Dict[str, Any]]
    cached: bool = False
    cache_type: Optional[str] = None
    similarity: Optional[float] = None
    usage: Optional[Dict[str, int]] = None