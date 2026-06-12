"""Реестр пользователей бота (JSON) для админ-статистики."""

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger("rich-posts-users")

_lock = threading.Lock()


def _registry_path() -> Path:
    return settings.DATA_DIR / "users.json"


def _load_all() -> dict[str, dict[str, Any]]:
    path = _registry_path()
    if not path.exists():
        return {}
    try:
        with _lock:
            raw = json.loads(path.read_text("utf-8"))
        if isinstance(raw, dict):
            return {str(k): v for k, v in raw.items() if isinstance(v, dict)}
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("users registry load failed: %s", exc)
    return {}


def _save_all(data: dict[str, dict[str, Any]]) -> None:
    path = _registry_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with _lock:
        tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
        tmp.replace(path)


def _merge_profile(existing: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    out = dict(existing)
    for key in ("username", "first_name", "last_name", "language_code"):
        val = profile.get(key)
        if val:
            out[key] = val
    return out


def touch_user(
    tg_id: int,
    *,
    profile: dict[str, Any] | None = None,
    event: str | None = None,
) -> None:
    """Записывает или обновляет пользователя. event: start|app|upload|preview|publish."""
    if tg_id <= 0:
        return
    now = int(time.time())
    key = str(tg_id)
    data = _load_all()
    row = dict(data.get(key) or {})
    if not row:
        row = {
            "tg_id": tg_id,
            "first_seen": now,
            "starts": 0,
            "app_opens": 0,
            "uploads": 0,
            "previews": 0,
            "publishes": 0,
        }
    row["last_seen"] = now
    if profile:
        row = _merge_profile(row, profile)

    if event == "start":
        row["starts"] = int(row.get("starts") or 0) + 1
    elif event == "app":
        row["app_opens"] = int(row.get("app_opens") or 0) + 1
    elif event == "upload":
        row["uploads"] = int(row.get("uploads") or 0) + 1
    elif event == "preview":
        row["previews"] = int(row.get("previews") or 0) + 1
    elif event == "publish":
        row["publishes"] = int(row.get("publishes") or 0) + 1

    data[key] = row
    _save_all(data)


def touch_from_message(message: dict[str, Any], *, event: str = "start") -> None:
    from_user = message.get("from")
    if not isinstance(from_user, dict):
        return
    tg_id = from_user.get("id")
    if not isinstance(tg_id, int) or tg_id <= 0:
        return
    touch_user(
        tg_id,
        profile={
            "username": from_user.get("username"),
            "first_name": from_user.get("first_name"),
            "last_name": from_user.get("last_name"),
            "language_code": from_user.get("language_code"),
        },
        event=event,
    )


def dashboard_stats() -> dict[str, Any]:
    data = _load_all()
    now = int(time.time())
    day = 24 * 3600
    week = 7 * day

    users = list(data.values())
    total = len(users)
    new_today = sum(1 for u in users if now - int(u.get("first_seen") or 0) < day)
    new_week = sum(1 for u in users if now - int(u.get("first_seen") or 0) < week)
    active_today = sum(1 for u in users if now - int(u.get("last_seen") or 0) < day)
    active_week = sum(1 for u in users if now - int(u.get("last_seen") or 0) < week)

    totals = {
        "starts": sum(int(u.get("starts") or 0) for u in users),
        "app_opens": sum(int(u.get("app_opens") or 0) for u in users),
        "uploads": sum(int(u.get("uploads") or 0) for u in users),
        "previews": sum(int(u.get("previews") or 0) for u in users),
        "publishes": sum(int(u.get("publishes") or 0) for u in users),
    }

    recent = sorted(users, key=lambda u: int(u.get("last_seen") or 0), reverse=True)[:30]
    for u in recent:
        u.pop("last_name", None)

    return {
        "generated_at": now,
        "users_total": total,
        "users_new_today": new_today,
        "users_new_week": new_week,
        "users_active_today": active_today,
        "users_active_week": active_week,
        "totals": totals,
        "recent_users": recent,
    }


def format_stats_text(stats: dict[str, Any]) -> str:
    t = stats.get("totals") or {}
    return (
        "<b>📊 Rich Posts — статистика</b>\n\n"
        f"👥 Пользователей: <b>{stats.get('users_total', 0)}</b>\n"
        f"🆕 Новых за 24 ч: <b>{stats.get('users_new_today', 0)}</b> "
        f"(за 7 д: {stats.get('users_new_week', 0)})\n"
        f"🟢 Активных за 24 ч: <b>{stats.get('users_active_today', 0)}</b> "
        f"(за 7 д: {stats.get('users_active_week', 0)})\n\n"
        f"/start: {t.get('starts', 0)} · редактор: {t.get('app_opens', 0)}\n"
        f"загрузки: {t.get('uploads', 0)} · превью: {t.get('previews', 0)} · "
        f"публикации: {t.get('publishes', 0)}\n\n"
        "Полный дашборд: /admin"
    )
