# Deployment Guide

Пошаговое развёртывание Rich Posts на Linux-сервере с nginx и systemd.

## Prerequisites

- Ubuntu 22.04+ / Debian 12+ (or similar)
- Domain with DNS A record pointing to server
- Python 3.11+, Node.js 20+
- nginx, certbot
- ffmpeg: `sudo apt install ffmpeg`

## 1. Clone and configure

```bash
sudo mkdir -p /opt/rich-posts
sudo chown $USER:$USER /opt/rich-posts
git clone https://github.com/Kolenter/rich-posts.git /opt/rich-posts
cd /opt/rich-posts
```

### Backend environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env
```

Minimum required variables:

```env
TELEGRAM_BOT_TOKEN=123456:ABC...
RICH_POSTS_DEFAULT_CHANNEL=@your_channel
MINIAPP_URL=https://rich.example.com/
WEBHOOK_URL=https://rich.example.com/api/v1/telegram/webhook
WEBHOOK_SECRET=your-random-secret-here   # обязательно!
RICH_POSTS_UPLOAD_PUBLIC_BASE=https://rich.example.com/uploads
ALLOWED_ORIGINS=https://rich.example.com
TRUSTED_HOSTS=rich.example.com,127.0.0.1,localhost
RICH_POSTS_ENABLE_DOCS=0
```

Generate webhook secret:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Build frontend

```bash
cd ../frontend
npm ci
npm run build
```

Output: `frontend/dist/`

## 2. systemd service

Edit paths in `rich-posts-backend.service`:

```ini
WorkingDirectory=/opt/rich-posts/backend
EnvironmentFile=/opt/rich-posts/backend/.env
ExecStart=/opt/rich-posts/backend/venv/bin/python run.py
```

Install:

```bash
sudo cp rich-posts-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rich-posts-backend
sudo systemctl status rich-posts-backend
```

Verify locally:

```bash
curl http://127.0.0.1:8035/health
# {"status":"healthy"}
```

## 3. nginx

### Rate limit zones

Add to `/etc/nginx/nginx.conf` inside `http {}`:

```nginx
include /opt/rich-posts/nginx/rich-posts-limits.conf;
```

### Site config

Copy and adapt `nginx/rich-posts.conf`:

```bash
sudo cp nginx/rich-posts.conf /etc/nginx/sites-available/rich-posts
```

Replace in the config:

- `your.domain` → your domain
- `/opt/rich-posts` → your install path
- SSL certificate paths (Let's Encrypt)

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/rich-posts /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL with certbot

```bash
sudo certbot --nginx -d rich.example.com
```

## 4. BotFather setup

1. Create bot via [@BotFather](https://t.me/BotFather)
2. Set **Menu Button** → Web App → `MINIAPP_URL`
3. User must `/start` the bot before receiving previews in DM
4. For **channel publish**: user adds bot as **administrator** to **their** channel (with "Post messages" permission)

See [PUBLISHING.md](./PUBLISHING.md) for how channel authorization works.

## 5. Public launch checklist

After deployment, verify locally:

```bash
curl http://127.0.0.1:8035/health
# {"status":"healthy"}
```

- [ ] `WEBHOOK_SECRET` in `.env`, backend restarted
- [ ] `/start` in bot works (welcome + Mini App button)
- [ ] Mini App opens only inside Telegram
- [ ] Preview to self works
- [ ] Channel publish works for channel admin only
- [ ] Bot is not admin in channels you don't want users to use

## 6. Directory permissions

```bash
mkdir -p /opt/rich-posts/backend/uploads
mkdir -p /opt/rich-posts/backend/data/history
chown -R www-data:www-data /opt/rich-posts/backend/uploads
# Or run service as user that owns uploads — ensure nginx can read uploads/
```

nginx serves `/uploads/` via `alias` — the service user must be able to write, nginx to read.

## 7. Updates

```bash
cd /opt/rich-posts
git pull

cd frontend && npm ci && npm run build
cd ../backend && source venv/bin/activate && pip install -r requirements.txt

sudo systemctl restart rich-posts-backend
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| 401 on API | Open app inside Telegram, not browser |
| 502 on send | Bot token valid, user `/start`ed bot |
| Channel publish fails | User is channel admin? Bot is channel admin? See [PUBLISHING.md](./PUBLISHING.md) |
| 403 on publish | User is not administrator of target channel |
| Media not loading in post | `RICH_POSTS_UPLOAD_PUBLIC_BASE` matches nginx `/uploads/` |
| Voice upload fails | `ffmpeg -version` works or set `FFMPEG_PATH` |
| Webhook not working | `WEBHOOK_SECRET` matches, HTTPS valid |

### Logs

```bash
journalctl -u rich-posts-backend -f
tail -f /var/log/nginx/rich_posts_error.log
```

## Development proxy

For local dev without nginx:

```bash
# Terminal 1
cd backend && source venv/bin/activate && python run.py

# Terminal 2
cd frontend && npm run dev
```

Use [ngrok](https://ngrok.com/) or similar to expose HTTPS for Telegram Mini App testing.

## Docker (optional)

Docker is not included by default. For container deployment:

- Mount `uploads/` and `data/` as volumes
- Pass env via secrets
- Put nginx or traefik in front for TLS
- Ensure ffmpeg in image for voice conversion
