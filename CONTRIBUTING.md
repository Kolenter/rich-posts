# Contributing to Rich Posts

Спасибо за интерес к проекту! Ниже — краткие правила для pull request'ов.

## Как начать

1. Fork репозитория
2. Создайте ветку: `git checkout -b feature/my-feature`
3. Внесите изменения
4. Убедитесь, что сборка проходит (см. ниже)
5. Откройте Pull Request

## Требования к PR

- Одна логическая задача на PR
- Без секретов в коде (токены, `.env`, личные ID)
- Сохраняйте стиль существующего кода
- Обновите документацию, если меняется API или конфигурация
- Комментарии — только для неочевидной логики

## Локальная проверка

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -c "from app.main import app; print('OK')"
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

## Структура коммитов

Предпочтительный формат:

```
type: краткое описание

fix: исправление бага
feat: новая возможность
docs: документация
refactor: рефакторинг без изменения поведения
chore: инфраструктура, зависимости
```

## Issues

- **Bug report** — шаги воспроизведения, ожидаемое/фактическое поведение, версия
- **Feature request** — описание use case, почему это нужно
- **Security** — не создавайте публичный issue; см. [SECURITY.md](SECURITY.md)

## Code Style

**Python:** PEP 8, type hints где уместно, async для I/O.

**TypeScript/React:** functional components, hooks, Tailwind для стилей.

## Лицензия

Contributing подразумевает согласие с [MIT License](LICENSE).
