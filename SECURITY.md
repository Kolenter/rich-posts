# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅        |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Send details to the repository maintainer via GitHub Security Advisories or private contact. Include:

- Description of the issue and impact
- Steps to reproduce
- Affected endpoints or components
- Suggested fix (if any)

We aim to respond within 72 hours.

## Threat Model

Rich Posts is a **self-hosted Telegram Mini App**. Trust boundaries:

1. **Telegram client** — provides signed `initData` via WebApp SDK
2. **Frontend** — runs inside Telegram; blocked in regular browsers
3. **Backend API** — validates initData, proxies to Telegram Bot API
4. **nginx** — TLS termination, rate limits, static files, upload proxy
5. **Telegram Bot API** — publishes Rich Messages

The backend never stores bot tokens in client code. Tokens live only in server `.env`.

## Authentication

All `/api/v1/rich-posts/*` endpoints require the header:

```
X-Telegram-Init-Data: <signed initData from Telegram.WebApp.initData>
```

Validation ([backend/app/auth.py](backend/app/auth.py)):

- HMAC-SHA256 with key derived from bot token (`WebAppData`)
- `auth_date` freshness check (`INIT_DATA_MAX_AGE_SEC`, default 24h)
- Maximum initData length (`INIT_DATA_MAX_LEN`, default 8192)
- User `id` must be a positive integer

Failed validation returns `401 Unauthorized`.

## Authorization

Currently any authenticated Telegram user can:

- Upload media (within quota)
- Send preview to themselves
- Publish to a channel **only if they are an administrator or owner** of that channel

The bot must also be an administrator of the target channel with permission to post messages.

`ADMIN_IDS` is reserved for future admin-only features.

## Rate Limiting

**nginx** ([nginx/rich-posts-limits.conf](nginx/rich-posts-limits.conf)):

- Rate and connection limits per IP (values in config file)

**Application** ([backend/app/security.py](backend/app/security.py)):

- Per-IP and per-user rate limiting on API routes
- Separate limits for preview, upload, and publish actions
- Limits configurable via environment variables (see `.env.example`)

## Channel Publishing

Before `sendRichMessage` with `mode=publish`, the backend verifies channel permissions via Telegram API ([backend/app/rich_posts.py](backend/app/rich_posts.py)):

- User must be channel owner or administrator with permission to post
- The bot must also be channel admin (Telegram enforces on send)
- Optional `PUBLISH_ALLOWED_CHANNELS` env restricts target channels
- All authorization is enforced on the server

See [docs/PUBLISHING.md](docs/PUBLISHING.md) for user-facing explanation.

### Optional channel whitelist

If you set `PUBLISH_ALLOWED_CHANNELS` in `.env`, users can publish only to those channels (and still must be channel admins).

## Upload Security

Media uploads ([backend/app/rich_posts.py](backend/app/rich_posts.py)):

| Control | Value |
|---------|-------|
| Max file size | 50 MB |
| User quota | 400 MB (configurable) |
| Retention | 4 hours (configurable) |
| Content validation | Magic bytes vs extension |
| Allowed types | photo, video, audio, voice, animation |
| Post-publish cleanup | Publisher's files only |
| Periodic cleanup | Background task |
| Voice conversion | ffmpeg with concurrency limit |

Uploaded files are stored in isolated per-user directories with unguessable names.

Public URLs must be served over HTTPS so Telegram can fetch media.

## Security Headers

Applied by nginx ([nginx/security-headers.conf](nginx/security-headers.conf)) and FastAPI middleware:

- `Strict-Transport-Security`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy` (restricts scripts to self + telegram.org)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (microphone allowed for voice recording)

## Webhook Protection

Telegram webhook ([backend/app/telegram_webhook.py](backend/app/telegram_webhook.py)):

- **`WEBHOOK_SECRET` is required** — unauthorized requests are rejected
- Webhook is not registered at startup if secret is missing
- Request body size is limited; payload structure is validated
- Only processes `/start` messages

## Network Hardening

Recommended nginx rules ([nginx/rich.helito.ge.conf](nginx/rich.helito.ge.conf)):

- Deny dotfiles (`.env`, `.git`)
- Block common scanner paths
- Limit HTTP methods on `/api/` to GET, POST, OPTIONS
- Internal health endpoint not exposed publicly
- Upload size limits enforced at nginx and application layers

## Secrets Management

| Secret | Storage |
|--------|---------|
| `TELEGRAM_BOT_TOKEN` | `backend/.env` (never commit) |
| `WEBHOOK_SECRET` | `backend/.env` |
| SSL certificates | Let's Encrypt on server |

`.env` is listed in `.gitignore`. Use `.env.example` as template.

## Logging

- httpx/httpcore log level set to WARNING (prevents bot token in URLs)
- Audit log for upload, preview, publish actions (user id, IP, metadata)
- No passwords or initData logged

## Deployment Checklist

- [ ] HTTPS with valid certificate
- [ ] `WEBHOOK_SECRET` set (required — webhook disabled without it)
- [ ] Backend restarted after `.env` changes
- [ ] `ALLOWED_ORIGINS` and `TRUSTED_HOSTS` match your domain
- [ ] Bot token not in frontend bundle
- [ ] `RICH_POSTS_ENABLE_DOCS=0` in production (disable `/docs`)
- [ ] nginx rate limit zones included in `http {}`
- [ ] Upload directory not world-writable
- [ ] Bot is **not** admin in channels you do not want users to publish to (users publish only to channels where they are admins)
- [ ] Regular OS and dependency updates

## Public Bot (@RichMessages_bot)

Safe to share with arbitrary users when the checklist above is complete:

| Action | Any user | Channel admin |
|--------|----------|---------------|
| Preview to self (`/draft`) | ✅ | ✅ |
| Publish to channel | ❌ | ✅ (if bot is channel admin) |
| Upload media | ✅ (within quota) | ✅ |

All security checks are enforced on the server.

## Known Limitations

- In-memory rate limiter resets on process restart; use nginx as primary limit
- No database — history stored as JSON files per user
- Channel publish requires bot to be channel administrator
- Custom emoji on buttons requires Premium/Fragment for bot owner
- **Math inside `<details>`** crashes Telegram Desktop ([tdesktop#30808](https://github.com/telegramdesktop/tdesktop/issues/30808)) — blocked by API validation; use separate «Формула» blocks instead
