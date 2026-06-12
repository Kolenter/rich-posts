"""Автономный бэкенд Rich Posts (FastAPI на :8035)."""

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app import storage
from app.config import settings
from app.rich_posts import router as rich_posts_router, warmup_emoji_index
from app.telegram_webhook import configure_bot, router as telegram_webhook_router
from app.admin import router as admin_router
from app.security import ApiRateLimitMiddleware, SecurityHeadersMiddleware

logging.basicConfig(level=logging.INFO)
# httpx логирует полный URL запроса, включая токен бота → не пускаем в системные логи
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logger = logging.getLogger("rich-posts-api")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs" if settings.ENABLE_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_DOCS else None,
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if settings.ENABLE_DOCS else None,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(ApiRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or ["http://localhost:5185", "http://127.0.0.1:5185"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Telegram-Init-Data"],
    max_age=600,
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.TRUSTED_HOSTS or ["127.0.0.1", "localhost"],
)

app.include_router(rich_posts_router)
app.include_router(telegram_webhook_router)
app.include_router(admin_router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error path=%s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})


@app.get("/health")
async def health(request: Request):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1"):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    return {"status": "healthy"}


async def _upload_cleanup_loop():
    while True:
        try:
            await asyncio.to_thread(storage.cleanup_expired_uploads)
        except Exception as exc:  # noqa: BLE001
            logger.warning("upload cleanup loop error: %s", exc)
        await asyncio.sleep(max(60, settings.UPLOAD_CLEANUP_INTERVAL_SEC))


@app.on_event("startup")
async def startup():
    asyncio.create_task(_upload_cleanup_loop())
    asyncio.create_task(warmup_emoji_index())

    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN не задан — draft/send будут недоступны")
    else:
        if not settings.WEBHOOK_SECRET:
            logger.error(
                "WEBHOOK_SECRET не задан — /start через webhook отключён. "
                "Сгенерируйте секрет: python3 -c \"import secrets; print(secrets.token_hex(32))\""
            )
        logger.info(
            "Rich Posts API started port=%s docs=%s origins=%s",
            settings.PORT,
            settings.ENABLE_DOCS,
            settings.ALLOWED_ORIGINS,
        )
        try:
            await configure_bot()
        except Exception as exc:
            logger.warning("Telegram bot setup failed: %s", exc)
