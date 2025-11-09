"""Redis client and utilities."""
import json
from typing import Optional, Any
from redis import asyncio as aioredis

from core.config import settings


class RedisClient:
    """Redis client wrapper for caching and FSM storage."""
    
    def __init__(self):
        """Initialize Redis client."""
        self.client: Optional[aioredis.Redis] = None
    
    async def connect(self) -> None:
        """Connect to Redis."""
        self.client = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
    
    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self.client:
            await self.client.close()
    
    async def get(self, key: str) -> Optional[str]:
        """
        Get value by key.
        
        Args:
            key: Redis key
        
        Returns:
            Value as string or None if not found
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        return await self.client.get(key)
    
    async def set(
        self,
        key: str,
        value: str,
        ttl: Optional[int] = None
    ) -> None:
        """
        Set value with optional TTL.
        
        Args:
            key: Redis key
            value: Value to store
            ttl: Time to live in seconds (optional)
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        
        if ttl:
            await self.client.setex(key, ttl, value)
        else:
            await self.client.set(key, value)
    
    async def delete(self, key: str) -> None:
        """
        Delete key.
        
        Args:
            key: Redis key to delete
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        await self.client.delete(key)
    
    async def exists(self, key: str) -> bool:
        """
        Check if key exists.
        
        Args:
            key: Redis key
        
        Returns:
            True if key exists, False otherwise
        """
        if not self.client:
            raise RuntimeError("Redis client not connected")
        return await self.client.exists(key) > 0
    
    async def get_json(self, key: str) -> Optional[dict]:
        """
        Get JSON value by key.
        
        Args:
            key: Redis key
        
        Returns:
            Parsed JSON dict or None if not found
        """
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None
    
    async def set_json(
        self,
        key: str,
        value: dict,
        ttl: Optional[int] = None
    ) -> None:
        """
        Set JSON value with optional TTL.
        
        Args:
            key: Redis key
            value: Dict to store as JSON
            ttl: Time to live in seconds (optional)
        """
        json_value = json.dumps(value, ensure_ascii=False)
        await self.set(key, json_value, ttl)
    
    # FSM (Finite State Machine) storage methods
    
    async def get_fsm_state(self, user_id: int) -> Optional[str]:
        """
        Get FSM state for user.
        
        Args:
            user_id: Telegram user ID
        
        Returns:
            Current state or None
        """
        key = f"fsm:state:{user_id}"
        return await self.get(key)
    
    async def set_fsm_state(
        self,
        user_id: int,
        state: str,
        ttl: int = 600  # 10 minutes default
    ) -> None:
        """
        Set FSM state for user.
        
        Args:
            user_id: Telegram user ID
            state: State name
            ttl: Time to live in seconds (default 10 minutes)
        """
        key = f"fsm:state:{user_id}"
        await self.set(key, state, ttl)
    
    async def delete_fsm_state(self, user_id: int) -> None:
        """
        Delete FSM state for user.
        
        Args:
            user_id: Telegram user ID
        """
        key = f"fsm:state:{user_id}"
        await self.delete(key)
    
    async def get_fsm_data(self, user_id: int) -> Optional[dict]:
        """
        Get FSM data for user.
        
        Args:
            user_id: Telegram user ID
        
        Returns:
            FSM data dict or None
        """
        key = f"fsm:data:{user_id}"
        return await self.get_json(key)
    
    async def set_fsm_data(
        self,
        user_id: int,
        data: dict,
        ttl: int = 600  # 10 minutes default
    ) -> None:
        """
        Set FSM data for user.
        
        Args:
            user_id: Telegram user ID
            data: Data to store
            ttl: Time to live in seconds (default 10 minutes)
        """
        key = f"fsm:data:{user_id}"
        await self.set_json(key, data, ttl)
    
    # Subscription cache methods
    
    async def get_subscription_status(
        self,
        telegram_id: int
    ) -> Optional[bool]:
        """
        Get cached subscription status.
        
        Args:
            telegram_id: Telegram user ID
        
        Returns:
            True if subscribed, False if not, None if not cached
        """
        key = f"sub:{telegram_id}"
        value = await self.get(key)
        if value is None:
            return None
        return value == "1"
    
    async def set_subscription_status(
        self,
        telegram_id: int,
        is_subscribed: bool,
        ttl: Optional[int] = None
    ) -> None:
        """
        Cache subscription status.
        
        Args:
            telegram_id: Telegram user ID
            is_subscribed: Subscription status
            ttl: Time to live in seconds (default from settings)
        """
        key = f"sub:{telegram_id}"
        value = "1" if is_subscribed else "0"
        cache_ttl = ttl or settings.SUBSCRIPTION_CACHE_TTL
        await self.set(key, value, cache_ttl)


# Global Redis client instance
redis_client = RedisClient()


async def get_redis() -> RedisClient:
    """
    Dependency for getting Redis client.
    
    Returns:
        RedisClient instance
    """
    return redis_client

