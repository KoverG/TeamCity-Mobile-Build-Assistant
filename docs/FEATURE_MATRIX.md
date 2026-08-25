# Матрица функций TeamCity Mobile Build Assistant

Версия аудита: **1.4.0**
Дата аудита: **25 августа 2026 года**

Матрица составлена по фактической реализации расширения, production- и diagnostic-сборкам, Manifest V3 и автоматическим тестам. Реальные TeamCity URL, identifiers, ветки и артефакты при проверке не сохранялись.

## Статусы

- **Работает** — основной сценарий подтверждён автоматическими проверками.
- **Работает с ограничениями** — основной сценарий подтверждён, но есть известные границы или обязательная ручная проверка.
- **Не подтверждено** — реализация существует, но end-to-end сценарий не проверен.
- **Требует исправления** — заявленный сценарий фактически не реализован.

## Пользовательские функции

| ID | Функция и бизнес-назначение | Точка входа и успешный сценарий | Альтернативные состояния, остановка и ошибки | Визуальная обратная связь | Статус |
|---|---|---|---|---|---|
| F01 | Активация расширения на TeamCity | Нажатие иконки расширения запрашивает доступ к текущему HTTPS-origin, регистрирует и запускает content script | Отказ permission или HTTP-страница прекращают активацию; повторная активация не должна дублировать регистрацию | При неудаче есть только предупреждение в консоли | Не подтверждено end-to-end |
| F02 | Встраивание лаунчера | Content script создаёт один Shadow DOM и прикрепляет хлястик к навигации TeamCity | После замены header лаунчер присоединяется повторно; при отсутствии header остаётся скрытым | Хлястик Mobile Build Assistant | Работает |
| F03 | Положение и состояние лаунчера | Лаунчер перемещается pointer- и keyboard-вводом, закрепляется слева или справа и сворачивается | Положение ограничено viewport; отменённый drag возвращает безопасное состояние | Анимация перемещения и сворачивания | Работает |
| F04 | Открытие и закрытие ассистента | Кнопка лаунчера открывает панель и при первом запуске загружает каталог | Закрытие завершённой сессии сбрасывает параметры; активный поиск завершается в фоне, затем состояние очищается | Панель и ARIA-состояния | Работает |
| F05 | Проверка сессии и каталог TeamCity | Проверяется текущий пользователь, затем постранично загружаются build configurations | Валидные строки частичного каталога сохраняются; отсутствие авторизации, forbidden, timeout и неверный contract показывают ошибку | Placeholder, refresh loader, warning или error с повтором | Работает с лимитом 20 страниц каталога |
| F06 | Классификация проектов, платформ и окружений | ID и название конфигурации классифицируются как Android, iOS и известное окружение | Неизвестные или неоднозначные значения попадают в Unclassified; возможен кодовый профиль установки | Проекты, окружения и кнопки платформ | Работает с ограничениями эвристики |
| F07 | Фильтры поиска | Пользователь выбирает один проект и несколько платформ или окружений; пустой список означает «все» | Смена проекта очищает запросы и фильтры; изменение локальных фильтров останавливает активный Refresh | Multi-select, disabled-состояния и aria-pressed | Работает |
| F08 | Поиск и доступные варианты | Частичное совпадение ветки либо точный публичный номер build; после выбора проекта подсказки загружаются прогрессивно и фильтруются локально | Refresh, Stop, partial и error states; dropdown показывает не более 50 совпадений | Переключатель режима, чипы «Текущие данные»/«История поиска», loader | Работает |
| F09 | История запросов | Непустые task/build-запросы сохраняются раздельно сразу после запуска поиска | Запись остаётся после пустого результата, ошибки или Stop; дубликаты поднимаются вверх; максимум 5 записей | Чип истории и отдельная очистка текущего режима | Работает |
| F10 | Прогрессивный поиск всех сборок | Один объединённый locator, страницы по 50; карточки появляются сразу, поиск продолжается до конца | Пользовательского лимита 20 нет; повторяющаяся nextHref блокируется; аварийный предел — 1000 страниц; ошибка следующей страницы сохраняет найденное | Растущий счётчик и loader вместо bulk-копирования | Работает с обязательной реальной проверкой locator |
| F11 | Платформа «Другие» | Для неклассифицированной конфигурации проверяются APK и IPA | Пустой результат пропускается; несколько платформ или файлов считаются неоднозначными без угадывания | Предупреждение о неоднозначности | Работает |
| F12 | Остановка и обновление поиска | Stop отменяет активные запросы; refresh каталога сначала отменяет поиск | Уже найденные карточки сохраняются; поздние ответы игнорируются | Toast «Поиск остановлен» | Работает |
| F13 | Drawer результатов | Открывается при поиске; пользователь может открыть, скрыть или перетащить drawer | Скрытый drawer получает inert; закрытие сбрасывает локальную UI-сессию результатов | Боковая ручка и анимация | Работает с неполным behavioural coverage |
| F14 | Loading, empty, not-found, partial и error states | Для каждого состояния используются отдельные представления | Частичные ошибки сохраняют карточки и предлагают повтор; полная ошибка показывает error state | Маскоты, loader, warning, alert и toast | Работает |
| F15 | Сортировка и выбор сборок | Результаты сортируются по времени; карточки включаются или исключаются из общей операции | Без выбора общая операция использует все результаты; новый поиск очищает выбор | Подсветка и кнопка сортировки | Работает с неполным тестовым покрытием |
| F16 | Копирование ссылок | Индивидуальная кнопка копирует одну ссылку; footer копирует выбранные или все результаты | Ошибка Clipboard API показывает toast; bulk-копирование недоступно до завершения поиска | Success/error toast | Работает с ограничениями тестового покрытия |
| F17 | Открытие build | Нажатие номера открывает trusted viewLog.html в неактивной вкладке того же окна | Некорректный ID, HTTP-source и ошибка tabs API отклоняются | Error toast при неудаче | Работает |
| F18 | Открытие и скачивание артефакта | Контекстное действие открывает серверный contentHref в неактивной вкладке | Cross-origin, HTTP-source и неправильная ссылка блокируются | Размер файла и toast результата | Работает |
| F19 | Поиск APK/IPA и bounded fallback | Сначала используется bulk listing и server-provided contentHref, затем ограниченный metadata/archive fallback | NotFound, Ambiguous, timeout, неверный contract и traversal limits обрабатываются явно | Карточка только для единственного надёжного результата | Работает с намеренными safety-лимитами |
| F20 | Дополнительные действия | Архитектура поддерживает до 8 внешних действий, максимум 2 на placement | По умолчанию gateway пустой; неправильные descriptors и context закрываются fail-closed | Pending, «Готово», «Ошибка», «Недоступно» | Работает как extension point; интеграций нет |
| F21 | Toolbar, settings и theme controls | Refresh, закрытие панели и раскрытие дополнительных контролов работают | Тёмная тема и меню настроек помечены «скоро» и недоступны | Анимация settings/theme | Работает частично |
| F22 | Диагностическая консоль | В diagnostic/dev build показывает UI и TeamCity events; журнал очищается или открывается временным JSON | В production отключена; максимум 200 событий и 12 млн символов | Консоль с уровнями и раскрываемыми деталями | Работает только как диагностический инструмент |
| F23 | Адаптивность и доступность | Реализованы keyboard navigation, ARIA, focus states, reduced-motion и Shadow DOM isolation | Основная панель и результаты имеют фиксированную ширину 400 px; формального screen-reader и contrast аудита нет | Focus rings и ARIA states | Работает с ограничениями |
| F24 | Backend health API | Корневой, liveness- и readiness-endpoints возвращают инфраструктурный статус | Возможен опциональный HTTPS redirect | HTTP status | Работает; расширение backend не использует |

