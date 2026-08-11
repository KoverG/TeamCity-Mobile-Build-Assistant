import { describe, expect, it } from 'vitest'
import { FakeTeamCityHttpClient } from '../test/FakeTeamCityHttpClient'
import { createArtifactBulkPath } from './ArtifactResolver'
import { createTeamCityService } from './TeamCityService'

describe('createTeamCityService', () => {
  it('connects artifact resolution to the bulk TeamCity GET', async () => {
    const bulkPath = createArtifactBulkPath('801', 'android')
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          bulkPath,
          {
            file: [
              {
                name: 'synthetic.apk',
                fullName: 'output/synthetic.apk',
                content: { href: '/repository/download/synthetic/mobile.apk' },
              },
            ],
          },
        ],
      ]),
    )
    const service = createTeamCityService(client)

    await expect(
      service.resolveArtifact('801', 'Synthetic_Mobile_Android', 'android'),
    ).resolves.toMatchObject({ status: 'Resolved' })
    expect(client.requestedPaths).toEqual([bulkPath])
  })
})
