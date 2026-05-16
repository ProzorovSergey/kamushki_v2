# Jewerly of Soul · мастерская и сообщество браслетов

Личная мастерская браслетов из натуральных полудрагоценных камней + платформа сообщества: пользователь собирает идею, сохраняет, публикует в общей ленте, лайкает чужие. Работает **полностью в браузере** — без npm, без бэкенда, ванильный JS. Архитектура готова к подключению backend: достаточно подменить `js/api/local/*`.

**Бренд:** Jewerly of Soul · Ижевск, Россия · с 2025  
**Контакты:** Telegram `@sdproz` · email `jewerlyofsoul25@gmail.com`

---

## Что умеет

| Раздел                | Файл                | Возможности |
|-----------------------|---------------------|-------------|
| Главная               | `index.html`        | Hero с дыханием браслета + социальное доказательство · триптих топ-3 идей · витрина · 4 камня в фокусе · about |
| Конструктор           | `constructor.html`  | Сборка из 66 камней · фильтры (стихия/цвет/редкость) · AI-описание энергии · сохранение идеи · sticky-сцена на mobile · mailto + PNG |
| Камни                 | `stones.html`       | Каталог 66 минералов · sticky-search · раскрываемые фильтры (стихия/цвет/энергия/редкость) · tilt-эффекты |
| Сообщество            | `inspiration.html`  | Лента идей · лайки · поиск · сортировка · фильтр настроения · карточки с tilt/glare |
| Идея                  | `idea.html?id=…`    | Детальная страница · состав · автор · лайк/избранное · удаление · JSON-LD CreativeWork |
| Профиль               | `profile.html`      | Мои идеи / избранное / понравились |
| Регистрация и вход    | `register.html` · `login.html` | Локальная авторизация (WebCrypto SHA-256 + salt) |
| Связаться             | `contact.html`      | Telegram · email · форма обратной связи (mailto) |
| Новая идея            | `create-idea.html`  | Точка входа в конструктор для авторизованных |

---

## Архитектура

```
js/
├── core/                       ← движки и низкоуровневые утилиты
│   ├── webgl/                  ← WebGL PBR-рендер (P3.1 разбит на 5 модулей)
│   │   ├── stoneVertex.glsl.js
│   │   ├── stoneShader.glsl.js
│   │   ├── glContext.js
│   │   ├── albedoLoader.js
│   │   └── index.js
│   ├── webglStoneRenderer.js   ← re-export для обратной совместимости
│   ├── stoneGenerator.js       ← совместимый прокси
│   ├── bracelet.js             ← геометрия + отрисовка
│   ├── database.js             ← fetch + localStorage-кэш
│   ├── exporter.js             ← PNG, JSON, mailto-помощник
│   ├── userStorage.js          ← обёртка над localStorage (пароли, токены, JSON)
│   └── aiAssistant.js          ← rule-based mock AI
│
├── api/                        ← API ABSTRACTION
│   ├── interfaces.js           ← JSDoc-контракты
│   ├── index.js                ← точка переключения; сейчас → ./local/
│   └── local/                  ← реализация на localStorage
│       ├── authApi.js  · userApi.js
│       └── ideaApi.js  · aiApi.js
│
├── services/                   ← APPLICATION SERVICES (UI зовёт только их)
│   ├── authService.js          ← сессия, кэш юзера, событие 'auth:change'
│   ├── ideaService.js          ← права, создание идей, expand stones
│   ├── userService.js          ← публичные профили
│   ├── aiService.js            ← вызов AI + кэш в памяти
│   └── seedService.js          ← засев community.seed.json
│
├── ui/                         ← reusable компоненты
│   ├── layout.js               ← шапка + футер + drawer + bottom-nav + theme-toggle
│   ├── ideaCard.js             ← единый шаблон карточки идеи (P3.2)
│   ├── miniBracelet.js         ← мини-превью браслета
│   ├── toast.js                ← нотификации
│   ├── modal.js                ← модальные окна с focus-trap
│   ├── skeleton.js             ← skeleton-загрузчики
│   ├── tilt.js                 ← 3D-tilt микровзаимодействия
│   ├── reveal.js               ← scroll-reveal через IntersectionObserver
│   ├── cursor.js               ← premium-курсор (desktop)
│   ├── theme.js                ← светлая/тёмная тема + сохранение
│   ├── pageTransitions.js      ← View Transitions API
│   └── registerSW.js           ← регистрация Service Worker
│
└── pages/                      ← страничный код (по одному файлу на HTML)
    ├── home.js · constructor.js · stones.js
    ├── inspiration.js · idea.js · profile.js
    ├── login.js · register.js · contact.js
```

