# TeamCity Mobile Build Assistant

Лёгкое расширение для Chromium-браузеров, которое находит APK или IPA в выбранной успешной сборке TeamCity и возвращает прямую защищённую ссылку на artifact.

Расширение работает внутри открытой TeamCity-вкладки и использует текущую авторизованную browser-session. Credentials и cookies напрямую не читаются и не сохраняются.

## Что уже работает

- автоматическое определение TeamCity origin;
- каскадный выбор `Project → OS → Environment → Build`;
- загрузка завершённых успешных builds из доступных branches;
- быстрый bulk-first поиск `.apk` и `.ipa`, включая artifacts внутри archives;
- безопасный ограниченный fallback для TeamCity-инсталляций, которые не раскрывают archive одним ответом;
- копирование и открытие server-provided artifact link;
- сохранение выбранных Project, OS и Environment отдельно для каждого TeamCity origin.

## Локальный запуск

Требования: Node.js 22+, npm и Chromium-совместимый браузер.

```powershell
npm.cmd --prefix extension ci
npm.cmd --prefix extension run build:production
```

Откройте страницу управления расширениями, включите режим разработчика, выберите «Загрузить распакованное расширение» и укажите `extension/dist-production`. После этого откройте HTTPS-страницу TeamCity и нажмите кнопку `TC`.

Для локальной диагностики доступна отдельная сборка с временной live-консолью:

```powershell
npm.cmd --prefix extension run build:diagnostic
```

Она создаётся в `extension/dist`. Diagnostic URL и response bodies нельзя сохранять в source, tests, документации или Git history.

## Проверка проекта

```powershell
npm.cmd --prefix extension run typecheck
npm.cmd --prefix extension run lint
npm.cmd --prefix extension run test:run
npm.cmd --prefix extension run build
npm.cmd --prefix extension run build:production
dotnet test TeamCityHelper.sln --configuration Release
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-safety-scan.ps1
```

Архитектурные решения находятся в [`docs`](docs/PRODUCT.md), правила участия — в [`CONTRIBUTING.md`](CONTRIBUTING.md), политика безопасности — в [`SECURITY.md`](SECURITY.md).

## Лицензия

[MIT](LICENSE) © 2026 KoverG
