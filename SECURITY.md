# Политика безопасности

## Сообщение об уязвимости

После публикации repository используйте private vulnerability reporting на вкладке **Security** для конфиденциального сообщения. Не публикуйте tokens, cookies, реальные TeamCity URLs, identifiers, response bodies, персональные данные или пошаговый exploit в обычном issue.

Если private reporting временно недоступен, создайте публичный issue без чувствительных подробностей только с просьбой открыть приватный канал связи.

## Чувствительные данные

Проект не должен хранить:

- TeamCity credentials или browser cookies;
- Telegram bot/device tokens и webhook secrets;
- реальные TeamCity hosts, project/build IDs, branches и artifact paths;
- runtime response bodies, HAR/netlog, screenshots и browser profiles;
- production environment files и базы данных.

Diagnostic JSON предназначен только для локального исследования и не является допустимым fixture или вложением к публичному issue.

## Поддерживаемые версии

До первого стабильного release security fixes применяются только к текущей основной ветке.
