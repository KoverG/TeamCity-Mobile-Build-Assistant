# TeamCity Mobile Build Assistant — универсальная интеграция с TeamCity

- Статус: обезличенный контракт интеграции, обязательный для публичного repository
- Дата исследования: 2026-08-08
- Последнее обновление: 2026-08-11

Связанные документы:

- [PRODUCT.md](PRODUCT.md) — продуктовые правила;
- [ARCHITECTURE.md](ARCHITECTURE.md) — границы компонентов и open-source-безопасность;
- [MVP_DELIVERY.md](MVP_DELIVERY.md) — технический spike и порядок реализации.

## 1. Принцип интеграции

Browser Extension обращается к TeamCity из уже авторизованной вкладки пользователя. Extension не запрашивает логин/пароль и не передаёт browser-session backend.

TeamCity origin определяется во время работы из `window.location.origin`. В source code, manifest matches, tests, документации и поставляемой конфигурации не фиксируется домен конкретной организации.

Интеграционная логика находится за интерфейсами:

- `TeamCityTransport` — безопасные read-only запросы в текущую инсталляцию;
- `CatalogLoader` — проекты и build configurations;
- `BuildConfigurationClassifier` — конфигурируемая классификация;
- `BuildFinder` — finished/successful builds и ручной поиск;
- `ArtifactResolver` — поиск APK/IPA в дереве artifacts.

## 2. Что подтверждено исследованием

Исследование на реальной TeamCity-инсталляции подтвердило только универсальные технические выводы:

1. Доступные mobile configurations могут быть вложены в многоуровневую иерархию проектов.
2. OS и Environment могут быть закодированы в display name и/или ID, но соглашения принадлежат организации и различаются между инсталляциями.
3. Нужные builds существуют как в default, так и в feature/release branches.
4. APK может лежать непосредственно в artifact tree.
5. APK и IPA могут лежать внутри контейнера `.nupkg`, доступного через вложенное artifact tree.
6. TeamCity может вернуть готовый `contentHref`; он предпочтительнее самостоятельной реконструкции URL.
7. Cleanup/retention policy может удалить ранее доступный build или artifact.
8. Официальный REST-контракт предоставляет `GET /app/rest/builds/{buildLocator}/artifacts` (`List all files`) с параметрами `basePath`, `locator`, `fields`, `resolveParameters` и `logBuildUsage`.

Имена реальных компаний, проектов, build configurations, branches, builds, файлов и URLs намеренно не сохраняются в публичных документах.

## 3. Runtime discovery вместо матрицы конкретного проекта

Extension загружает только те проекты и configurations, которые TeamCity показывает текущему пользователю. Нельзя предполагать фиксированное количество проектов, уровней и configurations.

Внутренняя нормализованная модель:

```text
TeamCityInstance
└── Project[]
    ├── id
    ├── name
    ├── parentProjectId?
    └── BuildConfiguration[]
        ├── id
        ├── name
        ├── projectId
        └── webUrl?
```

Пагинация обходится до конца по server-provided `nextHref`. Adapter не зависит от порядка полей и терпимо относится к дополнительным полям TeamCity.

## 4. Классификация Project / OS / Environment

Классификация не должна содержать названий конкретной компании. Она строится отдельным configurable profile со следующими источниками:

1. Явное пользовательское mapping для текущей TeamCity-инсталляции.
2. Настраиваемые regex/rule patterns для display name и buildType ID.
3. Безопасные общие эвристики для `android`, `ios`, распространённых environment labels.
4. Fallback на raw build configuration, если однозначная классификация невозможна.

Пример исключительно синтетического правила:

```text
^(?<product>.+)_mobile_(?<os>android|ios)_(?<environment>dev|stage|prod)$
```

Нераспознанная configuration не скрывается. UI показывает её как `Unclassified` и позволяет пользователю выбрать или локально сопоставить её. Неоднозначная classification блокирует автоматическое решение.

Профиль хранится локально на устройстве либо во внешней runtime-конфигурации. В repository могут находиться только синтетические default profiles.

## 5. Получение builds

Для выбранной build configuration загружаются только завершённые успешные builds из всех доступных branches.

Концептуальный locator:

```text
buildType:(id:<build-type-id>),state:finished,status:SUCCESS,branch:default:any
```

Запрашиваемые поля должны быть минимальными:

```text
id,buildTypeId,number,status,state,branchName,defaultBranch,finishDate,webUrl
```

Обязательные правила:

- использовать pagination/`nextHref`;
- не считать отсутствие `branchName` ошибкой;
- явно показывать branch в UI;
- сохранять server-provided build ID как opaque string;
- ручной поиск build number выполняется в выбранной configuration;
- не загружать artifact tree до выбора конкретного build.

## 6. Artifact API и доменная модель

Ответ TeamCity адаптируется к собственной модели:

```text
ArtifactNode
├── name
├── fullName
├── kind: File | Directory | Archive | Unknown
├── size?
├── contentHref?
└── childrenHref?
```

