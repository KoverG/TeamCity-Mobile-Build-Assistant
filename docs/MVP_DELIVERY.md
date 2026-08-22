# TeamCity Mobile Build Assistant — план реализации MVP

- Статус: руководящий delivery plan
- Дата фиксации: 2026-08-08
- Последнее обновление: 2026-08-22 (версия 1.2.0)

Связанные документы:

- [PRODUCT.md](PRODUCT.md) — что и зачем создаётся;
- [ARCHITECTURE.md](ARCHITECTURE.md) — компоненты и безопасность;
- [TEAMCITY_INTEGRATION.md](TEAMCITY_INTEGRATION.md) — TeamCity-контракты и fixtures.

## 1. Принцип реализации

Разработка идёт вертикальными проверяемыми этапами. Каждый этап должен сохранять рабочий базовый TeamCity-сценарий и завершаться автоматическими и ручными проверками затронутой области.

Repository считается публичным с первого дня. Source, tests, fixtures, docs, logs и staged diff проверяются на secrets, private URLs и tenant-specific данные. Отладка реального TeamCity выполняется только с локальными ignored-данными; в Git попадают исключительно синтетические контракты.

## 2. Структура repository

```text
TeamCityHelper/
├── backend/
│   ├── src/TeamCityHelper.Api/
│   └── tests/TeamCityHelper.Api.Tests/
├── extension/
│   ├── public/
│   ├── src/
│   │   ├── additional-actions/
│   │   ├── background/
│   │   ├── content/
│   │   ├── diagnostics/
│   │   ├── storage/
│   │   └── teamcity/
│   └── package.json
├── docs/
├── scripts/
└── TeamCityHelper.sln
```

Backend foundation не является runtime-зависимостью расширения. Прикладной server API дополнительных действий разрабатывается отдельной итерацией.

## 3. Foundation

Реализованы:

- solution и проекты .NET;
- Manifest V3 extension;
- TypeScript, React, Vite, lint и tests;
- production и diagnostic build modes;
- health endpoints backend foundation;
- `.gitignore`, public safety scan и правила безопасной диагностики.

Acceptance criteria:

- extension и backend собираются в чистом окружении;
- production build не включает diagnostic runtime;
- tracked-файлы не содержат secrets или реальных TeamCity данных;
- версии extension синхронизированы в package и manifest.

## 4. TeamCity transport и каталог

Реализованы:

- runtime origin discovery;
- optional host permission для текущего HTTPS origin;
- service-worker transport и ограниченный MAIN-world fallback;
- нормализация REST paths;
- bounded timeout и maximum response size;
- загрузка projects и build configurations;
- классификация OS и Environment;
- tolerant parsing синтетических response contracts.

Acceptance criteria:

- browser-session используется без чтения cookie;
- cross-origin и неподдерживаемые paths отклоняются;
- catalog/search errors имеют стабильные безопасные сообщения;
- TeamCity credentials и raw responses не попадают в storage и production logs.

## 5. Поиск builds и artifacts

Реализованы:

- фильтры Project/Platform/Environment;
- поиск по части task branch и точному публичному build number;
- ограничение количества builds и concurrency;
- bulk-first artifact listing;
- bounded recursive fallback для архивов;
- поиск APK/IPA без учёта регистра;
- использование server-provided `contentHref`;
- состояния `Resolved`, `NotFound` и `Ambiguous`;
- отмена и timeout через `AbortController`.

Acceptance criteria:

- 0 candidates не создаёт карточку результата;
- ровно 1 candidate создаёт карточку;
- 2+ candidates не приводят к автоматическому выбору;
- `.nupkg` не выдаётся как конечный artifact;
- resolver не уходит в бесконечный обход и не скачивает архив целиком;
- large synthetic listing обрабатывается в пределах установленных limits.

## 6. Базовый UI

Реализованы:

- launcher и встроенная Shadow DOM панель;
- фильтры и два режима поиска;
- история запросов по TeamCity origin;
- drawer результатов с loading/empty/error states;
- остановка активного поиска с переходом в empty state;
- сброс рабочей UI-сессии при закрытии панели с сохранением истории запросов;
- сортировка и множественный выбор builds;
- копирование одной или нескольких ссылок;
- открытие build и artifact через проверенный service-worker contract;
- keyboard/focus semantics и reduced motion;
- diagnostic console только для diagnostic build.

Базовый UI не вызывает собственный backend. Ошибки или отсутствие backend foundation не влияют на TeamCity-сценарии.

## 7. Универсальные дополнительные действия

Версия 1.2.0 добавляет frontend-архитектуру без server API:

- единый `AdditionalActionsService`;
- injected `AdditionalActionsGateway`;
- пустой `NullAdditionalActionsGateway` в production composition root;
- один React provider для всех placement-слотов;
- placements `assistant-toolbar` и `build-results`;
- локальный allowlist универсальных иконок;
- ограниченные descriptors и context-типы;
- единый execution path с request ID;
- динамический toolbar/footer без пустых областей.

