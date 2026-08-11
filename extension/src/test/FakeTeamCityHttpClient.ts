import type {
  TeamCityHttpClient,
  TeamCityJsonResult,
  TeamCityRequestOptions,
} from '../teamcity/TeamCityTransport'

export class FakeTeamCityHttpClient implements TeamCityHttpClient {
  public readonly requestedPaths: string[] = []
  public readonly requestedTimeouts: Array<number | undefined> = []

  public constructor(private readonly responses: ReadonlyMap<string, unknown>) {}

  public async getJson<T>(
    path: string,
    options: TeamCityRequestOptions = {},
  ): Promise<TeamCityJsonResult<T>> {
    if (options.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    this.requestedPaths.push(path)
    this.requestedTimeouts.push(options.timeoutMs)

    if (!this.responses.has(path)) {
      throw new Error(`Missing synthetic response for ${path}`)
    }

    return {
      data: this.responses.get(path) as T,
      status: 200,
      transport: 'main-world',
    }
  }
}
