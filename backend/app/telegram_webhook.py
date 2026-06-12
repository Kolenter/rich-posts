"""Webhook бота: /start с приветствием и кнопкой Mini App."""

import hmac
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.telegram_client import telegram_api

logger = logging.getLogger("rich-posts-api")

router = APIRouter(prefix=f"{settings.API_V1_STR}/telegram", tags=["telegram-bot"])

START_HTML = """<b>👋 Добро пожаловать в Rich Posts</b>

Редактор <b>Rich Messages</b> для Telegram — создавайте красивые посты прямо в mini app.

<b>Возможности:</b>
• Заголовки, списки, фото, таблицы, карты
• Жирный, курсив, спойлеры, ссылки
• Превью и отправка <b>себе</b> или в канал

Нажмите кнопку ниже, чтобы открыть редактор ↓"""


def _miniapp_url() -> str:
    url = settings.MINIAPP_URL.strip()
    if not url:
        return ""
    if not url.endswith("/"):
        url += "/"
    return url


def _start_keyboard() -> dict[str, Any]:
    return {
        "inline_keyboard": [
            [
                {
                    "text": "✨ Открыть редактор",
                    "web_app": {"url": _miniapp_url()},
                }
            ],
        ]
    }


def _verify_webhook_secret(provided: str) -> None:
    expected = settings.WEBHOOK_SECRET
    if not expected:
        raise HTTPException(status_code=503, detail="Webhook не настроен")
    if not provided or len(provided) != len(expected):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")


async def send_start_welcome(chat_id: int) -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return
    await telegram_api(
        token,
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": START_HTML,
            "parse_mode": "HTML",
            "reply_markup": _start_keyboard(),
            "disable_web_page_preview": True,
        },
    )


async def configure_bot() -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return

    try:
        await telegram_api(
            token,
            "setMyCommands",
            {
                "commands": [
                    {"command": "start", "description": "Открыть редактор Rich Posts"},
                ]
            },
        )
    except RuntimeError as exc:
        logger.warning("setMyCommands: %s", exc)

    try:
        await telegram_api(
            token,
            "setChatMenuButton",
            {
                "menu_button": {
                    "type": "web_app",
                    "text": "Rich Posts",
                    "web_app": {"url": _miniapp_url()},
                }
            },
        )
    except RuntimeError as exc:
        logger.warning("setChatMenuButton: %s", exc)

    webhook_url = settings.WEBHOOK_URL.strip()
    if not webhook_url:
        return

    if not settings.WEBHOOK_SECRET:
        logger.error(
            "WEBHOOK_SECRET не задан — webhook не регистрируется. "
            "Задайте секрет в .env и перезапустите сервис."
        )
        return

    payload: dict[str, Any] = {
        "url": webhook_url,
        "allowed_updates": ["message"],
        "drop_pending_updates": False,
        "secret_token": settings.WEBHOOK_SECRET,
    }

    try:
        await telegram_api(token, "setWebhook", payload)
        logger.info("Telegram webhook set: %s", webhook_url)
    except RuntimeError as exc:
        logger.warning("setWebhook failed: %s", exc)


@router.post("/webhook")
async def telegram_webhook(request: Request):
    _verify_webhook_secret(request.headers.get("X-Telegram-Bot-Api-Secret-Token", ""))

    raw = await request.body()
    if len(raw) > settings.WEBHOOK_MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Payload too large")

    try:
        import json

        update = json.loads(raw)
    except Exception:
        return JSONResponse({"ok": True})

    if not isinstance(update, dict):
        return JSONResponse({"ok": True})

    message = update.get("message")
    if not isinstance(message, dict):
        return JSONResponse({"ok": True})

    text = (message.get("text") or "").strip()
    chat = message.get("chat")
    if not isinstance(chat, dict):
        return JSONResponse({"ok": True})

    chat_id = chat.get("id")
    if not isinstance(chat_id, int) or chat_id == 0:
        return JSONResponse({"ok": True})

    if text.split()[0].split("@")[0].lower() == "/start":
        try:
            await send_start_welcome(chat_id)
        except RuntimeError as exc:
            logger.warning("/start reply failed chat=%s: %s", chat_id, exc)

    return JSONResponse({"ok": True})
