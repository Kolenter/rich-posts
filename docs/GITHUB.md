# GitHub / Maintainer Notes

Репозиторий: [github.com/Kolenter/rich-posts](https://github.com/Kolenter/rich-posts)

## Перед релизом

- [ ] `backend/.env` не в git
- [ ] `backend/bin/ffmpeg` не в git (77 MB)
- [ ] Нет личных Telegram ID, доменов и секретов в коде и docs
- [ ] CI зелёный (Actions → workflow `ci.yml`)

## Topics (рекомендуемые)

`telegram`, `telegram-bot`, `mini-app`, `rich-messages`, `fastapi`, `react`

## Локальная проверка CI

```bash
cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/python -c "from app.main import app; print('OK')"
cd ../frontend && npm ci && npm run build
```

## Публичный бот

Чеклист перед «скинуть людям»: [DEPLOYMENT.md](./DEPLOYMENT.md), [SECURITY.md](../SECURITY.md), [PUBLISHING.md](./PUBLISHING.md)