**Правило слоёв.** UI зовёт `services/*` → `api/index.js` → storage. Чтобы подключить настоящий backend (Supabase / Firebase / Node), достаточно написать `js/api/remote/*` и поменять один импорт в `js/api/index.js`.

---

## Данные

```
data/
├── stones.json              ← база 66 минералов
├── inspirations.json        ← 9 готовых композиций мастера
└── community.seed.json      ← 10 фейк-юзеров + 30 идей (засевается при первом запуске)
```

### Структура user
```js
{ id, username, displayName, avatar,
  passwordHash, salt,            // WebCrypto SHA-256
  createdAt,
  likes: [ideaId], favorites: [ideaId], publishedIdeas: [ideaId] }
```

### Структура idea
```js
{ id, authorId, title, description,
  stones: [{ id, size }], length,
  tags: [string], mood,          // calm/love/protection/action/speech/growth/deep_water/silence
  isPublic, createdAt, updatedAt, likesCount, energyDescription }
```

### AI response (mock)
```js
{ energyDescription, recommendations,
  nameSuggestions: [string],
  dominants: { elements, energies, colors } }
```

---

## Запуск

```bash
python3 -m http.server 8000
# или
npx serve .
```

Откройте `http://localhost:8000`. При первом заходе seed-сообщество подгрузится автоматически.

---

## Деплой на GitHub Pages

```bash
git add . && git commit -m "update" && git push
```
В **Settings → Pages → Source: main / (root)**. Через 1-2 минуты обновится по адресу `https://USERNAME.github.io/REPO/`.

> Адрес почты мастера меняется в `js/core/exporter.js`, константа `MASTER_EMAIL`.

---

## Чек-лист roadmap (всё выполнено)

### Priority 1 — критические UX
- ✅ Lazy-loading 65 PNG камней через IntersectionObserver
- ✅ Mobile navigation: slide-in drawer + bottom-nav
- ✅ Sticky-сцена в конструкторе на mobile
- ✅ Open Graph + Twitter Card + favicon + apple-touch-icon
- ✅ Focus-rings (`:focus-visible`) + focus-trap в модалках

### Priority 2 — визуальное улучшение
- ✅ Расширенные design tokens (spacing/radius/shadow/motion/fluid-typography)
- ✅ Hero v2: социальное доказательство (цифры) + триптих топ-3 идей + staggered-анимации
- ✅ Карточки без шума: минимализм на лице + overlay с деталями по hover
- ✅ Sticky-search + раскрываемые фильтры с счётчиком активных + «Очистить»
- ✅ Микровзаимодействия: tilt (3D-наклон), elevation, glare-эффекты
- ✅ Fluid typography через `clamp()`

### Priority 3 — архитектура
- ✅ Рефакторинг WebGL: 719-строчный монолит → 5 модулей в `js/core/webgl/`
- ✅ Единый компонент `IdeaCard` (DRY между home/profile/inspiration)
- ✅ CSS utility classes (.u-flex/.u-gap-N/.u-text-N/.sr-only)
- ⚠ Партиал `<head>` через JS-инжект — отложен (требует build-step; шрифты должны быть в HTML до парсинга, иначе FOUC)

### Priority 4 — продвинутые
- ✅ PWA: Service Worker + offline-кэш, manifest, install-prompt
- ✅ Светлая тема: toggle в шапке, `prefers-color-scheme` auto, сохранение в localStorage
- ✅ JSON-LD: Organization + WebSite на главной, CreativeWork+Person динамически для idea.html
- ✅ View Transitions API для плавных переходов между страницами (Chrome/Edge 126+, graceful degradation для Firefox/Safari)
- ⏳ Backend (Supabase) — архитектура готова, реализация по необходимости

