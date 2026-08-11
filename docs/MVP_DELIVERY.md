# TeamCity Mobile Build Assistant — план реализации MVP

- Статус: руководящий delivery plan
- Дата фиксации: 2026-08-08
- Последнее обновление: 2026-08-11

Связанные документы:

- [PRODUCT.md](PRODUCT.md) — что и зачем создаётся;
- [ARCHITECTURE.md](ARCHITECTURE.md) — компоненты и безопасность;
- [TEAMCITY_INTEGRATION.md](TEAMCITY_INTEGRATION.md) — TeamCity-контракты и fixtures.

## 1. Принцип реализации

Разработка идёт вертикальными проверяемыми этапами. Сначала снимаются оставшиеся технические неопределённости TeamCity browser-session, затем создаётся основной продукт.

Нельзя начинать с полной UI-реализации, пока диагностический spike не подтвердил реальный транспорт и REST response shapes.

Repository считается публичным с первого дня. Ни один этап не может считаться завершённым, пока source, tests, fixtures, docs, logs и staged diff не проверены на secrets, private URLs и tenant-specific данные. Отладка на реальной TeamCity выполняется только с локальными ignored-данными; в Git попадают исключительно синтетические контракты.

## 2. Планируемая структура repository

```text
TeamCityHelper/
├── TeamCityHelper.sln
├── docs/
├── extension/
│   ├── src/
│   ├── tests/
│   ├── manifest/
│   └── package.json
├── backend/
│   ├── src/
│   ├── tests/
├── deploy/
│   └── docker-compose.yml
└── README.md
```

Физическая структура может уточняться, но границы Extension/Backend/Deploy сохраняются.

## 3. Этап 0 — foundation

Результат:

- базовая структура repository;
- Extension build на TypeScript/React/Vite/Manifest V3;
- Shadow DOM launcher внутри TeamCity;
- ASP.NET Core solution и test projects;
- общие conventions, lint/format/test commands;
- `.gitignore` без secrets, build artifacts, `.idea`, `bin`, `obj`, local SQLite;
- локальная конфигурация без production secrets;
- `.env.example` только с нерабочими placeholders;
- pre-commit/CI secret scanning и tenant-data scanning;
- synthetic fixture factory без данных реальной организации;
- документированная процедура безопасного diagnostic capture и sanitization;
- выбранная open-source-лицензия и файл `LICENSE` до первой публичной публикации;
- `SECURITY.md` с безопасным приватным каналом для сообщений об уязвимостях до приёма внешних пользователей.

Проверка:

- Extension собирается;
- backend собирается и запускает health endpoint;
- tests запускаются одной документированной командой;
- unpacked Extension устанавливается в Chrome и Edge;
- scan текущего дерева и всей существующей Git history не находит secrets, private origins и tenant identifiers.

## 4. Этап 1 — TeamCity diagnostic spike

Цель: закрыть последние неизвестные до основной реализации.

Spike Extension:

- работает только на открытой TeamCity-вкладке;
- определяет origin;
- выполняет read-only REST GET с существующей browser-session;
- не использует `chrome.cookies`;
- не сохраняет raw responses; при ручном исследовании разрешено только временное локальное хранение вне repository;
- создаёт для tests отдельные минимальные synthetic fixtures вместо копирования реальных responses;
- проверяется в Chrome и Edge, затем в Яндекс Браузере.

Обязательные сценарии:

1. Текущий пользователь авторизован.
2. Сессия отсутствует/истекла.
3. Полный список build configurations.
4. `SUCCESS + finished` builds с `branch:default:any`.
5. Ручной поиск build number.
6. Artifact root для прямого APK.
7. Nested artifact children для `.nupkg`.
8. IPA внутри `.nupkg`.

Решение этапа:

- выбрать `TeamCityTransport` (service worker или page/content context);
- зафиксировать REST DTO adapter;
- документировать session detection.

Spike не превращается в отдельный продукт: подтверждённые части переносятся в production modules либо удаляются.

Текущий прогресс этапа на 2026-08-11:

- [x] runtime origin и optional host permission;
- [x] service-worker transport с same-tab main-world fallback;
- [x] session detection и каталог build configurations;
- [x] build locator `SUCCESS + finished + branch:default:any`;
- [x] bulk-first artifact listing и ограниченный fallback для прямых и вложенных APK/IPA;
- [x] synthetic unit/UI tests и production build;
- [x] read-only подтверждение авторизованной сессии и catalog shape;
- [ ] unpacked browser matrix и подтверждение JSON transport;
- [ ] реальные build/artifact shapes без сохранения tenant data;
- [ ] expired-session сценарий.

