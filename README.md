# Rich Posts

[![CI](https://github.com/Kolenter/rich-posts/actions/workflows/ci.yml/badge.svg)](https://github.com/Kolenter/rich-posts/actions/workflows/ci.yml)
[![Telegram Bot API](https://img.shields.io/badge/Bot%20API-10.1-blue)](https://core.telegram.org/bots/api-changelog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Rich Posts** — автономный [Telegram Mini App](https://core.telegram.org/bots/webapps) для визуального редактирования и публикации **Rich Messages** ([Bot API 10.1](https://core.telegram.org/bots/api#sendrichmessage)).

Отдельный бот, отдельный домен, без зависимости от других проектов.

> **English:** A self-hosted Telegram Mini App to compose and publish Rich Messages (structured posts with headings, media, tables, maps, inline buttons) to your channel via `sendRichMessage`.

## Демо

Живой пример — бот [@RichMessages_bot](https://t.me/RichMessages_bot) (откройте Mini App из меню бота).

Свой инстанс разворачиваете на **своём домене** — см. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). URL API и Mini App задаются в `.env`, в репозитории чужих серверов нет.

## Возможности

- **Блочный редактор** — заголовки, текст, списки, таблицы, цитаты, код, формулы, скрытые блоки
- **Медиа** — фото, видео, GIF, аудио, голосовые (запись с телефона + конвертация WebM → OGG)
- **Коллажи и слайдшоу**, карты, разделители, подписи
- **Inline-кнопки** с цветами (Bot API 9.4+) и custom emoji на кнопках
- **Превью в личку** — реальный Rich Message через `sendRichMessage`, не черновик
- **Публикация в канал** — только для админов/владельцев канала (проверка на сервере)
- **Загрузка медиа с телефона** → публичный HTTPS URL для Telegram
- **Живое превью** в стиле Telegram + парсинг ответа Bot API для точного отображения

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, `@twa-dev/sdk` |
| Backend | Python 3.12, FastAPI, httpx, uvicorn |
| Инфра | nginx, systemd, Let's Encrypt |

## Структура репозитория

```
RichPosts/
├── backend/                 # FastAPI API (:8035)
│   ├── app/
│   │   ├── main.py          # точка входа приложения
│   │   ├── rich_posts.py    # Rich Messages API
│   │   ├── auth.py          # валидация Telegram initData (HMAC)
│   │   ├── security.py      # rate limit, security headers
│   │   ├── storage.py       # история и очистка uploads
│   │   └── telegram_webhook.py
│   ├── .env.example
│   └── requirements.txt
├── frontend/                # Vite + React Mini App
│   └── src/
│       ├── pages/RichPostsPage.tsx
│       ├── components/      # редактор, превью, история
│       └── utils/           # markdown, upload, рендер
├── nginx/                   # пример конфигурации nginx
├── scripts/                 # send_rich_demo.py (CLI)
├── docs/                    # подробная документация
├── rich-posts-backend.service
├── SECURITY.md
└── README.md
```

## Быстрый старт

### Требования

- Python 3.11+
- Node.js 20+
- Telegram Bot Token ([BotFather](https://t.me/BotFather))
- HTTPS-домен (обязательно для Mini App)
- **ffmpeg** — для конвертации голосовых (или положите бинарник в `backend/bin/ffmpeg`)

### 1. Backend

```bash
git clone https://github.com/Kolenter/rich-posts.git
cd rich-posts/backend

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Заполните TELEGRAM_BOT_TOKEN, MINIAPP_URL, RICH_POSTS_DEFAULT_CHANNEL

python run.py
```

Проверка: `curl http://127.0.0.1:8035/health`

### 2. Frontend

```bash
cd ../frontend
npm install
npm run build
```

Dev-режим с прокси API:

```bash
npm run dev   # http://localhost:5185 → /api → :8035
```

### 3. Production (systemd + nginx)

Подробная инструкция: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

```bash
sudo cp rich-posts-backend.service /etc/systemd/system/
# Отредактируйте пути в unit-файле под ваш сервер

sudo systemctl daemon-reload
sudo systemctl enable --now rich-posts-backend
```

### 4. BotFather и канал

1. Создайте бота → скопируйте токен в `TELEGRAM_BOT_TOKEN`
2. **Menu Button** → Web App → URL из `MINIAPP_URL`
3. Сгенерируйте `WEBHOOK_SECRET` (обязательно):
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```
4. Пользователь добавляет бота **администратором** в **свой** канал для публикации

Подробнее о правах: [docs/PUBLISHING.md](docs/PUBLISHING.md)

## Публикация в канал (кратко)

| Кто | «Себе» | «В канал» |
|-----|--------|-----------|
| Любой пользователь бота | ✅ в личку | ❌ |
| Админ/владелец канала + бот админ канала | ✅ | ✅ |

Поле `@channel` в редакторе — **куда** постить. Права проверяются на сервере.

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `TELEGRAM_BOT_TOKEN` | Токен бота |
| `RICH_POSTS_DEFAULT_CHANNEL` | `@channel` или `-100…` по умолчанию |
| `MINIAPP_URL` | URL mini app для меню бота |
| `WEBHOOK_URL` | URL webhook (`/api/v1/telegram/webhook`) |
| `WEBHOOK_SECRET` | **Обязательно.** Секрет webhook (`X-Telegram-Bot-Api-Secret-Token`) |
| `RICH_POSTS_PORT` | Порт API (8035) |
| `RICH_POSTS_UPLOAD_PUBLIC_BASE` | Базовый URL загрузок (`https://your.domain/uploads`) |
| `RICH_POSTS_UPLOAD_RETENTION_SEC` | Срок хранения uploads (по умолчанию 4 ч) |
| `RICH_POSTS_UPLOAD_USER_QUOTA_BYTES` | Квота на пользователя (400 МБ) |
| `RICH_POSTS_DATA_DIR` | Каталог истории публикаций |
| `RICH_POSTS_HISTORY_MAX_ENTRIES` | Записей в истории (50) |
| `FFMPEG_PATH` | Путь к ffmpeg (опционально) |
| `ALLOWED_ORIGINS` | CORS origins через запятую |
| `TRUSTED_HOSTS` | TrustedHost middleware |
| `RATE_LIMIT_PER_MINUTE` | Общий rate limit API (см. `.env.example`) |
| `DRAFT_RATE_LIMIT_PER_MINUTE` | Лимит превью на пользователя |
| `UPLOAD_RATE_LIMIT_PER_MINUTE` | Лимит загрузок на пользователя |
| `PUBLISH_RATE_LIMIT_PER_MINUTE` | Лимит публикаций на пользователя |
| `PUBLISH_ALLOWED_CHANNELS` | Опционально: whitelist каналов для publish |
| `ADMIN_IDS` | Telegram user id админов — команды `/stats`, `/admin` и дашборд Mini App |

Frontend (при сборке):

| Переменная | Описание |
|------------|----------|
| `VITE_API_BASE` | API на другом origin |
| `VITE_BASE` | Base path (например `/rich-posts/`) |

Полный список: [backend/.env.example](backend/.env.example)

## API

Все эндпоинты требуют заголовок `X-Telegram-Init-Data`.

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/v1/rich-posts/meta` | Лимиты, канал, @bot |
| `POST` | `/api/v1/rich-posts/upload` | Загрузка медиа → HTTPS URL |
| `POST` | `/api/v1/rich-posts/draft` | Превью в личку |
| `POST` | `/api/v1/rich-posts/send` | Превью или publish в канал |
| `GET` | `/api/v1/rich-posts/history` | История публикаций |
| `DELETE` | `/api/v1/rich-posts/history/{id}` | Удалить запись |
| `POST` | `/api/v1/telegram/webhook` | Webhook бота (/start) |

Подробнее: [docs/API.md](docs/API.md)

## CLI-демо

```bash
cd scripts
TELEGRAM_BOT_TOKEN=… python send_rich_demo.py
# или задайте DEMO_CHAT_ID в .env
```

## Безопасность

- HMAC-валидация Telegram `initData` (все API-запросы)
- Публикация в канал — только для админов/владельцев канала
- Rate limiting (nginx + backend)
- Обязательный `WEBHOOK_SECRET`
- Валидация загружаемых файлов, квота и автоочистка
- Security headers (CSP, HSTS, X-Frame-Options)
- Audit log действий
- Все проверки на сервере

См. [SECURITY.md](SECURITY.md) и [docs/PUBLISHING.md](docs/PUBLISHING.md)

## Документация

- [Публикация в канал](docs/PUBLISHING.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Развёртывание](docs/DEPLOYMENT.md)
- [API Reference](docs/API.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Публикация на GitHub](docs/GITHUB.md)

## Лицензия

[MIT](LICENSE) — см. файл LICENSE.

## Благодарности

- [Telegram Bot API](https://core.telegram.org/bots/api) — Rich Messages
- [@twa-dev/sdk](https://github.com/twa-dev/sdk) — Telegram Web App SDK
