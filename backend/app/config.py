"""Конфигурация автономного Rich Posts (отдельный бот и домен)."""

import os
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_ROOT / ".env", override=True)


def _parse_admin_ids(raw: str) -> list[int]:
    out: list[int] = []
    for part in (raw or "").split(","):
        part = part.strip()
        if part.isdigit():
            out.append(int(part))
    return out


def _parse_csv(raw: str) -> list[str]:
    return [p.strip() for p in (raw or "").split(",") if p.strip()]


def _default_upload_public_base() -> str:
    explicit = os.getenv("RICH_POSTS_UPLOAD_PUBLIC_BASE", "").strip().rstrip("/")
    if explicit:
        return explicit
    mini = os.getenv("MINIAPP_URL", "").strip().rstrip("/")
    if mini:
        return f"{mini}/uploads"
    return ""


def _default_webhook_url() -> str:
    explicit = os.getenv("WEBHOOK_URL", "").strip()
    if explicit:
        return explicit
    mini = os.getenv("MINIAPP_URL", "").strip().rstrip("/")
    if mini:
        return f"{mini}/api/v1/telegram/webhook"
    return ""


class Settings:
    PROJECT_NAME = os.getenv("RICH_POSTS_PROJECT_NAME", "Rich Posts API")
    VERSION = "1.0.2"
    API_V1_STR = "/api/v1"

    PORT = int(os.getenv("RICH_POSTS_PORT", "8035"))
    DEBUG = os.getenv("RICH_POSTS_DEBUG", "").lower() in ("1", "true", "yes")
    ENABLE_DOCS = os.getenv("RICH_POSTS_ENABLE_DOCS", "").lower() in ("1", "true", "yes")

    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    ADMIN_IDS: list[int] = _parse_admin_ids(os.getenv("ADMIN_IDS", ""))
    RICH_POSTS_DEFAULT_CHANNEL: str = os.getenv("RICH_POSTS_DEFAULT_CHANNEL", "").strip()
    MINIAPP_URL: str = os.getenv("MINIAPP_URL", "").strip()
    WEBHOOK_URL: str = _default_webhook_url()
    WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "").strip()

    # Безопасность
    ALLOWED_ORIGINS: list[str] = _parse_csv(
        os.getenv("ALLOWED_ORIGINS", "http://localhost:5185,http://127.0.0.1:5185")
    )
    TRUSTED_HOSTS: list[str] = _parse_csv(
        os.getenv("TRUSTED_HOSTS", "127.0.0.1,localhost")
    )
    INIT_DATA_MAX_AGE_SEC: int = int(os.getenv("INIT_DATA_MAX_AGE_SEC", str(24 * 60 * 60)))
    INIT_DATA_MAX_LEN: int = int(os.getenv("INIT_DATA_MAX_LEN", "8192"))
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
    RATE_LIMIT_BURST: int = int(os.getenv("RATE_LIMIT_BURST", "20"))
    DRAFT_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("DRAFT_RATE_LIMIT_PER_MINUTE", "12"))
    DRAFT_RATE_BURST: int = int(os.getenv("DRAFT_RATE_BURST", "6"))
    UPLOAD_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("UPLOAD_RATE_LIMIT_PER_MINUTE", "20"))
    UPLOAD_RATE_BURST: int = int(os.getenv("UPLOAD_RATE_BURST", "8"))
    PUBLISH_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("PUBLISH_RATE_LIMIT_PER_MINUTE", "8"))
    PUBLISH_RATE_BURST: int = int(os.getenv("PUBLISH_RATE_BURST", "4"))
    WEBHOOK_MAX_BODY_BYTES: int = int(os.getenv("WEBHOOK_MAX_BODY_BYTES", "65536"))

    # Опционально: whitelist каналов для publish (пусто = любой канал, где user admin)
    PUBLISH_ALLOWED_CHANNELS: list[str] = _parse_csv(
        os.getenv("PUBLISH_ALLOWED_CHANNELS", "")
    )

    UPLOAD_DIR: Path = Path(os.getenv("RICH_POSTS_UPLOAD_DIR", str(_ROOT / "uploads")))
    UPLOAD_MAX_BYTES: int = int(os.getenv("RICH_POSTS_UPLOAD_MAX_BYTES", str(50 * 1024 * 1024)))
    UPLOAD_PUBLIC_BASE: str = _default_upload_public_base()
    # Срок хранения загруженных файлов (сек); по умолчанию 4 часа. Файлы также удаляются после публикации.
    UPLOAD_RETENTION_SEC: int = int(os.getenv("RICH_POSTS_UPLOAD_RETENTION_SEC", str(4 * 60 * 60)))
    # Мягкая квота на пользователя в окне хранения (защита от заполнения диска)
    UPLOAD_USER_QUOTA_BYTES: int = int(os.getenv("RICH_POSTS_UPLOAD_USER_QUOTA_BYTES", str(400 * 1024 * 1024)))
    UPLOAD_CLEANUP_INTERVAL_SEC: int = int(os.getenv("RICH_POSTS_UPLOAD_CLEANUP_INTERVAL_SEC", str(30 * 60)))

    # ffmpeg для конвертации голосовых WebM → OGG (системный или backend/bin/ffmpeg)
    FFMPEG_PATH: str = os.getenv("FFMPEG_PATH", "").strip()

    # Хранилище истории публикаций (без медиафайлов)
    DATA_DIR: Path = Path(os.getenv("RICH_POSTS_DATA_DIR", str(_ROOT / "data")))
    HISTORY_MAX_ENTRIES: int = int(os.getenv("RICH_POSTS_HISTORY_MAX_ENTRIES", "50"))

    @property
    def bot_tokens(self) -> list[str]:
        tokens: list[str] = []
        if self.TELEGRAM_BOT_TOKEN:
            tokens.append(self.TELEGRAM_BOT_TOKEN)
        extra = os.getenv("TELEGRAM_BOT_TOKENS", "").strip()
        if extra:
            tokens.extend(t.strip() for t in extra.split(",") if t.strip())
        return list(dict.fromkeys(tokens))


settings = Settings()
