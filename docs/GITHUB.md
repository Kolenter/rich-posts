# GitHub Publication Checklist

Пошаговый чеклист для публикации репозитория на GitHub.

## Перед push

- [ ] Убедитесь, что `backend/.env` **не** в git (`git status`)
- [ ] `backend/bin/ffmpeg` (77 MB) **не** в git — используйте системный ffmpeg
- [x] Замените `YOUR_ORG` в README.md и CHANGELOG.md на ваш GitHub org/username (`Kolenter`)
- [ ] Обновите badge URL в README после создания репозитория
- [ ] Проверьте, что в коде нет личных Telegram ID и секретов

## Создание репозитория

```bash
cd rich-posts   # корень репозитория

git init   # если ещё не git
git add .
git status   # проверьте список файлов

git commit -m "$(cat <<'EOF'
Release v1.0.2: Rich Posts public release

Telegram Mini App for Rich Messages with security hardening.
EOF
)"

# На GitHub: New repository → rich-posts (без README, license уже есть)
git remote add origin git@github.com:Kolenter/rich-posts.git
git branch -M main
git push -u origin main
```

## После публикации

- [ ] Включите GitHub Actions (CI workflow)
- [ ] Добавьте topics: `telegram`, `telegram-bot`, `mini-app`, `rich-messages`, `fastapi`, `react`
- [ ] Создайте Release `v1.0.1` с notes из CHANGELOG.md
- [ ] (Опционально) Добавьте screenshot в README

## Публичный запуск бота

Документация: [PUBLISHING.md](./PUBLISHING.md), [DEPLOYMENT.md](./DEPLOYMENT.md), [SECURITY.md](../SECURITY.md)

```bash
# 1. WEBHOOK_SECRET в .env (обязательно)
python3 -c "import secrets; print(secrets.token_hex(32))"

# 2. Перезапуск backend
sudo systemctl restart rich-posts-backend

# 3. Проверка health (на сервере)
curl http://127.0.0.1:8035/health
```

Чеклист перед «скинуть людям»:

- [ ] `WEBHOOK_SECRET` задан, backend перезапущен
- [ ] `/start` работает
- [ ] «Себе» — превью в личку
- [ ] «В канал» — только для админа своего канала
- [ ] Бот **не** админ в каналах, куда не хотите давать publish

## Что включено

| Файл | Назначение |
|------|------------|
| README.md | Главная документация |
| SECURITY.md | Политика безопасности |
| LICENSE | MIT |
| CONTRIBUTING.md | Гайд для contributors |
| CHANGELOG.md | История версий |
| docs/PUBLISHING.md | Публикация в канал и права |
| docs/ARCHITECTURE.md | Архитектура |
| docs/DEPLOYMENT.md | Развёртывание + public launch checklist |
| docs/API.md | API reference |
| .github/workflows/ci.yml | CI: backend import + frontend build |

## Локальная проверка CI

```bash
cd backend && ./venv/bin/python -c "from app.main import app; print('OK')"
cd ../frontend && npm ci && npm run build
```
