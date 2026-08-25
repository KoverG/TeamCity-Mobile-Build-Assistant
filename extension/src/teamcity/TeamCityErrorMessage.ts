import { TeamCityError } from './TeamCityError'

export function getSafeTeamCityErrorMessage(error: unknown): string {
  if (!(error instanceof TeamCityError)) {
    return 'Не удалось прочитать данные TeamCity. Повторите попытку.'
  }

  switch (error.code) {
    case 'NotAuthenticated':
      return 'Авторизуйтесь в TeamCity в этой вкладке и повторите запрос.'
    case 'Forbidden':
      return 'У вашей TeamCity-учётной записи нет доступа к этим данным.'
    case 'ResponseTooLarge':
      return 'Ответ TeamCity слишком большой. Уточните параметры поиска.'
    case 'TraversalLimitExceeded':
      return 'Поиск остановлен безопасным ограничением. Уточните параметры.'
    case 'RequestTimeout':
      return 'TeamCity отвечает слишком долго. Повторите поиск.'
    case 'InvalidRequest':
      return 'TeamCity вернул неподдерживаемую ссылку.'
    case 'TeamCityUnavailable':
      return 'TeamCity сейчас недоступен. Повторите попытку.'
    case 'UnexpectedResponse':
      return 'TeamCity вернул ответ неизвестного формата.'
  }
}
