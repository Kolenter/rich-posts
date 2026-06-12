#!/usr/bin/env python3
"""CLI-демо Rich Message через бота @RichMessages_bot (Bot API 10.1)."""

import asyncio
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_ROOT / "backend" / ".env", override=True)

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()

DEFAULT_CHAT_ID = int(os.getenv("DEMO_CHAT_ID", "0") or "0")

RICH_DEMO_RU = r"""
# Rich Messages · Georgia App

**Bot API 10.1** — одно сообщение бота как мини-статья в чате.

---

## Лимиты

| Параметр | Значение |
|:---------|:--------:|
| Текст | **32 768** символов |
| Блоки | **500** |
| Вложенность | **16** уровней |
| Медиа | **50** |
| Колонки таблицы | **20** |

> Обычный текст — максимум **4 096** символов без структуры.

---

## Форматирование

**Жирный** · _курсив_ · <u>подчёркнутый</u> · ~~зачёркнутый~~ · ||спoiler|| · `код` · ==выделение==

$x^2+y^2$ · sub<sub>2</sub> · sup<sup>2</sup>

[Документация](https://core.telegram.org/bots/api-changelog) · [почта](mailto:hello@georgiaapp.ge) · [телефон](tel:+995555123456)

#GeorgiaApp · $USD · +995555123456 · @georgiaapp_bot · /start

---

## Структура

### Списки и код

- пункт списка
1. нумерация
- [ ] задача
- [x] готово

```python
print("Georgia App · Rich Message")
```

> Цитата для акцентов и пояснений.

<aside cite="Georgia App">Pull-quote — выделенная мысль по центру</aside>

---

## Таблица и формулы

| Сервис | Статус |
|:-------|:------:|
| Штрафы | live |
| SuperApp | live |

Inline: $E=mc^2$

```math
\int_0^1 x^2\,dx=\frac{1}{3}
```

---

## Details · медиа · карта

<details>
<summary><b>Раскрыть подробности</b></summary>

Внутри — вложенные блоки, списки и таблицы.

</details>

![](https://telegram.org/example/photo.jpg "Фото")
![](https://telegram.org/example/video.mp4 "Видео")

<tg-map lat="41.7151" lon="44.8271" zoom="14" width="360" height="160">
<figure><figcaption>Тбилиси</figcaption></figure>
</tg-map>

<footer>@RichMessages_bot · sendRichMessage · Bot API 10.1</footer>
""".strip()


async def main() -> None:
    if not TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан в backend/.env")

    chat_id = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CHAT_ID
    if not chat_id:
        raise SystemExit("Укажите chat_id аргументом или DEMO_CHAT_ID в backend/.env")

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"https://api.telegram.org/bot{TOKEN}/sendRichMessage",
            json={
                "chat_id": chat_id,
                "rich_message": {"markdown": RICH_DEMO_RU},
            },
        )
        data = r.json()
        if not data.get("ok"):
            raise SystemExit(data.get("description", r.text))
        msg = data["result"]
        blocks = (msg.get("rich_message") or {}).get("blocks") or []
        me = (
            await client.post(f"https://api.telegram.org/bot{TOKEN}/getMe")
        ).json()["result"]
        print(f"OK @{me.get('username')} → chat {chat_id}, msg {msg['message_id']}, blocks {len(blocks)}")


if __name__ == "__main__":
    asyncio.run(main())