Acceptance criteria:

- базовая сборка не выполняет сетевых запросов дополнительных действий;
- пустой gateway не создаёт кнопки, gaps или disabled-состояния;
- synthetic gateway может добавить действия в оба placement;
- descriptors с неизвестным placement, icon, context, duplicate ID или превышением limits отклоняются целиком;
- action выполняется только через общий service;
- неизвестный action ID и несовместимый context не передаются gateway;
- выбор build преобразуется в минимальную внутреннюю ссылочную модель без cookie и tokens;
- добавление нового UI placement не создаёт отдельный API-клиент.

## 8. Будущий сетевой gateway

Не входит в версию 1.2.0:

- адрес и transport собственного backend;
- внешний JSON/API contract;
- authentication и entitlement;
- цифровая подпись, cache и срок действия ответа;
- idempotency на стороне backend;
- прикладная интеграционная логика;
- privacy disclosure и пользовательское подтверждение передачи данных.

Эти решения принимаются вместе с разработкой backend. Новый adapter подключается к существующему `AdditionalActionsService`, не меняя TeamCity-модули и UI-слоты.

## 9. Стратегия тестирования

### Extension unit tests

- classifier и build filters;
- удаление legacy selection и search history storage;
- TeamCity transport и response classification;
- artifact traversal, limits и URL handling;
- validation и выполнение дополнительных действий;
- пустой и synthetic gateway.

### Extension integration tests

- Shadow DOM mounting;
- основная панель и drawer результатов;
- filters/search/results lifecycle;
- copy/open/download actions;
- toolbar и result placements;
- отсутствие пустой геометрии при нуле дополнительных действий;
- сохранение базового поведения при ошибке gateway.

### Backend foundation tests

- assembly и configuration foundation;
- liveness/readiness endpoints после появления соответствующего integration harness;
- отсутствие зависимости extension tests от запущенного backend.

### Manual browser matrix

| Сценарий | Chrome | Edge | Яндекс |
|---|---:|---:|---:|
| Установка unpacked | обязательно | обязательно | обязательно |
| TeamCity session GET | обязательно | обязательно | обязательно |
| Shadow DOM UI | обязательно | обязательно | обязательно |
| Local storage | обязательно | обязательно | обязательно |
| Copy/open/download direct link | обязательно | обязательно | обязательно |
| Пустые additional-action slots | обязательно | обязательно | обязательно |

## 10. Риски и меры

| Риск | Мера |
|---|---|
| TeamCity cookies недоступны service worker | Ограниченный MAIN-world fallback без чтения cookie |
| TeamCity REST response меняется | Tolerant adapter и synthetic contract fixtures |
| Naming convention меняется | Configurable classifier и `Unclassified` fallback |
| DOM TeamCity меняется | Shadow DOM и изолированные integration boundaries |
| Artifact tree большой | Bulk listing, bounded fallback, limits, timeout и deduplication |
| Несколько APK/IPA | Блокирующий `Ambiguous`, без авто-выбора |
| Artifact удалён cleanup policy | Понятная not-found ошибка без обещания вечной ссылки |
| Gateway недоступен | Пустой список действий; базовый UI продолжает работать |
| Descriptor повреждён | Fail-closed validation всего набора |
| UI разрастается от новых действий | Ограничение placements и числа действий в каждом слоте |
| Реальные данные попадают в Git | Ignored captures, synthetic fixtures и public safety scan |

## 11. Definition of Done версии 1.2.0

Версия готова, когда:

1. Пользователь устанавливает Extension и открывает панель в авторизованном TeamCity.
2. Выбирает Project, Platform и Environment и выполняет поиск.
3. Получает однозначный APK/IPA при прямом или вложенном размещении.
4. Видит понятные ошибки при отсутствующем или неоднозначном artifact.
5. Копирует ссылки, открывает build и начинает скачивание artifact.
6. Все базовые сценарии работают без собственного backend.
7. В базовом UI отсутствуют неработающие внешние действия и пустые места от них.
8. `AdditionalActionsService` централизует все frontend placements.
9. Production gateway не выполняет сетевых запросов и возвращает пустой список.
10. Synthetic gateway подтверждает подключаемость toolbar и result actions.
11. TeamCity credentials/cookies не покидают браузер.
12. Chrome, Edge и Яндекс проходят согласованную manual matrix.
13. Typecheck, lint, tests, diagnostic/production builds и .NET tests проходят.
14. Source, tests, fixtures, docs, config и distributive проходят public safety scan.
15. Подключение другой TeamCity-инсталляции не требует изменения source code.

## 12. После версии 1.2.0

Следующий backlog:

1. Согласовать и реализовать один сетевой gateway дополнительных действий.
2. Добавлять новые placement-слоты без дублирования server transport.
3. Определить versioned server contract, authentication, cache и idempotency.
4. Добавить пользовательское подтверждение для действий, передающих данные.
5. Расширить classification profiles и поддержку TeamCity origins.
6. Рассмотреть Store или enterprise distribution.
