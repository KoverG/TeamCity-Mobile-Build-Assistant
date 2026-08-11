import type { BuildConfiguration } from './CatalogLoader'

export const mobileOperatingSystems = ['Android', 'iOS', 'Unclassified'] as const
export const mobileEnvironments = [
  'Development',
  'Staging',
  'Preview',
  'PreProduction',
  'Production',
  'Unclassified',
] as const

export type MobileOperatingSystem = (typeof mobileOperatingSystems)[number]
export type MobileEnvironment = (typeof mobileEnvironments)[number]

export interface ClassificationRule<T extends string> {
  value: T
  patterns: readonly RegExp[]
}

export interface BuildConfigurationClassifierProfile {
  osRules: readonly ClassificationRule<Exclude<MobileOperatingSystem, 'Unclassified'>>[]
  environmentRules: readonly ClassificationRule<Exclude<MobileEnvironment, 'Unclassified'>>[]
}

export interface BuildConfigurationClassification {
  os: MobileOperatingSystem
  environment: MobileEnvironment
}

export interface ClassifiedBuildConfiguration extends BuildConfiguration {
  os: MobileOperatingSystem
  environment: MobileEnvironment
}

export const defaultClassifierProfile: BuildConfigurationClassifierProfile = {
  osRules: [
    { value: 'Android', patterns: [/(?:^|[^a-z0-9])android(?:$|[^a-z0-9])/i] },
    { value: 'iOS', patterns: [/(?:^|[^a-z0-9])ios(?:$|[^a-z0-9])/i] },
  ],
  environmentRules: [
    {
      value: 'PreProduction',
      patterns: [/(?:^|[^a-z0-9])pre[-_. ]?(?:production|prod)(?:$|[^a-z0-9])/i],
    },
    {
      value: 'Development',
      patterns: [/(?:^|[^a-z0-9])(?:development|develop|dev)(?:$|[^a-z0-9])/i],
    },
    {
      value: 'Staging',
      patterns: [/(?:^|[^a-z0-9])(?:staging|stage|stg)(?:$|[^a-z0-9])/i],
    },
    { value: 'Preview', patterns: [/(?:^|[^a-z0-9])preview(?:$|[^a-z0-9])/i] },
    {
      value: 'Production',
      patterns: [/(?:^|[^a-z0-9])(?:production|prod)(?:$|[^a-z0-9])/i],
    },
  ],
}

function classifyValue<T extends string>(
  source: string,
  rules: readonly ClassificationRule<T>[],
): T | 'Unclassified' {
  const matches = new Set<T>()
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => {
      pattern.lastIndex = 0
      return pattern.test(source)
    })) {
      matches.add(rule.value)
    }
  }

  return matches.size === 1 ? [...matches][0] : 'Unclassified'
}

export class BuildConfigurationClassifier {
  public constructor(
    private readonly profile: BuildConfigurationClassifierProfile = defaultClassifierProfile,
  ) {}

  public classify(configuration: BuildConfiguration): BuildConfigurationClassification {
    const source = `${configuration.id} ${configuration.name}`
    return {
      os: classifyValue(source, this.profile.osRules),
      environment: classifyValue(source, this.profile.environmentRules),
    }
  }
}

export function classifyBuildConfigurations(
  configurations: readonly BuildConfiguration[],
  classifier = new BuildConfigurationClassifier(),
): ClassifiedBuildConfiguration[] {
  return configurations.map((configuration) => ({
    ...configuration,
    ...classifier.classify(configuration),
  }))
}
