"""Middleware: rate limit, security headers, audit."""

import ipaddress
import logging
import time
from collections import defaultdict
from typing import Callable

from fastapi import HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import settings

logger = logging.getLogger("rich-posts-security")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), payment=()",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cache-Control": "no-store",
}

# Telegram Bot API webhook source ranges (https://core.telegram.org/bots/webhooks)
_TELEGRAM_WEBHOOK_NETS = (
    ipaddress.ip_network("149.154.160.0/20"),
    ipaddress.ip_network("91.108.4.0/22"),
)


class _IpRateLimiter:
    """In-memory лимит запросов (скользящее окно 60 с)."""

    def __init__(self, max_per_minute: int, burst: int) -> None:
        self.max_per_minute = max(1, max_per_minute)
        self.burst = max(1, burst)
        self._hits: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str) -> bool:
        now = time.time()
        window = 60.0
        hits = [t for t in self._hits[key] if now - t < window]
        if len(hits) >= self.max_per_minute + self.burst:
            self._hits[key] = hits
            return False
        hits.append(now)
        self._hits[key] = hits
        return True


_api_limiter = _IpRateLimiter(settings.RATE_LIMIT_PER_MINUTE, settings.RATE_LIMIT_BURST)
_draft_limiter = _IpRateLimiter(settings.DRAFT_RATE_LIMIT_PER_MINUTE, settings.DRAFT_RATE_BURST)
_upload_limiter = _IpRateLimiter(settings.UPLOAD_RATE_LIMIT_PER_MINUTE, settings.UPLOAD_RATE_BURST)
_publish_limiter = _IpRateLimiter(settings.PUBLISH_RATE_LIMIT_PER_MINUTE, settings.PUBLISH_RATE_BURST)


def _is_telegram_webhook_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in _TELEGRAM_WEBHOOK_NETS)


def check_draft_rate_limit(tg_id: int) -> None:
    if not _draft_limiter.allow(f"draft:{tg_id}"):
        logger.warning("rate_limit draft user=%s", tg_id)
        raise HTTPException(status_code=429, detail="Слишком много превью. Подождите минуту.")


def check_upload_rate_limit(tg_id: int) -> None:
    if not _upload_limiter.allow(f"upload:{tg_id}"):
        logger.warning("rate_limit upload user=%s", tg_id)
        raise HTTPException(status_code=429, detail="Слишком много загрузок. Подождите минуту.")


def check_publish_rate_limit(tg_id: int) -> None:
    if not _publish_limiter.allow(f"publish:{tg_id}"):
        logger.warning("rate_limit publish user=%s", tg_id)
        raise HTTPException(status_code=429, detail="Слишком много публикаций. Подождите минуту.")


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            if name not in response.headers:
                response.headers[name] = value
        return response


class ApiRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)

        # Webhook Telegram — без IP rate limit (иначе /start может ломаться)
        if path.startswith(f"{settings.API_V1_STR}/telegram/webhook"):
            return await call_next(request)

        ip = client_ip(request)
        if _is_telegram_webhook_ip(ip) and path.startswith(f"{settings.API_V1_STR}/telegram/"):
            return await call_next(request)

        if not _api_limiter.allow(ip):
            logger.warning("rate_limit ip=%s path=%s", ip, path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Слишком много запросов. Попробуйте позже."},
            )
        return await call_next(request)


def audit_log(action: str, admin_id: int | None, request: Request, **extra: object) -> None:
    parts = [f"action={action}", f"admin={admin_id}", f"ip={client_ip(request)}"]
    for k, v in extra.items():
        parts.append(f"{k}={v}")
    logger.info("rich-posts %s", " ".join(parts))