## Технические слои и подтверждение

| ID | Основные модули и слои | Источник данных | Storage и permissions | Автоматические проверки | Риски и ручная проверка |
|---|---|---|---|---|---|
| F01 | `background/main.ts`, Manifest V3 | URL активной вкладки | activeTab, scripting, optional HTTPS host permission | Прямого теста chrome.action.onClicked нет | Установка, grant/deny и перезапуск браузера |
| F02 | `content/main.tsx`, `TeamCityNavTab` | DOM TeamCity | Нет | TeamCityNavTab, assetUrl | Несколько версий TeamCity и замена header |
| F03 | NavTab geometry и visual | DOM и viewport | chrome.storage.local по origin | TeamCityNavTab, LauncherStorage | Drag слева/справа и browser zoom |
| F04 | `App`, `AssistantWorkspace`, controller | Локальное React-state | История сохраняется, параметры сессии сбрасываются | App integration tests | Быстрое закрытие и повторное открытие |
| F05 | SessionProbe, CatalogLoader, TeamCityService | users/current и buildTypes REST | Текущая browser-session; cookies напрямую не читаются | CatalogLoader, transport, App | Реальный TeamCity contract; максимум 20 страниц |
| F06 | BuildConfigurationClassifier, controller | ID и display name | Нет | Classifier, App | Tenant-specific naming и отсутствие UI профиля |
| F07 | AssistantPanel, MultiCombobox, PlatformFilter | Классифицированный каталог | Фильтры не сохраняются | App, Combobox, controller | Keyboard-проверка длинных списков |
| F08 | SearchOptionsField, useBuildSearchOptions, BuildSearchOptions, BuildFinder | Build metadata и ввод пользователя | User-scoped memory cache, максимум 3 проекта, TTL 10 минут | BuildSearchOptions, controller, SearchOptionsField | Task-ID эвристика и большой проект на реальном TeamCity |
| F09 | SearchHistoryStorage | Task/build fragments | chrome.storage.local по origin и режиму | SearchHistoryStorage, App | История может содержать внутренние номера задач |
| F10 | BuildFinder, TeamCityService, BuildArtifactSearch | builds и artifact REST | Browser-session; MAIN-world fallback через scripting | BuildFinder, TeamCityService, BuildArtifactSearch, BuildResults, App | Поиск больше 50, длина locator, предел 1000 страниц |
| F11 | BuildArtifactSearch, ArtifactResolver | Android/iOS listings | Нет | BuildArtifactSearch, App | Смешанная конфигурация на синтетических данных |
| F12 | Controller, transport, background tracking | Request IDs | Нет постоянного storage | Search, controller, App, transport/background | Отмена медленного service-worker и MAIN-world GET |
| F13 | AssistantWorkspace и CSS | UI-state | Нет | Частично App и style architecture | Отдельного drag drawer test нет |
| F14 | BuildResults и TeamCityError mapping | Результаты поиска | Нет | BuildResults, App, resolver/search | Реальные 401, 403 и timeout |
| F15 | BuildResults и reducer | finishDate и build ID | Выбор не сохраняется | Выбор проверен в App | Нет прямого newest/oldest test |
| F16 | AssistantWorkspace и trusted URL validation | contentHref | navigator.clipboard | URL validation есть, Clipboard UI test отсутствует | Clipboard success/failure и browser policy |
| F17 | Runtime message и background open-build | Build ID | Same-origin HTTPS validation | App, openTeamCityBuildTab | Неактивная вкладка и правильное окно |
| F18 | Runtime message и background open-artifact | Server-provided contentHref | Same-origin HTTPS validation | App, openTeamCityArtifactTab, restPath | Реальное скачивание и archive URL |
| F19 | ArtifactResolver и REST helpers | Bulk listing, metadata, archive children | Нет | Resolver regression tests | Depth 8, 5000 nodes, 40 fallback requests, concurrency 4, timeout 120 s |
| F20 | AdditionalActions service/provider/slot | Внешний gateway, сейчас NullGateway | Нет | Service и App integration tests | Нет готового пользовательского gateway |
| F21 | PanelToolbar | UI-state | Настройки темы не сохраняются | PanelToolbar | Не заявлять theme/settings как готовые функции |
| F22 | Diagnostics decorators/store/console | Runtime URL, response body и UI events | Память вкладки и временный Blob | DiagnosticRuntime, DiagnosticConsole | Экспорт может содержать приватные runtime-данные |
| F23 | CSS, Combobox, event-path, scroll helpers | DOM и input events | Нет | Combobox, eventPath, styles, nav | Нет axe, screen-reader и contrast тестов |
| F24 | ASP.NET Program | Состояние процесса | Не связано с permissions расширения | FoundationTests | Интеграции с расширением нет |

