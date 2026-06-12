# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-06-13

### Security

- Hardened rate limiting, webhook handling, and upload validation

### Added

- Optional `PUBLISH_ALLOWED_CHANNELS` for operator channel whitelist

## [1.0.1] - 2026-06-13

### Security

- Hardened channel publish authorization and webhook configuration
- Improved upload handling and resource limits

### Added

- [docs/PUBLISHING.md](docs/PUBLISHING.md) — channel publish guide
- Public launch checklist in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## [1.0.0] - 2025-06-13

### Added

- Telegram Mini App block editor for Rich Messages (Bot API 10.1)
- FastAPI backend with initData authentication
- Media upload with content validation and user quota
- Voice recording with WebM → OGG conversion via ffmpeg
- Preview to DM via `sendRichMessage`
- Channel publishing with publication history
- Inline keyboard editor with colored buttons and custom emoji
- Live Telegram-style preview + Bot API block parsing
- nginx configuration with rate limiting and security headers
- systemd service unit
- CLI demo script (`scripts/send_rich_demo.py`)

### Security

- HMAC initData validation, rate limiting, upload retention, webhook secret support

[1.0.2]: https://github.com/Kolenter/rich-posts/releases/tag/v1.0.2
[1.0.1]: https://github.com/Kolenter/rich-posts/releases/tag/v1.0.1
[1.0.0]: https://github.com/Kolenter/rich-posts/releases/tag/v1.0.0
