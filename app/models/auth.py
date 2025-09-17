from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime

class UserProfile(BaseModel):
    id: uuid.UUID
    email: str
    plan_type: str = "free"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class ApiKey(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    key_name: str
    api_key: str
    is_active: bool = True
    created_at: Optional[datetime] = None