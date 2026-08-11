import { describe, expect, it } from 'vitest'
import {
  BuildConfigurationClassifier,
  classifyBuildConfigurations,
  type BuildConfigurationClassifierProfile,
} from './BuildConfigurationClassifier'

const baseConfiguration = {
  projectId: 'SyntheticProject',
  projectName: 'Synthetic Project',
  paused: false,
}

describe('BuildConfigurationClassifier', () => {
  it('classifies common OS and environment labels outside React', () => {
    const [configuration] = classifyBuildConfigurations([
      {
        ...baseConfiguration,
        id: 'Synthetic_Mobile_android_stage',
        name: 'Android Stage',
      },
    ])

    expect(configuration).toMatchObject({ os: 'Android', environment: 'Staging' })
  })

  it('keeps unknown and ambiguous configurations in Unclassified buckets', () => {
    const classifier = new BuildConfigurationClassifier()

    expect(
      classifier.classify({
        ...baseConfiguration,
        id: 'Synthetic_Custom_Pipeline',
        name: 'Custom pipeline',
      }),
    ).toEqual({ os: 'Unclassified', environment: 'Unclassified' })

    expect(
      classifier.classify({
        ...baseConfiguration,
        id: 'Synthetic_android_ios_dev_prod',
        name: 'Ambiguous mobile pipeline',
      }),
    ).toEqual({ os: 'Unclassified', environment: 'Unclassified' })
  })

  it('accepts an installation-specific profile without hardcoded tenant data', () => {
    const profile: BuildConfigurationClassifierProfile = {
      osRules: [{ value: 'iOS', patterns: [/fruit-device/i] }],
      environmentRules: [{ value: 'Preview', patterns: [/review-lane/i] }],
    }
    const classifier = new BuildConfigurationClassifier(profile)

    expect(
      classifier.classify({
        ...baseConfiguration,
        id: 'Synthetic_FruitDevice_ReviewLane',
        name: 'fruit-device review-lane',
      }),
    ).toEqual({ os: 'iOS', environment: 'Preview' })
  })
})
