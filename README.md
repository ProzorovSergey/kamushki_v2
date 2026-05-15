# Jewerly of Soul · мастерская и сообщество браслетов

Личная мастерская браслетов из натуральных полудрагоценных камней + платформа сообщества: каждый пользователь может собрать идею, сохранить, опубликовать в общей ленте, поставить лайки чужим. Работает **полностью в браузере** — без npm, без бэкенда. Архитектура готова к подключению backend: достаточно подменить `js/api/local/*`.

## Что умеет

| Раздел                | Файл                | Возможности |
|-----------------------|---------------------|-------------|
| Главная               | `index.html`        | Hero, превью композиций, 4 камня в фокусе |
| Конструктор           | `constructor.html`  | Сборка браслета, 66 камней, AI-описание энергии, сохранение идеи, mailto + PNG |
| Камни                 | `stones.html`       | Каталог 66 минералов · фильтры: стихия / цвет / энергия / редкость |
| Сообщество            | `inspiration.html`  | Лента идей · лайки · поиск · сортировка · фильтр настроения |
| Идея                  | `idea.html?id=…`    | Детальная страница: состав, автор, лайк/избранное, удаление |
| Профиль               | `profile.html`      | Мои идеи / избранное / понравились |
| Регистрация и вход    | `register.html` · `login.html` | Локальная авторизация |
| Связаться             | `contact.html`      | Форма обратной связи (mailto) |

## Архитектура (слои)

```
js/
├── core/             ← движки и низкоуровневые утилиты
│   ├── webglStoneRenderer.js    WebGL PBR-рендер камней (гибрид procedural + albedo PNG)
│   ├── stoneGenerator.js        совместимый прокси
│   ├── bracelet.js              геометрия + отрисовка браслета
│   ├── database.js              fetch + localStorage-кэш базы камней
│   ├── exporter.js              PNG, JSON, mailto-помощник
│   ├── userStorage.js           обёртка над localStorage (паролы, токены, JSON)
│   └── aiAssistant.js           rule-based mock AI: описание + рекомендации + названия
│
├── api/              ← API ABSTRACTION (тонкие методы CRUD)
│   ├── interfaces.js            JSDoc-типы (контракты)
│   ├── index.js                 точка переключения; сейчас → ./local/
│   └── local/                   реализация на localStorage
│       ├── authApi.js  · userApi.js
│       └── ideaApi.js  · aiApi.js
│
├── services/         ← APPLICATION SERVICES (использует UI)
│   ├── authService.js           сессия, кэш юзера, событие 'auth:change'
│   ├── ideaService.js           создание идей, права, expand stones
│   ├── userService.js           публичные профили
│   ├── aiService.js             вызов AI + кэш в памяти
│   └── seedService.js           один раз засевает community.seed.json
│
├── ui/               ← reusable компоненты
│   ├── layout.js                шапка + футер + user-меню + защита страниц
│   ├── miniBracelet.js          мини-превью браслета для карточек
│   ├── toast.js                 нотификации
│   ├── modal.js                 модальные окна
│   └── skeleton.js              skeleton-загрузчики
│
└── pages/            ← страничный код (по одному файлу на HTML)
```

**Правило слоёв.** UI зовёт только `services/*`. Services зовут `api/index.js`. API — единственное, что трогает `localStorage`. Это значит — чтобы подключить настоящий backend (Supabase / Firebase / Node), достаточно написать `js/api/remote/*` и поменять один импорт в `js/api/index.js`.

## Данные

```
data/
├── stones.json              база 66 минералов
├── inspirations.json        9 готовых композиций мастера
└── community.seed.json      10 фейк-юзеров + 30 идей (засевается при первом запуске)
```

### Структура user

```js
{
  id, username, displayName, avatar,
  passwordHash, salt,           // SHA-256(salt:password), WebCrypto
  createdAt,
  likes:           [ideaId],
  favorites:       [ideaId],
  publishedIdeas:  [ideaId],
}
```

### Структура idea

```js
{
  id, authorId, title, description,
  stones: [{ id, size }],
  length,                       // мм
  tags: [string],
  mood,                         // calm/love/protection/action/speech/growth/deep_water/silence
  isPublic,
  createdAt, updatedAt,
  likesCount,
  energyDescription,
}
```

### AI response

```js
{
  energyDescription,            // абзац про энергетику браслета
  recommendations,              // когда/как носить
  nameSuggestions: [string],    // 3-5 поэтичных названий
  dominants: {
    elements: [string],
    energies: [string],
    colors:   [string],
  }
}
```

## Запуск

```bash
python3 -m http.server 8000
# или
npx serve .
```

Откройте `http://localhost:8000`. При первом заходе на любую страницу — сидовое сообщество загрузится автоматически.

## Деплой

```bash
git init && git add . && git commit -m "auraline platform"
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

В **Settings → Pages → Source: main / (root)**.

> Замените `MASTER_EMAIL` в `js/core/exporter.js` на свою настоящую почту.

## Подключение настоящего backend

Архитектура спроектирована для безболезненной миграции:

1. Создайте `js/api/remote/` с реализациями `authApi.js`, `ideaApi.js`, `userApi.js`, `aiApi.js` — теми же сигнатурами, что в `js/api/interfaces.js`. Внутри — `fetch` к вашему API.
2. В `js/api/index.js` поменяйте импорт:
   ```js
   import * as authApi from './remote/authApi.js';
   // ...
   ```
3. Всё. UI и services не меняются.

Для AI это особенно простой переход: `js/api/local/aiApi.js` сейчас вызывает локальный rule-based mock; вместо него можно отправлять `fetch` в OpenAI/Anthropic API.

## Безопасность

Пароли хешируются SHA-256 + соль через WebCrypto. **Это не production-уровень** — для боевого режима нужен bcrypt/argon2 на сервере. Сейчас уровень «mock-storage с консистентной структурой данных».

При смене браузера или после очистки `localStorage` локальные аккаунты пропадают. Намеренно — пока нет настоящей базы.

## Защита диплома — что подчеркнуть

- **WebGL PBR-рендер камней** — Cook-Torrance + GGX + Fresnel + SSS + iridescence, гибрид procedural и реальных PNG (см. `ASSETS_GUIDE.md`). 66 минералов, 21 редкий — особая подсветка.
- **Чистая слоёная архитектура** — core / api / services / ui / pages. Контракты в `interfaces.js`. Дизайн под подключение backend.
- **Локальная имитация сообщества** — seed-данные с 10 авторами и 30 идеями, лайки/избранное работают.
- **Mock AI на правилах** — анализ доминант стихий/энергий, генерация описаний и названий. Архитектура готова к замене на реальный LLM.
- **Без зависимостей** — ванильный JS, ES-модули. Деплой на GitHub Pages.
- **Каталог 66 камней** с 4 типами фильтров (стихия / цвет / энергия / редкость), у каждого камня — PBR-фотореализм через PNG-альбедо.

## Лицензия

MIT.