## 5. Этап 2 — каталог и выбор build

Реализуется vertical slice:

```text
Open panel
→ SessionProbe
→ Load build configurations
→ Classify Project/OS/Environment
→ Select configuration
→ Load successful finished builds from all branches
→ Select build / search by number
```

UI-состояния:

- initial;
- loading;
- not authenticated;
- forbidden;
- empty catalog;
- no builds;
- loaded;
- TeamCity unavailable;
- unexpected response.

Acceptance criteria:

- доступны все mobile project hierarchies, разрешённые текущему пользователю;
- configurations обнаруживаются динамически, без фиксированного количества и hardcoded IDs;
- выбор каскадный;
- branch виден у каждого build;
- default branch не исключает feature branches;
- пользователь сам выбирает build;
- номер build можно ввести вручную;
- checkbox корректно хранит/удаляет selection;
- нераспознанная configuration видна как `Unclassified`, а не исчезает;
- новая TeamCity-инсталляция не требует изменения source code.

## 6. Этап 3 — ArtifactResolver

Реализуется bulk-first поиск выбранного build. Основной путь — один `GET /app/rest/builds/{buildLocator}/artifacts` с минимальными fields; bounded metadata/children traversal используется только для TeamCity-версий и archive shapes, которые bulk listing не раскрывает.

Acceptance criteria:

- найден APK в synthetic fixture с прямым размещением;
- найден APK в synthetic fixture с вложенным размещением;
- найден IPA в synthetic fixture с вложенным размещением;
- `.nupkg` не выдаётся как конечный artifact;
- 0 candidates блокирует действия;
- 2+ candidates блокируют действия;
- URL сохраняет `!/` и корректное encoding;
- Android `.apk` и iOS `.ipa` фильтруются без учёта регистра;
- используется server-provided `contentHref`, а при его отсутствии — проверенный runtime fallback `repository/download`;
- synthetic large listing обрабатывается одним bulk request;
- нераскрытый archive включает ограниченный concurrent fallback;
- общий timeout отменяет поиск через `AbortController` и даёт понятную ошибку;
- `.nupkg` не скачивается целиком только ради поиска вложенного файла;
- resolver не уходит в бесконечный обход;
- превышение limits даёт понятную ошибку;
- поиск запускается только после выбора build.

## 7. Этап 4 — Backend foundation и Telegram pairing

Реализуются:

- SQLite schema/migrations;
- Telegram webhook;
- pairing request;
- Telegram `/start <code>`;
- polling статуса pairing;
- выдача device token;
- hash token storage;
- несколько active devices;
- revoke-ready data model;
- автоматический `Active` entitlement.

Acceptance criteria:

- code одноразовый и истекает;
- повторное использование code запрещено;
- raw code/token отсутствуют в logs/DB;
- пользователь получает личное подтверждение pairing;
- повторный pairing добавляет device и не деактивирует остальные;
- чужой device не может получить результат pairing.

## 8. Этап 5 — отправка build link

Реализуется команда `SendBuildLink`:

```text
Authenticate device
→ Check entitlement
→ Validate structured TeamCity link
→ Rate limit
→ Idempotency
→ Format message
→ Telegram sendMessage
```

Acceptance criteria:

- сообщение приходит в личный chat paired пользователя;
- содержит Project, OS, Environment, build number/date, branch и URL;
- backend не принимает произвольный `chat_id`;
- URL другого origin отклоняется;
- не-APK/IPA URL отклоняется;
- повторный `Idempotency-Key` не создаёт второе сообщение;
- два разных devices одного account могут отправлять по одному запросу;
- expired/revoked device отклоняется;
- отсутствие entitlement отклоняется backend независимо от UI.

## 9. Этап 6 — интеграция UX

Реализуются:

- onboarding;
- Telegram connection state;
- кнопки copy/open/send;
- success/error notifications;
- retry безопасных GET;
- защита от двойного клика send;
- корректное состояние при исчезнувшем artifact;
- минимальная доступность keyboard/focus/labels.

UI не показывает raw exception или TeamCity XML/HTML.

## 10. Этап 7 — deployment

Backend разворачивается на VPS как отдельный isolated service.

Checklist:

- отдельный hostname;
- HTTPS certificate;
- отдельный Docker Compose project/network/volume;
- secrets вне repository/image;
- SQLite backup;
- Telegram webhook secret;
- resource limits;
- health checks;
- restart policy;
- log rotation;
- запрет публичного доступа к SQLite/служебным портам;
- smoke test pairing и отправки.

