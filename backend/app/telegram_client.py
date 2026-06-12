"""Общий клиент Telegram Bot API."""

import logging

import httpx

logger = logging.getLogger("rich-posts-api")


async def telegram_api(token: str, method: str, payload: dict | None = None) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, json=payload or {})
        data = response.json()
    if not data.get("ok"):
        desc = data.get("description", "Telegram API error")
        logger.warning("Telegram %s failed: %s", method, desc)
        raise RuntimeError(desc)
    return data.get("result") or {}
