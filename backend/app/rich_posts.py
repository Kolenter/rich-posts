"""Rich Messages — редактор и публикация в канал (отдельный бот)."""

import asyncio
import logging
import re
import secrets
import shutil
import time
import uuid
from pathlib import Path
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import settings
from app.security import audit_log, check_draft_rate_limit, check_publish_rate_limit, check_upload_rate_limit
from app import storage
from app.users import touch_user

logger = logging.getLogger("rich-posts-api")

router = APIRouter(prefix=f"{settings.API_V1_STR}/rich-posts", tags=["rich-posts"])

_FFMPEG_SEM = asyncio.Semaphore(2)

def _resolve_ffmpeg() -> Path | None:
    if settings.FFMPEG_PATH:
        p = Path(settings.FFMPEG_PATH)
        if p.is_file():
            return p
    bundled = Path(__file__).resolve().parents[1] / "bin" / "ffmpeg"
    if bundled.is_file():
        return bundled
    found = shutil.which("ffmpeg")
    return Path(found) if found else None

RICH_TEXT_LIMIT = 32768
_CHANNEL_RE = re.compile(r"^(@[a-zA-Z0-9_]{4,32}|-100\d{6,})$")

_UPLOAD_EXT: dict[str, tuple[str, ...]] = {
    "photo": (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"),
    "video": (".mp4", ".mov", ".m4v"),
    "audio": (".mp3", ".m4a", ".wav"),
    "voice": (".ogg", ".oga", ".opus", ".webm"),
    "animation": (".gif",),
}


def _content_matches_ext(data: bytes, ext: str) -> bool:
    """Проверка реального содержимого файла по сигнатуре (magic bytes)."""
    if len(data) < 12:
        return False
    head = data[:16]
    if ext in (".jpg", ".jpeg"):
        return head.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".gif":
        return head[:6] in (b"GIF87a", b"GIF89a")
    if ext == ".webp":
        return head[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if ext == ".wav":
        return head[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if ext in (".ogg", ".oga", ".opus"):
        return head[:4] == b"OggS"
    if ext == ".webm":
        return head[:4] == b"\x1aE\xdf\xa3"
    if ext == ".mp3":
        return head[:3] == b"ID3" or (head[0] == 0xFF and (head[1] & 0xE0) == 0xE0)
    if ext in (".heic", ".heif"):
        return _ftyp_brand(data) in _HEIC_BRANDS
    if ext in (".mp4", ".mov", ".m4v", ".m4a"):
        return _ftyp_brand(data) in _VIDEO_AUDIO_FTYP_BRANDS
    return False


_HEIC_BRANDS = frozenset({b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"heif"})
_VIDEO_AUDIO_FTYP_BRANDS = frozenset(
    {b"mp42", b"isom", b"iso2", b"avc1", b"qt  ", b"3gp4", b"mp41", b"M4V ", b"M4A "}
)


def _ftyp_brand(data: bytes) -> bytes:
    if len(data) < 12:
        return b""
    if data[4:8] != b"ftyp":
        return b""
    return data[8:12]


def _sniff_ext(data: bytes) -> str | None:
    """Определяет реальный формат по содержимому (не по имени файла)."""
    if len(data) < 12:
        return None
    head = data[:16]
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if head[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if head[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return ".wav"
    if head[:4] == b"OggS":
        return ".ogg"
    if head[:4] == b"\x1aE\xdf\xa3":
        return ".webm"
    if head[:3] == b"ID3" or (head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return ".mp3"
    brand = _ftyp_brand(data)
    if brand in _HEIC_BRANDS:
        return ".heic"
    if brand in _VIDEO_AUDIO_FTYP_BRANDS:
        return ".mp4"
    return None


def _kind_for_ext(ext: str) -> str:
    for kind, exts in _UPLOAD_EXT.items():
        if ext in exts:
            return kind
    raise HTTPException(status_code=400, detail="Неподдерживаемый тип файла")


def _resolve_upload_kind_ext(data: bytes, filename: str, content_type: str | None) -> tuple[str, str]:
    """Сначала смотрим magic bytes — галерея телефона часто шлёт HEIC без расширения .jpg."""
    sniffed = _sniff_ext(data)
    if sniffed:
        return _kind_for_ext(sniffed), sniffed
    kind = _detect_media_kind(filename, content_type)
    ext = _safe_upload_ext(filename, kind)
    if _content_matches_ext(data, ext):
        return kind, ext
    raise HTTPException(
        status_code=400,
        detail="Не удалось распознать файл. Поддерживаются JPG, PNG, WebP, HEIC, GIF, MP4, MP3, OGG.",
    )


class RichPostMeta(BaseModel):
    text_limit: int = RICH_TEXT_LIMIT
    block_limit: int = 500
    nesting_limit: int = 16
    media_limit: int = 50
    table_columns_limit: int = 20
    default_channel: str = ""
    bot_username: str = ""


class RichPostSendRequest(BaseModel):
    markdown: str = Field(..., min_length=1, max_length=RICH_TEXT_LIMIT)
    mode: Literal["preview", "publish"] = "preview"
    chat_id: Optional[str] = Field(None, max_length=128)
    message_thread_id: Optional[int] = Field(None, ge=1, le=2_147_483_647)
    # Блоки редактора для сохранения в историю (медиа-ссылки очищаются на сервере)
    blocks: Optional[list[dict]] = Field(None, max_length=600)
    reply_markup: Optional[dict] = None


class RichPostSendResponse(BaseModel):
    ok: bool
    message_id: int
    chat_id: str | int
    blocks_count: int
    mode: str


def _bot_token() -> str:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise HTTPException(status_code=503, detail="Сервис временно недоступен")
    return token


def _normalize_chat_id(raw: str) -> str | int:
    value = raw.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Не указан канал")
    if value.lstrip("-").isdigit():
        num = int(value)
        if num >= 0:
            raise HTTPException(status_code=400, detail="Некорректный id канала")
        return num
    channel = value if value.startswith("@") else f"@{value.lstrip('@')}"
    if not _CHANNEL_RE.match(channel):
        raise HTTPException(status_code=400, detail="Некорректный формат канала")
    return channel


def _safe_telegram_error(description: str) -> str:
    text = (description or "").lower()
    if "chat not found" in text:
        return "Канал не найден. Проверьте @username и права бота."
    if "not enough rights" in text or "need administrator" in text:
        return "У бота нет прав публиковать в этот канал."
    if "message is too long" in text or "too long" in text:
        return "Текст превышает лимит Telegram."
    if "wrong file identifier" in text or "failed to get http url content" in text:
        return "Некорректная ссылка на медиа в посте."
    if "rich_message_video_no_media_found" in text:
        return "Telegram не смог прочитать медиа как видео. Для голосовых используйте блок «Голосовое», не «Видео»."
    if "rich_message_photo_no_media_found" in text:
        return "Telegram не смог прочитать фото. Проверьте тип медиа (для голосового — «Голосовое», не «Фото»)."
    if "rich_message_audio_no_media_found" in text:
        return "Telegram не принимает это аудио. Голосовые записываются и конвертируются в OGG автоматически — попробуйте записать заново."
    if "can't initiate" in text or "have not started" in text or "bot was blocked" in text:
        return "Сначала откройте бота и нажмите /start, затем повторите."
    return "Не удалось выполнить запрос в Telegram"


async def _telegram_post(token: str, method: str, payload: dict) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(url, json=payload)
        data = r.json()
    if not data.get("ok"):
        desc = data.get("description", "Telegram API error")
        logger.warning("Telegram %s failed: %s", method, desc)
        raise HTTPException(status_code=502, detail=_safe_telegram_error(desc))
    return data["result"]


def _normalize_channel_acl(raw: str | int) -> str:
    s = str(raw).strip()
    if s.lstrip("-").isdigit():
        return s
    return s if s.startswith("@") else f"@{s.lstrip('@')}"


def _channel_allowed_by_whitelist(target_chat: str | int) -> bool:
    if not settings.PUBLISH_ALLOWED_CHANNELS:
        return True
    target = _normalize_channel_acl(target_chat)
    allowed = {_normalize_channel_acl(c) for c in settings.PUBLISH_ALLOWED_CHANNELS}
    return target in allowed


async def _require_can_publish_to_channel(user_tg_id: int, target_chat: str | int) -> None:
    """Публиковать может только админ/владелец канала (защита от спама в чужие каналы бота)."""
    if not _channel_allowed_by_whitelist(target_chat):
        raise HTTPException(status_code=403, detail="Публикация в этот канал запрещена.")

    try:
        member = await _telegram_post(
            _bot_token(),
            "getChatMember",
            {"chat_id": target_chat, "user_id": user_tg_id},
        )
    except HTTPException as exc:
        if exc.status_code == 502:
            raise HTTPException(
                status_code=403,
                detail="Нет доступа к каналу. Добавьте бота админом и проверьте @username.",
            ) from exc
        raise
    status = member.get("status")
    if status == "creator":
        return
    if status == "administrator":
        if member.get("can_post_messages") is False:
            raise HTTPException(status_code=403, detail="У вас нет прав публиковать в этот канал.")
        return
    raise HTTPException(
        status_code=403,
        detail="Публиковать могут только администраторы канала.",
    )


@router.get("/meta", response_model=RichPostMeta)
async def rich_posts_meta(user: dict = Depends(get_current_user)):
    touch_user(
        int(user["tg_id"]),
        profile={
            "username": user.get("username"),
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "language_code": user.get("language_code"),
        },
        event="app",
    )
    bot_username = ""
    try:
        me = await _telegram_post(_bot_token(), "getMe", {})
        bot_username = me.get("username") or bot_username
    except HTTPException:
        pass
    return RichPostMeta(
        default_channel=settings.RICH_POSTS_DEFAULT_CHANNEL.strip(),
        bot_username=bot_username,
    )


class RichPostDraftRequest(BaseModel):
    markdown: str = Field(..., min_length=1, max_length=RICH_TEXT_LIMIT)
    draft_id: int = Field(1, ge=1, le=999999)
    reply_markup: Optional[dict] = None


class RichPostDraftResponse(BaseModel):
    ok: bool
    message_id: int
    chat_id: int
    blocks_count: int = 0
    blocks: list[dict] = Field(default_factory=list)


class RichPostUploadResponse(BaseModel):
    ok: bool
    url: str
    kind: Literal["photo", "video", "audio", "voice", "animation"]
    filename: str
    size: int


def _detect_media_kind(filename: str, content_type: str | None) -> str:
    ext = Path(filename).suffix.lower()
    for kind, exts in _UPLOAD_EXT.items():
        if ext in exts:
            return kind
    ct = (content_type or "").lower()
    if ct.startswith("image/gif"):
        return "animation"
    if ct.startswith("image/"):
        return "photo"
    if ct.startswith("video/"):
        return "video"
    if "webm" in ct and "audio" in ct:
        return "voice"
    if "ogg" in ct or "opus" in ct:
        return "voice"
    if ct.startswith("audio/"):
        return "audio"
    raise HTTPException(status_code=400, detail="Неподдерживаемый тип файла")


def _safe_upload_ext(filename: str, kind: str) -> str:
    ext = Path(filename).suffix.lower()
    allowed = _UPLOAD_EXT.get(kind, ())
    if ext in allowed:
        return ext
    return allowed[0] if allowed else ".bin"


def _convert_voice_webm_to_ogg(data: bytes, work_dir: Path) -> bytes:
    """Telegram Rich Message принимает голосовые как OGG/Opus, не WebM."""
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        raise HTTPException(
            status_code=503,
            detail="Конвертация голосовых недоступна. Установите ffmpeg или загрузите OGG.",
        )
    import subprocess

    src = work_dir / "_voice_in.webm"
    dst = work_dir / "_voice_out.ogg"
    work_dir.mkdir(parents=True, exist_ok=True)
    src.write_bytes(data)
    try:
        proc = subprocess.run(
            [
                str(ffmpeg),
                "-y",
                "-i",
                str(src),
                "-c:a",
                "libopus",
                "-b:a",
                "64k",
                str(dst),
            ],
            capture_output=True,
            timeout=120,
            check=False,
        )
        if proc.returncode != 0 or not dst.is_file():
            err = (proc.stderr or b"")[-400:].decode("utf-8", "replace")
            logger.warning("ffmpeg voice convert failed: %s", err)
            raise HTTPException(
                status_code=400,
                detail="Не удалось подготовить голосовое для Telegram. Запишите ещё раз.",
            )
        return dst.read_bytes()
    finally:
        src.unlink(missing_ok=True)
        dst.unlink(missing_ok=True)


def _convert_heic_to_jpeg(data: bytes, work_dir: Path) -> bytes:
    """iPhone/Android часто отдают HEIC — Telegram Rich Message ожидает JPEG/PNG."""
    import io

    try:
        import pillow_heif
        from PIL import Image

        pillow_heif.register_heif_opener()
        img = Image.open(io.BytesIO(data))
        if img.mode not in ("RGB",):
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=90, optimize=True)
        return out.getvalue()
    except Exception as exc:
        logger.warning("pillow HEIC convert failed: %s", exc)

    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        raise HTTPException(
            status_code=400,
            detail="Не удалось конвертировать HEIC. Сохраните фото как JPG/PNG или вставьте URL.",
        )
    import subprocess

    src = work_dir / "_photo_in.heic"
    dst = work_dir / "_photo_out.jpg"
    work_dir.mkdir(parents=True, exist_ok=True)
    src.write_bytes(data)
    try:
        proc = subprocess.run(
            [str(ffmpeg), "-y", "-i", str(src), "-q:v", "2", str(dst)],
            capture_output=True,
            timeout=120,
            check=False,
        )
        if proc.returncode != 0 or not dst.is_file():
            err = (proc.stderr or b"")[-400:].decode("utf-8", "replace")
            logger.warning("ffmpeg heic convert failed: %s", err)
            raise HTTPException(
                status_code=400,
                detail="Не удалось конвертировать HEIC. Сохраните фото как JPG и попробуйте снова.",
            )
        return dst.read_bytes()
    finally:
        src.unlink(missing_ok=True)
        dst.unlink(missing_ok=True)


@router.post("/upload", response_model=RichPostUploadResponse)
async def rich_posts_upload(
    request: Request,
    user: dict = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """Загрузка медиа с телефона → публичный HTTPS URL для Rich Message markdown."""
    tg_id = int(user["tg_id"])
    check_upload_rate_limit(tg_id)
    touch_user(
        tg_id,
        profile={
            "username": user.get("username"),
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "language_code": user.get("language_code"),
        },
        event="upload",
    )

    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")

    safe_name = Path(file.filename).name
    if safe_name != file.filename or ".." in safe_name or safe_name.startswith("."):
        raise HTTPException(status_code=400, detail="Некорректное имя файла")

    data = await file.read(settings.UPLOAD_MAX_BYTES + 1)
    size = len(data)
    if size <= 0:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if size > settings.UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 50 МБ)")

    kind, ext = _resolve_upload_kind_ext(data, safe_name, file.content_type)

    if storage.user_upload_bytes(tg_id) + size > settings.UPLOAD_USER_QUOTA_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Превышена квота загрузок. Опубликуйте пост или подождите очистки.",
        )

    token = secrets.token_urlsafe(12)
    user_dir = settings.UPLOAD_DIR / str(tg_id) / token
    user_dir.mkdir(parents=True, exist_ok=True)

    if kind == "photo" and ext in (".heic", ".heif"):
        async with _FFMPEG_SEM:
            data = await asyncio.to_thread(_convert_heic_to_jpeg, data, user_dir)
        ext = ".jpg"
        kind = "photo"
        size = len(data)

    if kind == "voice" and ext == ".webm":
        async with _FFMPEG_SEM:
            data = await asyncio.to_thread(_convert_voice_webm_to_ogg, data, user_dir)
        ext = ".ogg"
        size = len(data)

    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = user_dir / stored_name
    dest.write_bytes(data)

    public_url = f"{settings.UPLOAD_PUBLIC_BASE}/{tg_id}/{token}/{stored_name}"
    audit_log("upload", tg_id, request, kind=kind, size=size, name=stored_name)
    return RichPostUploadResponse(ok=True, url=public_url, kind=kind, filename=stored_name, size=size)


_BUTTON_STYLES = {"primary", "success", "danger"}
_BUTTON_ROWS_LIMIT = 10
_BUTTONS_PER_ROW_LIMIT = 8
_BUTTON_TEXT_LIMIT = 64
_BUTTON_URL_LIMIT = 2048


def _sanitize_reply_markup(raw: Optional[dict]) -> Optional[dict]:
    """Безопасная inline-клавиатура: только URL-кнопки, стиль и icon_custom_emoji_id."""
    if not raw or not isinstance(raw, dict):
        return None
    rows = raw.get("inline_keyboard")
    if not isinstance(rows, list) or not rows:
        return None
    if len(rows) > _BUTTON_ROWS_LIMIT:
        raise HTTPException(status_code=400, detail="Слишком много рядов кнопок")

    keyboard: list[list[dict]] = []
    for row in rows:
        if not isinstance(row, list):
            continue
        if len(row) > _BUTTONS_PER_ROW_LIMIT:
            raise HTTPException(status_code=400, detail="Слишком много кнопок в ряду")
        clean_row: list[dict] = []
        for btn in row:
            if not isinstance(btn, dict):
                continue
            text = str(btn.get("text", "")).strip()
            url = str(btn.get("url", "")).strip()
            if not text or not url:
                continue
            if len(text) > _BUTTON_TEXT_LIMIT:
                raise HTTPException(status_code=400, detail="Текст кнопки слишком длинный")
            if len(url) > _BUTTON_URL_LIMIT or not re.match(r"^(https?://|tg://)", url, re.IGNORECASE):
                raise HTTPException(status_code=400, detail="Некорректная ссылка кнопки")
            out: dict = {"text": text, "url": url}
            style = btn.get("style")
            if style in _BUTTON_STYLES:
                out["style"] = style
            emoji_id = str(btn.get("icon_custom_emoji_id", "")).strip()
            if emoji_id.isdigit():
                out["icon_custom_emoji_id"] = emoji_id
            clean_row.append(out)
        if clean_row:
            keyboard.append(clean_row)

    return {"inline_keyboard": keyboard} if keyboard else None


_MATH_FENCE_RE = re.compile(r"```\s*math\b", re.IGNORECASE)
_INLINE_MATH_RE = re.compile(r"\$[^\$\n]+?\$")
_DETAILS_BLOCK_RE = re.compile(r"<details[^>]*>([\s\S]*?)</details>", re.IGNORECASE)


def _markdown_has_math_inside_details(markdown: str) -> bool:
    """Telegram Desktop crash: math inside <details> — tdesktop#30808."""
    for match in _DETAILS_BLOCK_RE.finditer(markdown):
        inner = match.group(1)
        if _MATH_FENCE_RE.search(inner) or _INLINE_MATH_RE.search(inner):
            return True
    return False


def _validate_markdown(markdown: str) -> str:
    text = markdown.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Пустой текст поста")
    if len(text.encode("utf-8")) > RICH_TEXT_LIMIT:
        raise HTTPException(status_code=400, detail="Превышен лимит Rich Message")
    if _markdown_has_math_inside_details(text):
        raise HTTPException(
            status_code=400,
            detail=(
                "Формулы внутри «Скрытый блок» крашат Telegram Desktop. "
                "Вынесите формулы отдельным блоком «Формула»."
            ),
        )
    return text


# Последнее превью в личке (tg_id → message_id), чтобы не спамить новыми сообщениями
_preview_message_ids: dict[int, int] = {}


@router.post("/draft", response_model=RichPostDraftResponse)
async def rich_posts_draft(
    request: Request,
    body: RichPostDraftRequest,
    user: dict = Depends(get_current_user),
):
    """Реальный Rich Message в личку (не sendRichMessageDraft — тот живёт секунды и «печатает»)."""
    markdown = _validate_markdown(body.markdown)
    chat_id = int(user["tg_id"])
    check_draft_rate_limit(chat_id)
    touch_user(
        chat_id,
        profile={
            "username": user.get("username"),
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "language_code": user.get("language_code"),
        },
        event="preview",
    )
    token = _bot_token()

    prev_id = _preview_message_ids.get(chat_id)
    if prev_id:
        try:
            await _telegram_post(
                token,
                "deleteMessage",
                {"chat_id": chat_id, "message_id": prev_id},
            )
        except HTTPException:
            pass

    draft_payload: dict = {
        "chat_id": chat_id,
        "rich_message": {"markdown": markdown},
    }
    reply_markup = _sanitize_reply_markup(body.reply_markup)
    if reply_markup:
        draft_payload["reply_markup"] = reply_markup

    result = await _telegram_post(token, "sendRichMessage", draft_payload)
    message_id = int(result["message_id"])
    blocks = (result.get("rich_message") or {}).get("blocks") or []
    _preview_message_ids[chat_id] = message_id

    audit_log("preview", chat_id, request, chars=len(markdown), msg_id=message_id)
    return RichPostDraftResponse(
        ok=True,
        message_id=message_id,
        chat_id=chat_id,
        blocks_count=len(blocks),
        blocks=blocks,
    )


@router.post("/send", response_model=RichPostSendResponse)
async def rich_posts_send(
    request: Request,
    body: RichPostSendRequest,
    user: dict = Depends(get_current_user),
):
    markdown = _validate_markdown(body.markdown)
    user_id = int(user["tg_id"])
    if body.mode == "preview":
        target_chat = user_id
        check_draft_rate_limit(user_id)
        touch_user(
            user_id,
            profile={
                "username": user.get("username"),
                "first_name": user.get("first_name"),
                "last_name": user.get("last_name"),
                "language_code": user.get("language_code"),
            },
            event="preview",
        )
    else:
        check_publish_rate_limit(user_id)
        touch_user(
            user_id,
            profile={
                "username": user.get("username"),
                "first_name": user.get("first_name"),
                "last_name": user.get("last_name"),
                "language_code": user.get("language_code"),
            },
            event="publish",
        )
        channel = (body.chat_id or settings.RICH_POSTS_DEFAULT_CHANNEL or "").strip()
        target_chat = _normalize_chat_id(channel)
        await _require_can_publish_to_channel(int(user["tg_id"]), target_chat)

    payload: dict = {
        "chat_id": target_chat,
        "rich_message": {"markdown": markdown},
    }
    if body.message_thread_id:
        payload["message_thread_id"] = body.message_thread_id
    reply_markup = _sanitize_reply_markup(body.reply_markup)
    if reply_markup:
        payload["reply_markup"] = reply_markup

    token = _bot_token()
    result = await _telegram_post(token, "sendRichMessage", payload)
    blocks = (result.get("rich_message") or {}).get("blocks") or []
    message_id = int(result["message_id"])

    if body.mode == "publish":
        # Telegram уже скачал медиа к моменту ответа — сохраняем историю (без файлов) и чистим файлы
        try:
            storage.add_history(
                int(user["tg_id"]),
                mode=body.mode,
                target=str(target_chat),
                message_id=message_id,
                blocks=body.blocks or [],
            )
        except Exception as exc:  # noqa: BLE001 — история не должна ломать публикацию
            logger.warning("history save failed: %s", exc)
        try:
            storage.delete_uploaded_media(markdown, owner_tg_id=int(user["tg_id"]))
        except Exception as exc:  # noqa: BLE001
            logger.warning("media cleanup failed: %s", exc)

    audit_log(
        "send",
        int(user["tg_id"]),
        request,
        mode=body.mode,
        target=target_chat,
        msg_id=message_id,
    )

    return RichPostSendResponse(
        ok=True,
        message_id=message_id,
        chat_id=target_chat,
        blocks_count=len(blocks),
        mode=body.mode,
    )


class HistoryItem(BaseModel):
    id: str
    created_at: int
    mode: str
    target: str
    message_id: int | None = None
    title: str
    had_media: bool = False
    blocks: list[dict] = Field(default_factory=list)


class HistoryListResponse(BaseModel):
    items: list[HistoryItem]


@router.get("/history", response_model=HistoryListResponse)
async def rich_posts_history(user: dict = Depends(get_current_user)):
    items = storage.load_history(int(user["tg_id"]))
    return HistoryListResponse(items=[HistoryItem(**it) for it in items if isinstance(it, dict)])


@router.delete("/history/{entry_id}")
async def rich_posts_history_delete(
    entry_id: str,
    user: dict = Depends(get_current_user),
):
    if not re.fullmatch(r"[a-f0-9]{32}", entry_id):
        raise HTTPException(status_code=400, detail="Некорректный id")
    ok = storage.delete_history_entry(int(user["tg_id"]), entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return {"ok": True}


# --- Custom emoji suggestions -------------------------------------------------
# Публичные наборы custom emoji Telegram (Bot API не отдаёт «все эмодзи пользователя»).
_EMOJI_SET_NAMES = (
    "StaticEmoji",
    "AnimatedEmoji",
    "RestrictedEmoji",
    "AIActions",
    "StatusEmoji",
    "DuckEmoji",
    "PepeEmoji",
)
_EMOJI_CACHE_TTL = 6 * 3600
_EMOJI_SUGGEST_LIMIT = 100

_emoji_index: dict[str, list[dict]] = {}
_emoji_flat: list[dict] = []
_emoji_popular: list[dict] = []
_emoji_built_at: float = 0.0
_emoji_lock = asyncio.Lock()


def _norm_emoji(e: str) -> str:
    """Ключ эмодзи: без FE0F и ZWJ (единый формат для поиска)."""
    if not e:
        return ""
    return e.replace("\ufe0f", "").replace("\u200d", "").strip()


def _strip_skin_tone(key: str) -> str:
    return re.sub(r"[\U0001f3fb-\U0001f3ff]", "", key)


def _extract_search_key(raw: str) -> str:
    """Первый emoji-символ из ввода."""
    s = raw.strip()
    if not s:
        return ""
    buf: list[str] = []
    for ch in s:
        if ch in " \t\n\r":
            break
        o = ord(ch)
        is_emoji = (
            o >= 0x1F300
            or 0x2600 <= o <= 0x27BF
            or 0x2300 <= o <= 0x23FF
            or 0x1F1E6 <= o <= 0x1F1FF
            or 0x1F3FB <= o <= 0x1F3FF
            or ch in "©®™⭐✅❤"
        )
        if is_emoji or (buf and 0x1F3FB <= o <= 0x1F3FF):
            buf.append(ch)
        elif buf:
            break
    return _norm_emoji("".join(buf) if buf else s[:8])


def _add_emoji_sticker(sticker: dict, set_name: str) -> None:
    cid = sticker.get("custom_emoji_id")
    base = _norm_emoji(sticker.get("emoji") or "")
    if not cid or not base:
        return
    item = {
        "id": str(cid),
        "emoji": base,
        "animated": bool(sticker.get("is_animated") or sticker.get("is_video")),
        "set_name": set_name,
    }
    _emoji_index.setdefault(base, [])
    if all(x["id"] != item["id"] for x in _emoji_index[base]):
        _emoji_index[base].append(item)


async def _build_emoji_index(token: str) -> None:
    global _emoji_built_at, _emoji_popular, _emoji_flat
    _emoji_index.clear()
    _emoji_flat = []
    popular: list[dict] = []

    try:
        icons = await _telegram_post(token, "getForumTopicIconStickers", {})
        for s in icons if isinstance(icons, list) else []:
            _add_emoji_sticker(s, "Topics")
    except HTTPException:
        pass

    for name in _EMOJI_SET_NAMES:
        try:
            st = await _telegram_post(token, "getStickerSet", {"name": name})
        except HTTPException:
            continue
        if (st.get("sticker_type") or "") != "custom_emoji":
            continue
        for s in st.get("stickers", []):
            _add_emoji_sticker(s, name)

    flat: list[dict] = []
    for base in sorted(_emoji_index.keys()):
        for item in _emoji_index[base]:
            flat.append(item)
    _emoji_flat = flat

    for base in sorted(_emoji_index.keys()):
        items = _emoji_index[base]
        pick = next((i for i in items if i.get("animated")), items[0])
        popular.append(pick)
        if len(popular) >= 80:
            break
    _emoji_popular = popular
    _emoji_built_at = time.monotonic()


async def _ensure_emoji_index() -> None:
    if _emoji_index and (time.monotonic() - _emoji_built_at) < _EMOJI_CACHE_TTL:
        return
    async with _emoji_lock:
        if _emoji_index and (time.monotonic() - _emoji_built_at) < _EMOJI_CACHE_TTL:
            return
        await _build_emoji_index(_bot_token())


async def warmup_emoji_index() -> None:
    """Прогрев индекса эмодзи при старте, чтобы первый запрос не ждал."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    try:
        await _ensure_emoji_index()
        logger.info(
            "emoji index ready: %d bases, %d stickers",
            len(_emoji_index),
            len(_emoji_flat),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("emoji index warmup failed: %s", exc)


class EmojiSuggestion(BaseModel):
    id: str
    emoji: str
    animated: bool
    set_name: str


class EmojiSuggestResponse(BaseModel):
    items: list[EmojiSuggestion]
    total: int = 0
    has_more: bool = False
    fallback: bool = False
    query_key: str = ""


@router.get("/emoji-suggest", response_model=EmojiSuggestResponse)
async def rich_posts_emoji_suggest(
    emoji: str = "",
    offset: int = 0,
    limit: int = 60,
    _user: dict = Depends(get_current_user),
):
    """Custom emoji: по символу или листание всего каталога (offset/limit)."""
    await _ensure_emoji_index()
    page_size = min(max(limit, 1), _EMOJI_SUGGEST_LIMIT)
    start = max(offset, 0)

    key = _extract_search_key(emoji)
    fallback = False
    pool: list[dict]

    if key:
        pool = _emoji_index.get(key, [])
        if not pool:
            pool = _emoji_index.get(_strip_skin_tone(key), [])
            fallback = bool(pool)
        if not pool:
            # редкий символ — показываем общий каталог, а не пустоту
            pool = _emoji_flat
            fallback = True
    else:
        pool = _emoji_flat

    total = len(pool)
    page = pool[start : start + page_size]
    return EmojiSuggestResponse(
        items=[EmojiSuggestion(**it) for it in page],
        total=total,
        has_more=start + len(page) < total,
        fallback=fallback,
        query_key=key,
    )


_EMOJI_ID_RE = re.compile(r"^\d{5,25}$")
_emoji_file_meta: dict[str, dict] = {}


def _emoji_cache_dir() -> Path:
    d = settings.DATA_DIR / "emoji-cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _download_telegram_file(file_path: str) -> bytes:
    token = _bot_token()
    url = f"https://api.telegram.org/file/bot{token}/{file_path}"
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


async def _emoji_sticker_meta(emoji_id: str) -> dict:
    if emoji_id in _emoji_file_meta:
        return _emoji_file_meta[emoji_id]
    result = await _telegram_post(
        _bot_token(),
        "getCustomEmojiStickers",
        {"custom_emoji_ids": [emoji_id]},
    )
    if not isinstance(result, list) or not result:
        raise HTTPException(status_code=404, detail="Эмодзи не найден")
    sticker = result[0]
    thumb = sticker.get("thumbnail") or sticker.get("thumb") or {}
    thumb_id = thumb.get("file_id")
    sticker_id = sticker.get("file_id")
    if not thumb_id or not sticker_id:
        raise HTTPException(status_code=404, detail="Нет файла превью")

    thumb_path = (await _telegram_post(_bot_token(), "getFile", {"file_id": thumb_id}))["file_path"]
    sticker_path = (await _telegram_post(_bot_token(), "getFile", {"file_id": sticker_id}))["file_path"]
    meta = {
        "thumb_path": thumb_path,
        "sticker_path": sticker_path,
        "animated": bool(sticker.get("is_animated") or sticker.get("is_video")),
        "mime_thumb": "image/webp",
        "mime_sticker": "application/x-tgsticker" if sticker.get("is_animated") else "video/webm",
    }
    _emoji_file_meta[emoji_id] = meta
    return meta


async def _emoji_cached_file(emoji_id: str, kind: Literal["thumb", "sticker"]) -> Path:
    cache = _emoji_cache_dir()
    meta = await _emoji_sticker_meta(emoji_id)
    ext = ".webp" if kind == "thumb" else Path(meta["sticker_path"]).suffix or ".tgs"
    dest = cache / f"{emoji_id}-{kind}{ext}"
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    remote = meta["thumb_path"] if kind == "thumb" else meta["sticker_path"]
    data = await _download_telegram_file(remote)
    dest.write_bytes(data)
    return dest


@router.get("/emoji-preview/{emoji_id}")
async def rich_posts_emoji_preview(
    emoji_id: str,
    _user: dict = Depends(get_current_user),
):
    """WebP-миниатюра custom emoji для превью в редакторе."""
    if not _EMOJI_ID_RE.match(emoji_id):
        raise HTTPException(status_code=400, detail="Некорректный id")
    path = await _emoji_cached_file(emoji_id, "thumb")
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/emoji-sticker/{emoji_id}")
async def rich_posts_emoji_sticker(
    emoji_id: str,
    _user: dict = Depends(get_current_user),
):
    """Файл анимированного custom emoji (.tgs) для Lottie-превью в редакторе."""
    if not _EMOJI_ID_RE.match(emoji_id):
        raise HTTPException(status_code=400, detail="Некорректный id")
    meta = await _emoji_sticker_meta(emoji_id)
    if not meta.get("animated"):
        raise HTTPException(status_code=404, detail="Эмодзи не анимированный")
    path = await _emoji_cached_file(emoji_id, "sticker")
    return FileResponse(path, media_type="application/x-tgsticker", headers={"Cache-Control": "public, max-age=86400"})