Extension для MVP распространяется как unpacked build с короткой инструкцией установки. Публикация в store или enterprise deployment принимается отдельным решением после MVP.

## 11. Стратегия тестирования

### Extension unit tests

- classifier;
- build filters;
- selection persistence;
- session response classification;
- artifact traversal;
- URL handling;
- backend DTO validation.

### Extension integration tests

- captured TeamCity fixtures;
- Shadow DOM mounting;
- cascading selectors;
- expired session state;
- direct/nested artifacts;
- DOM integration adapter.

### Backend unit tests

- pairing expiry/one-time semantics;
- token hashing/authentication;
- entitlement policy;
- link validator;
- idempotency;
- message formatter;
- rate-limit keys.

### Backend integration tests

- EF Core SQLite migrations;
- webhook handling;
- pairing end-to-end без реальной оплаты;
- Telegram client через fake HTTP handler;
- concurrent idempotent requests;
- restart с сохранённым SQLite state.

### Manual browser matrix

| Сценарий | Chrome | Edge | Яндекс |
|---|---:|---:|---:|
| Установка unpacked | обязательно | обязательно | обязательно |
| TeamCity session GET | обязательно | обязательно | обязательно |
| Shadow DOM UI | обязательно | обязательно | обязательно |
| Local storage | обязательно | обязательно | обязательно |
| Telegram pairing | обязательно | обязательно | обязательно |
| Copy/open direct link | обязательно | обязательно | обязательно |

## 12. Риски и меры

| Риск | Мера |
|---|---|
| TeamCity cookies не отправляются из выбранного Extension context | Этап 1 выбирает transport по фактическому поведению |
| TeamCity REST response меняется | Adapter + synthetic contract fixtures + tolerant parsing |
| Naming convention меняется | Отдельный configurable classifier profile |
| DOM TeamCity меняется | Shadow DOM + изолированный page adapter + feature flag |
| Artifact tree большой | Bulk listing как основной путь; bounded concurrent fallback, limits, timeout, deduplication href |
| Несколько APK/IPA | Блокирующая `AmbiguousArtifact`, без авто-выбора |
| Artifact удалён retention policy | Понятная expired/not found ошибка, без обещания вечной ссылки |
| Telegram endpoint используется для спама | Pairing/device auth, rate limit, entitlement, device-bound origin, idempotency |
| Device token украден | HTTPS, hash at rest, revoke, отсутствие token в logs |
| VPS-проекты влияют друг на друга | Изолированные container/network/volume/secrets/resources |
| Яндекс отключает unpacked extension | MVP-тест; затем store/enterprise решение |
| Данные реального TeamCity попадают в публичный Git | Ignored raw captures, synthetic fixtures, pre-commit/CI scanning, staged/history review |
| Код зависит от домена или naming одной компании | Runtime origin discovery, optional permissions, configurable classifier и `Unclassified` fallback |

## 13. Definition of Done MVP

MVP готов, когда:

1. Пользователь устанавливает Extension по документированной инструкции.
2. В авторизованном TeamCity видит плавающую кнопку и панель.
3. Выбирает Project, OS, Environment и успешный завершённый build из любого branch.
4. Может найти build по номеру.
5. Получает однозначный APK/IPA при прямом или вложенном размещении.
6. Видит понятные ошибки при отсутствующем/неоднозначном artifact.
7. Один раз связывает Telegram account.
8. Отправляет ссылку в личный Telegram chat.
9. Повтор запроса не создаёт дубль.
10. Все backend send paths проверяют entitlement.
11. TeamCity credentials/cookies не покидают браузер.
12. Telegram Bot Token отсутствует в Extension/repository/logs.
13. Chrome, Edge и Яндекс проходят согласованную manual matrix.
14. Backend изолированно работает на VPS, имеет health checks и backup.
15. Build, tests и lint проходят документированными командами.
16. Source, tests, fixtures, docs, config и вся Git history прошли secret/tenant-data scan.
17. В repository нет реальных TeamCity URLs, company/project/build IDs, branches, artifact paths, персональных данных и operational secrets.
18. Подключение другой TeamCity-инсталляции не требует изменения или пересборки source code.

## 14. После MVP

Следующий backlog:

1. Кнопки возле builds в TeamCity UI.
2. Поиск по task branch и группировка builds одной задачи.
3. Множественный выбор builds/environments.
4. Управление devices.
5. Платные subscriptions.
6. UI управления несколькими TeamCity origins для одного device/account.
7. Отдельный Web UI.
8. Store или enterprise distribution Extension.
