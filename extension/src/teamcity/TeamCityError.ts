export type TeamCityErrorCode =
  | 'NotAuthenticated'
  | 'Forbidden'
  | 'InvalidRequest'
  | 'ResponseTooLarge'
  | 'TeamCityUnavailable'
  | 'UnexpectedResponse'
  | 'TraversalLimitExceeded'
  | 'RequestTimeout'

export class TeamCityError extends Error {
  public constructor(
    public readonly code: TeamCityErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'TeamCityError'
  }
}
