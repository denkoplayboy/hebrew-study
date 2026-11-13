# Шореш — заметки для доработок

Личное приложение для изучения иврита и английского (интерфейс на русском). Владелец пишет запросы в чат
на русском: «добавь слова…», «сделай упражнение на…», «добавь механику…».

## Стек и структура
- `server/src/` — Hono + better-sqlite3. `index.ts` — все маршруты `/api/*` и раздача `dist/web`.
  `words.ts` — CRUD слов, поиск/дубликаты, грани (facets), применение повторений. `session.ts` — сборка тренировок.
  `ai.ts` — Claude API (structured outputs через `betaZodOutputFormat`, `fallbacks: "default"`). `stats.ts`, `content.ts`, `db.ts` (миграции — массив `MIGRATIONS`, добавлять только в конец).
- `web/src/` — React. `pages/*` — страницы, `exercises/*` — упражнения, `components/*` — общие элементы, `styles.css` — дизайн-токены.
- `shared/` — общий код сервера и клиента: `lang.ts` (нормализация иврита, раскладка, биньяны, гзарот, лица/времена), `memory.ts` (FSRS, грани, стадии), `types.ts`.

## Как добавить слова по просьбе владельца
Создай `content/inbox/<дата>-<тема>.json` вида `{ "words": [ ... ] }` (поля как в `content/seed/01-first-words.json`:
`he`, `he_nikud`, `translit` (кириллица, ה → h, ударение ́), `ru`, `ru_alt`, `en`, `en_alt`, `pos`, `gender`, `plural`, `plural_nikud`,
`root` (`ת-פ-ס`), `binyan`, `gizra`, `notes`, `tags`, `study` (`["he"]`/`["en"]`), `input_lang`, `examples` (с `target` — точная подстрока),
`he_forms` (полное спряжение: tense past/present/future/imperative/infinitive, person как в `shared/lang.ts` PERSONS; для прилагательных/сущ. — tense `infl`),
`en_forms` (past/pp/ing/3s)). Каждый файл импортируется один раз (`settings` хранит `meta:inbox:<файл>`); дубликаты сливаются в существующую карточку.
Удобно генерировать скриптом, как это сделано для `content/packs/starter-verbs.json`.

## Как добавить набор упражнений
`content/packs/<id>.json`: `{ id, title, description, lang, level, items: [...] , words?: [...] }`.
Типы `items`: `info` (title, body), `choice` (prompt, options, answer — индекс; варианты перемешиваются в клиенте),
`fill` (prompt с `___`, answers), `translate` (prompt по-русски, answers), `order` (tokens, answers: [предложение]). Везде `explain`.

## ИИ и расходы
- Модель и «усилие» задаются по операциям (`analyze`, `conjugate`, `check`) в настройках приложения (`settings.aiProfile`), по умолчанию — `AI_MODEL` (Opus 5.5).
- Каждый запрос пишется в `ai_usage` (токены и стоимость по ценам из `PRICES` в `ai.ts`); ответы разбора и спряжения кэшируются в `ai_cache` на 30 дней.
- При правке промптов в `ai.ts` увеличь `PROMPT_VERSION`, иначе из кэша будут отдаваться ответы старой версии.
- Haiku не поддерживает серверный fallback — для него параметр `fallbacks` не отправляется.

## Принципы
- Ктив мале без огласовок в `he`/`form`, огласовки — в `he_nikud`/`nikud`. Ответы сравниваются без огласовок, разница י/ו = «почти верно».
- Интерфейс и все пояснения — по-русски. Дизайн: мягкие углы, нейтральные цвета, без эмодзи и геймификации в стиле Duolingo.
- Проверка перед коммитом: `npm run typecheck && npm run build`.