`ArtifactResolver` не должен зависеть от XML против JSON, конкретного имени wrapper-поля или структуры каталогов конкретной компании. Эти различия изолируются в REST DTO adapter.

## 7. Алгоритм ArtifactResolver

После выбора build:

1. Выполнить один bulk GET `GET /app/rest/builds/id:<build-id>/artifacts`.
2. Не задавать `basePath`, чтобы областью был artifact root.
3. Использовать целевой locator `recursive:true,browseArchives:true,pattern:**/*.apk` для Android или `recursive:true,browseArchives:true,pattern:**/*.ipa` для iOS и минимальные fields `count,file(name,fullName,href,content(href),children(count,href))`; передавать `resolveParameters=false` и `logBuildUsage=false`. `**/` обязателен: TeamCity использует Ant-style wildcards, а `*.apk`/`*.ipa` охватывает только текущий уровень и не находит файл глубже в directory/archive. Полученный результат дополнительно фильтровать на клиенте без учёта регистра.
4. Считать candidate только конечный файл с расширением `.apk` или `.ipa` без учёта регистра.
5. Для Android принимать только APK, для iOS — только IPA.
6. Использовать только server-provided `contentHref`; не реконструировать download URL при наличии этого поля.
7. Считать archive раскрытым bulk API, только если listing содержит его вложенные `!/` paths.
8. Если bulk endpoint недоступен, вернул пустой результат либо обнаружен нераскрытый archive/container, запустить bounded concurrent metadata/children traversal от artifact root.
9. Fallback дедуплицирует href/path и ограничивает depth, nodes, requests и concurrency. Каждый GET получает собственный timeout 30 секунд, а весь поиск ограничен отдельным общим `AbortController` timeout 120 секунд.
10. `.nupkg`, `.zip` и directory являются контейнерами, а не конечными результатами; весь `.nupkg` для поиска в browser не скачивается.
11. Вернуть `NotFound`, `Resolved` или `Ambiguous`.

Результаты:

- 0 candidates — build показывается, действия блокируются с объяснением;
- 1 candidate — разрешены copy/open/send;
- 2+ candidates — блокирующая ошибка конфигурации без автоматического выбора.

## 8. Синтетические artifact-сценарии

Следующие примеры описывают форму данных и не относятся к реальной организации.

### 8.1. APK напрямую

```text
artifacts/
└── android/
    └── release/
        └── example-mobile-12345.apk
```

### 8.2. APK внутри container

```text
example-mobile-android.1.0.12345.nupkg!/
└── artifacts/
    └── example-mobile-12345.apk
```

### 8.3. IPA внутри container

```text
example-mobile-ios.1.0.12345.nupkg!/
└── example-mobile-12345.ipa
```

Синтетические fixtures должны покрывать эти сценарии, а также пустое дерево, несколько candidates, превышение глубины, повторяющийся href и исчезнувший build.

## 9. Формирование direct URL

Используется TeamCity `contentHref`, если server его вернул. Если найденный через metadata файл не содержит `contentHref`, применяется подтверждённый runtime fallback на `repository/download` из выбранных build type ID, build ID и artifact path.

Обобщённая форма:

```text
<teamcity-origin>/repository/download/<build-type-id>/<build-id>:id/<artifact-path>
```

Для вложенного файла artifact path может содержать server-defined границу container, например:

```text
<archive-name>.nupkg!/<inner-path>
```

Правила:

- origin берётся только из runtime context;
- URL не хранится как constant или default setting;
- кодируются отдельные path segments с сохранением server-defined semantics;
- username/password в URL запрещены;
- backend принимает только HTTPS URL с origin, привязанным к текущему device;
- полный URL не попадает в application logs и telemetry.

## 10. Retention и устаревшие ссылки

Cleanup policy может удалить build после отправки ссылки. Поэтому:

- Telegram-ссылка не обещается как вечная;
- `Build/artifact больше не существует` отличается от auth/network errors;
- собственное архивное хранилище не входит в MVP;
- backend не кеширует APK/IPA.

## 11. Authentication/session detection

Перед основным запросом `SessionProbe` выполняет безопасный GET к endpoint текущего пользователя или server endpoint и проверяет:

- status code;
- финальный URL после redirects;
- `Content-Type`;
- соответствие body ожидаемому REST contract;
- не является ли body TeamCity login HTML.

Extension не читает cookie напрямую и никогда не передаёт browser-session backend.

## 12. Ошибки интеграции

Минимальная таксономия:

```text
NotAuthenticated
Forbidden
ProjectNotFound
BuildConfigurationNotRecognized
BuildNotFound
ArtifactNotFound
AmbiguousArtifact
ArtifactTraversalLimitExceeded
ArtifactExpired
TeamCityUnavailable
UnexpectedResponse
RequestTimeout
```

UI получает стабильный application error. В обычной production-сборке raw TeamCity body, URL и internal identifiers не показываются и не журналируются. Diagnostic-сборка по явному feature flag может временно показывать полный runtime URL и response body локально в открытой вкладке; cookies и request headers туда не попадают, данные не отправляются backend и не записываются в repository.

