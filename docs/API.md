# API Reference

Base URL: `https://your.domain/api/v1`

All Rich Posts endpoints require authentication via Telegram Mini App initData.

## Authentication

```http
X-Telegram-Init-Data: query_id=...&user=...&auth_date=...&hash=...
```

The backend validates HMAC signature using the bot token. Expired or tampered initData returns `401`.

---

## GET /rich-posts/meta

Returns editor limits and configuration.

**Response 200:**

```json
{
  "text_limit": 32768,
  "block_limit": 500,
  "nesting_limit": 16,
  "media_limit": 50,
  "table_columns_limit": 20,
  "default_channel": "@mychannel",
  "bot_username": "MyRichBot"
}
```

---

## POST /rich-posts/upload

Upload media from device. Returns public HTTPS URL for Rich Message markdown.

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | file | Image, video, audio, voice, or GIF |

**Limits:**

- Max size: 50 MB
- User quota: 400 MB (configurable)
- Content validated by magic bytes

**Response 200:**

```json
{
  "ok": true,
  "url": "https://your.domain/uploads/123456/abc123/def456.jpg",
  "kind": "photo",
  "filename": "def456.jpg",
  "size": 102400
}
```

**Errors:** `400` invalid type, `413` too large / quota exceeded, `503` ffmpeg unavailable (voice WebM)

---

## POST /rich-posts/draft

Send Rich Message preview to user's Telegram DM. Replaces previous preview message.

**Request:**

```json
{
  "markdown": "# Hello\n\n**Rich Message** content",
  "draft_id": 1,
  "reply_markup": {
    "inline_keyboard": [[{"text": "Open", "url": "https://example.com"}]]
  }
}
```

**Response 200:**

```json
{
  "ok": true,
  "message_id": 42,
  "chat_id": 123456789,
  "blocks_count": 5,
  "blocks": [...]
}
```

The `blocks` array contains Telegram-parsed structure for accurate client preview.

---

## POST /rich-posts/send

Send preview (to self) or publish to channel.

**Request:**

```json
{
  "markdown": "# Post title\n\nContent...",
  "mode": "preview",
  "chat_id": "@mychannel",
  "message_thread_id": null,
  "blocks": [{"type": "heading", "text": "Post title"}],
  "reply_markup": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `markdown` | string | Rich Message markdown (1–32768 chars) |
| `mode` | `"preview"` \| `"publish"` | preview → DM; publish → channel |
| `chat_id` | string? | Channel @username or -100… (publish only) |
| `message_thread_id` | int? | Forum topic ID |
| `blocks` | array? | Editor blocks for history (publish) |
| `reply_markup` | object? | Inline keyboard |

For `mode=preview`, message goes to authenticated user's DM.

For `mode=publish`, uses `chat_id` or default channel from settings. Server verifies the user is a channel administrator before sending.

**Response 200:**

```json
{
  "ok": true,
  "message_id": 100,
  "chat_id": "@mychannel",
  "blocks_count": 8,
  "mode": "publish"
}
```

On publish: history saved, uploaded media files cleaned up.

---

## GET /rich-posts/history

List user's publication history (newest first).

**Response 200:**

```json
{
  "ok": true,
  "items": [
    {
      "id": "uuid",
      "title": "Post title",
      "created_at": 1718280000,
      "target": "@mychannel",
      "message_id": 100,
      "blocks": [...],
      "had_media": true
    }
  ]
}
```

Media URLs in stored blocks are cleared (files deleted after publish).

---

## DELETE /rich-posts/history/{id}

Delete a history entry.

**Response 200:** `{"ok": true}`

**Errors:** `404` if entry not found

---

## POST /telegram/webhook

Telegram bot webhook. Not called by Mini App directly.

Handles `/start` → welcome message with Web App button.

Protected by `WEBHOOK_SECRET` configured in server environment. Not intended for direct client access.

---

## GET /health

Local health check only (127.0.0.1).

**Response 200:** `{"status": "healthy"}`

---

## Error format

```json
{
  "detail": "Human-readable error message in Russian"
}
```

| Code | Meaning |
|------|---------|
| 400 | Validation error (empty post, math in `<details>`, invalid button URL) |
| 401 | Missing/invalid initData |
| 403 | Forbidden — insufficient permissions |
| 413 | Upload too large / quota exceeded |
| 429 | Rate limited (per IP or per Telegram user id) |
| 502 | Telegram API error (sanitized message) |
| 503 | Service unavailable (no bot token, ffmpeg, webhook not configured) |

## Inline keyboard constraints

| Limit | Value |
|-------|-------|
| Max rows | 10 |
| Max buttons per row | 8 |
| Button text | 64 chars |
| Button URL | 2048 chars, `https://` or `tg://` |
| Styles | `primary`, `success`, `danger` |
| Custom emoji | numeric `icon_custom_emoji_id` |
