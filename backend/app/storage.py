"""Хранилище истории публикаций и очистка загруженных медиа.

История хранится по пользователю (tg_id) в JSON, БЕЗ медиафайлов:
блоки сохраняются, но ссылки на наши загруженные файлы обнуляются —
файлы удаляются после публикации и по сроку хранения.
"""

import json
import logging
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger("rich-posts-storage")

_lock = threading.Lock()

# URL вида {UPLOAD_PUBLIC_BASE}/{tg_id}/{token}/{filename}
_UPLOAD_URL_RE = re.compile(
    re.escape(settings.UPLOAD_PUBLIC_BASE) + r"/(\d+)/([A-Za-z0-9_-]{6,})/([A-Za-z0-9_.\-]+)"
)


def _history_path(tg_id: int) -> Path:
    return settings.DATA_DIR / "history" / f"{tg_id}.json"


def _is_our_upload(url: str) -> bool:
    return isinstance(url, str) and url.startswith(settings.UPLOAD_PUBLIC_BASE + "/")


def sanitize_blocks(blocks: Any) -> tuple[list[dict], bool]:
    """Удаляет ссылки на наши загруженные файлы из блоков (для хранения истории).

    Возвращает (очищенные_блоки, были_ли_медиа). Внешние https-ссылки сохраняются.
    """
    had_media = False
    if not isinstance(blocks, list):
        return [], had_media

    cleaned: list[dict] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        b = dict(block)
        btype = b.get("type")
        if btype == "media" and _is_our_upload(b.get("url", "")):
            b["url"] = ""
            had_media = True
        elif btype in ("collage", "slideshow") and isinstance(b.get("items"), list):
            items = []
            for item in b["items"]:
                if isinstance(item, dict):
                    it = dict(item)
                    if _is_our_upload(it.get("url", "")):
                        it["url"] = ""
                        had_media = True
                    items.append(it)
            b["items"] = items
        cleaned.append(b)
    return cleaned, had_media


def _derive_title(blocks: list[dict]) -> str:
    for b in blocks:
        if not isinstance(b, dict):
            continue
        if b.get("type") in ("heading", "paragraph"):
            text = str(b.get("text") or "").strip()
            if text:
                return text[:80]
    return "Без заголовка"


def load_history(tg_id: int) -> list[dict]:
    path = _history_path(tg_id)
    if not path.exists():
        return []
    try:
        with _lock:
            data = json.loads(path.read_text("utf-8"))
        if isinstance(data, list):
            return data
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("history load failed tg=%s: %s", tg_id, exc)
    return []


def add_history(
    tg_id: int,
    *,
    mode: str,
    target: str,
    message_id: int | None,
    blocks: Any,
) -> dict:
    cleaned, had_media = sanitize_blocks(blocks)
    entry = {
        "id": uuid.uuid4().hex,
        "created_at": int(time.time()),
        "mode": mode,
        "target": str(target),
        "message_id": message_id,
        "title": _derive_title(cleaned),
        "had_media": had_media,
        "blocks": cleaned,
    }

    path = _history_path(tg_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        items: list[dict] = []
        if path.exists():
            try:
                loaded = json.loads(path.read_text("utf-8"))
                if isinstance(loaded, list):
                    items = loaded
            except (OSError, json.JSONDecodeError):
                items = []
        items.insert(0, entry)
        items = items[: settings.HISTORY_MAX_ENTRIES]
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(items, ensure_ascii=False), "utf-8")
        tmp.replace(path)
    return entry


def delete_history_entry(tg_id: int, entry_id: str) -> bool:
    path = _history_path(tg_id)
    if not path.exists():
        return False
    with _lock:
        try:
            items = json.loads(path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return False
        if not isinstance(items, list):
            return False
        new_items = [it for it in items if it.get("id") != entry_id]
        if len(new_items) == len(items):
            return False
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(new_items, ensure_ascii=False), "utf-8")
        tmp.replace(path)
    return True


def _safe_under_uploads(path: Path) -> bool:
    try:
        path.resolve().relative_to(settings.UPLOAD_DIR.resolve())
        return True
    except (ValueError, OSError):
        return False


def delete_uploaded_media(markdown: str, owner_tg_id: int | None = None) -> int:
    """Удаляет локальные файлы из markdown. Только файлы owner_tg_id (защита от IDOR)."""
    removed = 0
    owner = str(owner_tg_id) if owner_tg_id is not None else None
    for match in _UPLOAD_URL_RE.finditer(markdown or ""):
        tg_part, token, name = match.groups()
        if not tg_part.isdigit() or ".." in name or name.startswith("."):
            continue
        if owner is not None and tg_part != owner:
            continue
        target = settings.UPLOAD_DIR / tg_part / token / name
        if not _safe_under_uploads(target):
            continue
        try:
            if target.is_file():
                target.unlink()
                removed += 1
            parent = target.parent
            if parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
        except OSError as exc:
            logger.warning("media delete failed %s: %s", target, exc)
    return removed


def user_upload_bytes(tg_id: int) -> int:
    user_dir = settings.UPLOAD_DIR / str(tg_id)
    if not user_dir.is_dir():
        return 0
    total = 0
    for p in user_dir.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def cleanup_expired_uploads() -> int:
    """Удаляет файлы старше срока хранения. Возвращает число удалённых файлов."""
    base = settings.UPLOAD_DIR
    if not base.is_dir():
        return 0
    cutoff = time.time() - settings.UPLOAD_RETENTION_SEC
    removed = 0
    for p in base.rglob("*"):
        if p.is_file():
            try:
                if p.stat().st_mtime < cutoff:
                    p.unlink()
                    removed += 1
            except OSError:
                pass
    # Убираем пустые директории
    for p in sorted(base.rglob("*"), key=lambda x: len(x.parts), reverse=True):
        if p.is_dir():
            try:
                if not any(p.iterdir()):
                    p.rmdir()
            except OSError:
                pass
    if removed:
        logger.info("cleanup removed %s expired upload(s)", removed)
    return removed
