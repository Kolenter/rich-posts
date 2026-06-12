"""Валидация Telegram initData для Rich Posts mini app."""

import hashlib
import hmac
import json
import time
from typing import Dict, Optional
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException

from app.config import settings


def verify_init_data(init_data: str, bot_token: str) -> Optional[Dict]:
    if len(init_data) > settings.INIT_DATA_MAX_LEN:
        return None

    try:
        parsed = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        return None

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None

    auth_date_raw = parsed.get("auth_date")
    if not auth_date_raw:
        return None
    try:
        auth_ts = int(auth_date_raw)
        if auth_ts > time.time() + 60:
            return None
        if time.time() - auth_ts > settings.INIT_DATA_MAX_AGE_SEC:
            return None
    except ValueError:
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        return None

    try:
        user = json.loads(parsed.get("user", "{}"))
    except json.JSONDecodeError:
        return None

    tg_id = user.get("id")
    if not isinstance(tg_id, int) or tg_id <= 0:
        return None

    return {
        "tg_id": tg_id,
        "username": user.get("username"),
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "language_code": user.get("language_code"),
    }


def authenticate(init_data: str) -> Dict:
    for token in settings.bot_tokens:
        info = verify_init_data(init_data, token)
        if info and info.get("tg_id"):
            return info
    raise HTTPException(status_code=401, detail="Требуется авторизация Telegram")


async def get_current_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
) -> Dict:
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Требуется авторизация Telegram")
    if len(x_telegram_init_data) > settings.INIT_DATA_MAX_LEN:
        raise HTTPException(status_code=401, detail="Требуется авторизация Telegram")
    user = authenticate(x_telegram_init_data)
    return user


async def require_admin(current_user: Dict = Depends(get_current_user)) -> Dict:
    tg_id = int(current_user["tg_id"])
    if tg_id not in settings.ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    return current_user