## Permissions и приватность

| Permission или API | Назначение | Обрабатываемые данные |
|---|---|---|
| `activeTab` | Активация на текущей вкладке | URL активной страницы |
| `scripting` | Регистрация content script и same-origin MAIN-world fallback | TeamCity REST path и ограниченный response |
| `storage` | Положение лаунчера и история запросов | Origin, task/build queries и UI preferences |
| `optional_host_permissions` | Доступ к подтверждённому пользователем HTTPS-origin | Запрашивается при активации |
| `navigator.clipboard` | Копирование artifact links | Только выбранные ссылки |
| Текущая TeamCity-сессия | Авторизованные read-only REST GET | Cookies напрямую не читаются и не сохраняются |

TeamCity transport ограничивает один response размером 4 МБ, request timeout — 30 секунд. Redirect и открываемые ссылки проверяются на HTTPS и same-origin. Если service worker не может получить пригодный JSON, используется ограниченный MAIN-world fallback.

## Подтверждённые проверки

- TypeScript typecheck.
- ESLint.
- 136 автоматических тестов расширения.
- Diagnostic build.
- Production build.
- 1 backend test.
- Public safety scan.

## Необходимые ручные проверки

1. Установка распакованного production build в поддерживаемом браузере.
2. Разрешение и отказ optional host permission.
3. Повторная активация после перезапуска браузера.
4. Реальная TeamCity-сессия без сохранения диагностических данных.
5. Прогрессивный поиск более 50 подходящих сборок.
6. Объединённый buildType locator с несколькими конфигурациями.
7. Остановка медленного поиска с сохранением найденных карточек.
8. Clipboard success/failure.
9. Открытие build и скачивание APK/IPA в неактивной вкладке.
10. Узкий viewport, browser zoom, keyboard navigation и screen reader.
11. Отсутствие diagnostic UI и diagnostic markers в production package.

## Вывод

Основной пользовательский сценарий «найти APK/IPA, показать результаты, открыть, скачать или скопировать ссылку» подтверждён автоматическими проверками. Основные оставшиеся риски относятся к реальной совместимости объединённого locator TeamCity, activation/permissions, Clipboard API, фиксированной ширине интерфейса и отсутствию полноценного accessibility-аудита.

Settings и тёмная тема являются placeholders и не должны описываться как готовые возможности. Backend предоставляет только инфраструктурные health endpoints и не участвует в пользовательском сценарии расширения.