## 13. Обязательный diagnostic spike

Первый прототип должен подтвердить на открытой TeamCity-вкладке:

1. Какой Extension context корректно использует browser-session.
2. Фактическую форму catalog/build/artifact responses.
3. Builds из нескольких branches с `branch:default:any`.
4. Root artifact response для APK напрямую.
5. Root и nested responses для archive/container.
6. IPA response.
7. Response без авторизации/при истёкшей сессии.
8. Pagination/`nextHref`.

### 13.1. Состояние spike на 2026-08-11

Реализован production-shaped диагностический vertical slice:

- runtime origin определяется из активной HTTPS-вкладки, без фиксированного TeamCity host;
- Manifest V3 запрашивает доступ только к origin, на котором пользователь явно активировал extension;
- `TeamCityTransport` сначала выполняет credentialed GET из service worker и при несовместимости browser-session безопасно повторяет GET в main world той же вкладки;
- поддерживаются `SessionProbe`, пагинируемый каталог build configurations, `SUCCESS + finished` builds из всех branches и bulk-first поиск artifacts с ограниченным fallback;
- raw responses, cookies и полные runtime URLs не сохраняются и не отправляются backend;
- synthetic tests покрывают JSON/HTML/XML classification, catalog/build pagination, classifier, origin-scoped selection, прямой APK, вложенный IPA, нераскрытый archive fallback, большой bulk listing, timeout и несколько candidates.
- отдельная diagnostic build под feature flag показывает локальный журнал UI-действий, status, transport, duration, раскрываемые полные runtime URL и response bodies. Cookies и request headers не читаются; журнал существует только в памяти вкладки, а JSON-копия открывается исключительно по явной кнопке пользователя и не должна добавляться в repository.

На авторизованной реальной сессии read-only GET подтвердил endpoint текущего пользователя и каталог build configurations. Реальные identifiers, names, origin и response bodies не сохранены. Встроенный исследовательский браузер блокирует прямую навигацию к collections builds, поэтому окончательный выбор transport и реальные build/artifact shapes должны быть подтверждены через unpacked extension в Chrome и Edge.

Текущий transport считается безопасным provisional-решением, а не окончательно подтверждённым контрактом: fallback остаётся изолирован внутри `TeamCityTransport` и может быть удалён после browser matrix.

### 13.2. Bulk artifacts research на 2026-08-11

Официальный TeamCity REST reference подтверждает endpoint `GET /app/rest/builds/{buildLocator}/artifacts` как bulk `List all files` и перечисляет поддерживаемые параметры `basePath`, `locator`, `fields`, `resolveParameters`, `logBuildUsage`. Реальная авторизованная browser-session и доступ к catalog были повторно подтверждены read-only GET без сохранения response bodies.

Встроенный исследовательский browser блокирует навигацию к build REST endpoints до отправки запроса, поэтому способность конкретной используемой TeamCity-версии раскрывать файлы внутри `.nupkg` одним bulk response остаётся runtime-проверкой unpacked Extension. Resolver проверяет это по наличию `!/` paths: при раскрытии завершает поиск после bulk response, при отсутствии запускает ограниченный fallback. Реальные origin, configuration/build IDs, names, branches, filenames и response bodies не сохранены.

### 13.3. Работа с реальными данными

Raw responses разрешено хранить только временно локально вне repository. Запрещено помещать их в Git даже в private branch.

Перед добавлением fixture разработчик:

1. Создаёт минимальный синтетический JSON/XML вручную или генератором contract fixtures.
2. Заменяет все origins, project/build IDs, numbers, names, branches, paths, usernames и timestamps синтетическими значениями.
3. Удаляет headers, cookies, tokens и поля, не нужные тесту.
4. Проверяет fixture secret scanner и tenant-data denylist scanner.
5. Просматривает staged diff перед commit.

Screenshots реальной TeamCity, HAR-файлы, browser profiles и debug logs не являются fixtures и никогда не коммитятся.

## 14. Критерии универсальности TeamCity adapter

Adapter готов только если:

- установка на новый TeamCity origin не требует изменения source code;
- список проектов/configurations загружается во время работы;
- organization-specific naming задаётся внешним profile;
- нераспознанная configuration остаётся доступной пользователю;
- artifact search не зависит от имени package, каталогов или обязательного `.nupkg`;
- tests используют только synthetic fixtures;
- repository scan не находит private origins и tenant identifiers.

## 15. Официальные справочные материалы

- [TeamCity REST API authentication and CORS](https://www.jetbrains.com/help/teamcity/rest/teamcity-rest-api-documentation.html)
- [TeamCity build locators](https://www.jetbrains.com/help/teamcity/rest/buildlocator.html)
- [TeamCity branches](https://www.jetbrains.com/help/teamcity/rest/get-build-details.html)
- [TeamCity artifacts](https://www.jetbrains.com/help/teamcity/rest/manage-finished-builds.html)
