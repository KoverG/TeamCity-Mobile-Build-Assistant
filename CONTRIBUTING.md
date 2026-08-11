# Участие в разработке

Спасибо за интерес к TeamCity Mobile Build Assistant.

## Перед началом

1. Прочитайте [`docs/PRODUCT.md`](docs/PRODUCT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) и [`docs/TEAMCITY_INTEGRATION.md`](docs/TEAMCITY_INTEGRATION.md).
2. Не добавляйте реальные TeamCity hosts, project/build identifiers, branches, artifact names, response bodies, screenshots, HAR-файлы, cookies, персональные данные или secrets.
3. Создавайте только синтетические fixtures с доменами `example.test`/`example.invalid` и вымышленными identifiers.

## Локальная проверка

```powershell
npm.cmd --prefix extension run typecheck
npm.cmd --prefix extension run lint
npm.cmd --prefix extension run test:run
npm.cmd --prefix extension run build
dotnet test TeamCityHelper.sln --configuration Release
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-safety-scan.ps1
```

Все проверки должны проходить до отправки изменений на review.

GitHub Actions повторяет проверки для каждого push и pull request, а также запускает vulnerability audit npm и NuGet dependencies.

## Диагностические данные

Diagnostic build может временно показывать полные runtime URL и TeamCity response bodies. Эти данные разрешено использовать только локально для исследования. Не прикладывайте их к публичным issues и не переносите в source, tests, docs или Git history.

## Изменения TeamCity integration

- Выполняйте только read-only GET во время исследования.
- Не читайте cookies напрямую.
- Используйте server-provided `contentHref` для artifact.
- Сохраняйте bounded fallback и safety limits.
- Добавляйте synthetic regression tests для каждого нового контракта ответа.