### Брендинг и контент (`изменения контента и брендинга.txt`)
- ✅ Название: Jewerly of Soul (везде, включая og-теги и JSON-LD)
- ✅ Telegram @sdproz (везде)
- ✅ Email jewerlyofsoul25@gmail.com (везде, в т.ч. MASTER_EMAIL)
- ✅ Локация Ижевск, Россия (везде)
- ✅ Текст «личная мастерская · с 2025» в hero
- ✅ Контакты удобны на desktop (страница `contact.html`) и mobile (bottom-nav + drawer)
- ✅ Premium brand identity: favicon с лого, og-image с триптихом, золотые тонкие нити-разделители, дыхание hero, премиум-курсор

### Quick wins
- ✅ Контраст `--text-faint` поднят до AA (#807A72)
- ✅ `prefers-reduced-motion` уважается во всех анимациях
- ✅ Focus-ring единый через `--focus-ring`
- ✅ Tap-targets 44px на mobile
- ✅ Theme-color + manifest + iconset
- ✅ Sitemap.xml + robots.txt

### Визуальные «дизайн-фишки» сверх roadmap
- ✅ Scroll-reveal на всех страницах (staggered fade-up)
- ✅ Дыхание hero: 80-сек вращение браслета + 6-сек пульсация сияния
- ✅ Тонкие золотые нити-разделители между секциями
- ✅ Display-типографика (`.h-display-xl`, `.keynote-num`)
- ✅ Premium cursor: золотая точка + кольцо с инерцией, mix-blend-mode screen

---

## WebGL PBR-рендер · гибрид procedural + реальные текстуры

Каждый камень рисуется как «impostor sphere» во фрагментном шейдере:
1. **Нормаль сферы** считается из координат пикселя.
2. **Cook-Torrance / GGX** specular — настоящий PBR.
3. **Lambert diffuse** с двумя источниками (key + fill).
4. **Подповерхностное рассеяние** для прозрачных камней.
5. **Направленная ирисация** для лабрадорита/лунного/перламутра.
6. **Микрорельеф** через многооктавный FBM-шум.
7. **PNG-альбедо** (если есть `assets/stones/<id>.png`) подмешивается как цвет; шейдер сверху добавляет блик и тень.

Подробности по добавлению камней и генерации PNG — в `ASSETS_GUIDE.md`.

---

## Безопасность

Пароли хешируются SHA-256 + соль через WebCrypto. **Не production-уровень** — для боевого режима нужен bcrypt/argon2 на сервере. Сейчас уровень «mock-storage с консистентной структурой данных».

---

## Защита диплома — что подчеркнуть

- **WebGL PBR-рендер** (Cook-Torrance + GGX + Fresnel + SSS + iridescence), гибрид procedural и реальных PNG. 66 минералов, 21 редкий — особая подсветка. Архитектурно: 5 чистых модулей с разделением VS/FS/контекст/loader/render.
- **Чистая слоёная архитектура** — core / api / services / ui / pages. Контракты в `interfaces.js`. Дизайн под подключение backend без переписывания UI.
- **Полная локальная имитация сообщества** — seed-данные с 10 авторами и 30 идеями, работающие лайки/избранное/публикации.
- **Mock AI на правилах** — анализ доминант стихий/энергий, генерация описаний и названий. Архитектурно готов к замене на реальный LLM (одна правка в `js/api/local/aiApi.js`).
- **PWA с offline-режимом** — Service Worker, app-shell precache, three-стратегия кэширования (HTML network-first, CSS/JS stale-while-revalidate, PNG cache-first).
- **A11y по стандартам WCAG AA** — контраст, focus-trap в модалках, keyboard navigation, `prefers-reduced-motion`, tap-targets 44px.
- **SEO-готовность** — JSON-LD Organization + WebSite + динамическая CreativeWork, sitemap.xml, robots.txt, OG + Twitter Card на каждой странице.
- **Премиум-визуал** — дыхание hero, тонкие золотые разделители, scroll-reveal, premium-cursor, View Transitions, tilt-эффекты.
- **Без зависимостей** — ванильный JS, ES-модули, 0 npm-пакетов, 0 build-step. Деплой на GitHub Pages.

---

## Лицензия

MIT.
