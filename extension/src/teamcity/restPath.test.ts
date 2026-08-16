import { describe, expect, it } from 'vitest'
import {
  createTeamCityBuildPageUrl,
  normalizeTeamCityRestPath,
  toRestPath,
  toTrustedTeamCityUrl,
} from './restPath'

describe('TeamCity URL validation', () => {
  it('creates a same-origin TeamCity build page URL from an opaque build ID', () => {
    expect(createTeamCityBuildPageUrl('12345', 'https://teamcity.example.test')).toBe(
      'https://teamcity.example.test/viewLog.html?buildId=12345',
    )
    expect(() => createTeamCityBuildPageUrl('12345&tab=evil', 'https://teamcity.example.test'))
      .toThrow(/unsupported characters/)
  })

  it('accepts relative and same-origin HTTP(S) URLs', () => {
    expect(
      toTrustedTeamCityUrl(
        '/repository/download/Synthetic_Mobile/101:id/mobile.apk',
        'https://teamcity.example.test',
      ),
    ).toBe('https://teamcity.example.test/repository/download/Synthetic_Mobile/101:id/mobile.apk')
    expect(
      toTrustedTeamCityUrl(
        'https://teamcity.example.test/repository/download/mobile.ipa',
        'https://teamcity.example.test',
      ),
    ).toBe('https://teamcity.example.test/repository/download/mobile.ipa')
  })

  it('rejects executable and cross-origin artifact URLs', () => {
    expect(() =>
      toTrustedTeamCityUrl('javascript:alert(1)', 'https://teamcity.example.test'),
    ).toThrow(/untrusted URL/)
    expect(() =>
      toTrustedTeamCityUrl(
        'https://cdn.example.invalid/mobile.apk',
        'https://teamcity.example.test',
      ),
    ).toThrow(/untrusted URL/)
    expect(() =>
      toTrustedTeamCityUrl(
        ['https:', '//synthetic-user@teamcity.example.test/mobile.apk'].join(''),
        'https://teamcity.example.test',
      ),
    ).toThrow(/untrusted URL/)
  })

  it('keeps REST pagination inside the TeamCity REST namespace', () => {
    expect(toRestPath('/app/rest/builds?page=2')).toBe('/app/rest/builds?page=2')
    expect(normalizeTeamCityRestPath('/app/rest/builds/../projects')).toBe('/app/rest/projects')
    expect(() => normalizeTeamCityRestPath('/app/rest/../../login.html')).toThrow(/untrusted/)
    expect(() => normalizeTeamCityRestPath('/app/restricted')).toThrow(/untrusted/)
    expect(() => toRestPath('/repository/download/mobile.apk')).toThrow(/untrusted/)
  })
})
