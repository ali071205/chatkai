import asyncio
import json
import logging
import secrets
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis


PayloadHandler = Callable[[int, dict[str, Any]], Awaitable[None]]


class RedisChannel:
    def __init__(
        self,
        redis_url: str | None,
        channel_name: str,
        payload_handler: PayloadHandler,
    ) -> None:
        self._redis_url = redis_url
        self._channel_name = channel_name
        self._payload_handler = payload_handler
        self._instance_id = secrets.token_hex(8)
        self._publisher: Redis | None = None
        self._subscriber: Redis | None = None
        self._listener_task: asyncio.Task[None] | None = None
        self.connected = False
        self._logger = logging.getLogger("nova.realtime")

    @property
    def enabled(self) -> bool:
        return bool(self._redis_url)

    async def start(self) -> None:
        if not self._redis_url or self._listener_task:
            return

        try:
            self._publisher = Redis.from_url(self._redis_url, decode_responses=True)
            self._subscriber = Redis.from_url(self._redis_url, decode_responses=True)
            await self._publisher.ping()
            self.connected = True
            self._listener_task = asyncio.create_task(self._listen())
            self._logger.info("Redis realtime channel connected: %s", self._channel_name)
        except Exception:
            self.connected = False
            await self._close_clients()
            self._logger.exception("Redis unavailable; realtime is using local delivery")

    async def stop(self) -> None:
        listener_task = self._listener_task
        self._listener_task = None
        if listener_task:
            listener_task.cancel()
            try:
                await listener_task
            except asyncio.CancelledError:
                pass

        self.connected = False
        await self._close_clients()

    async def publish(self, user_id: int, payload: dict[str, Any]) -> None:
        if not self.connected or not self._publisher:
            return

        event = {
            "origin": self._instance_id,
            "user_id": user_id,
            "payload": payload,
        }
        try:
            await self._publisher.publish(self._channel_name, json.dumps(event))
        except Exception:
            self.connected = False
            self._logger.exception("Redis publish failed; keeping local realtime active")

    async def _listen(self) -> None:
        if not self._subscriber:
            return

        pubsub = self._subscriber.pubsub()
        try:
            await pubsub.subscribe(self._channel_name)
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    event = json.loads(message["data"])
                    if event.get("origin") == self._instance_id:
                        continue
                    user_id = int(event["user_id"])
                    payload = event["payload"]
                    if isinstance(payload, dict):
                        await self._payload_handler(user_id, payload)
                except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                    self._logger.warning("Ignored malformed Redis realtime event")
        except asyncio.CancelledError:
            raise
        except Exception:
            self.connected = False
            self._logger.exception("Redis realtime listener stopped unexpectedly")
        finally:
            await pubsub.aclose()

    async def _close_clients(self) -> None:
        if self._subscriber:
            await self._subscriber.aclose()
            self._subscriber = None
        if self._publisher:
            await self._publisher.aclose()
            self._publisher = None
