/**
 * Release source selection for the Desktop updater: the official DSH Desktop
 * version service, the upstream anywhere-labs GitHub Releases, or this fork's
 * own GitHub Releases. Fork maintainers can point the updater at either
 * repository without changing the shipped default.
 * @module dsh-plugin-desktop/src/update-source
 */

/** Official DSH Desktop release service. */
export const OFFICIAL_UPDATE_SOURCE = Object.freeze({ kind: 'official' } as const)

/** GitHub repository behind the `fork` source alias. */
export const FORK_UPDATE_REPOSITORY = 'TypeDreamMoon/dsh-desktop'

/** GitHub repository behind the `upstream` source alias. */
export const UPSTREAM_UPDATE_REPOSITORY = 'anywhere-labs/dsh-desktop'

/** Where the Desktop updater resolves versions and installers. */
export type DesktopUpdateSource =
  | typeof OFFICIAL_UPDATE_SOURCE
  | { readonly kind: 'github', readonly repository: string }

/** Config spelling selecting one GitHub repository as the release source. */
export const GITHUB_UPDATE_SOURCE_PREFIX = 'github:'

const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-_.]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9-_.]*[A-Za-z0-9])?$/u

/** Named source spellings resolved before the explicit `github:` form. */
const SOURCE_ALIASES: Readonly<Record<string, DesktopUpdateSource>> = Object.freeze({
  fork: Object.freeze({ kind: 'github', repository: FORK_UPDATE_REPOSITORY } as const),
  upstream: Object.freeze({ kind: 'github', repository: UPSTREAM_UPDATE_REPOSITORY } as const),
})

/**
 * Parse the `releaseSource` config value:
 * - empty or `official` selects the DSH Desktop release service;
 * - `fork` selects this fork's GitHub Releases;
 * - `upstream` selects the upstream anywhere-labs GitHub Releases;
 * - `github:<owner>/<repo>` selects any other repository's Releases.
 * @param value - Raw config value, or undefined for the official default.
 * @returns the validated source.
 * @throws {Error} When the value is none of these spellings.
 */
export function parseDesktopUpdateSource(value: string | undefined): DesktopUpdateSource {
  const normalized = (value ?? '').trim()
  const keyword = normalized.toLowerCase()
  if (keyword === '' || keyword === 'official') return OFFICIAL_UPDATE_SOURCE
  const alias = SOURCE_ALIASES[keyword]
  if (alias !== undefined) return alias
  if (keyword.startsWith(GITHUB_UPDATE_SOURCE_PREFIX)) {
    const repository = normalized.slice(GITHUB_UPDATE_SOURCE_PREFIX.length).trim()
    if (GITHUB_REPOSITORY_PATTERN.test(repository)) return { kind: 'github', repository }
  }
  throw new Error(`dsh-plugin-desktop: invalid update source ${JSON.stringify(value)}`)
}

/**
 * Canonical config spelling of one source: `official`, `fork`, `upstream`, or
 * `github:<owner>/<repo>` for any other repository.
 * @param source - Source to render.
 * @returns the canonical spelling.
 */
export function formatDesktopUpdateSource(source: DesktopUpdateSource): string {
  if (source.kind === 'official') return 'official'
  const repository = source.repository.toLowerCase()
  if (repository === FORK_UPDATE_REPOSITORY.toLowerCase()) return 'fork'
  if (repository === UPSTREAM_UPDATE_REPOSITORY.toLowerCase()) return 'upstream'
  return `${GITHUB_UPDATE_SOURCE_PREFIX}${source.repository}`
}