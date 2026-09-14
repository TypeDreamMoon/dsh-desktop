/**
 * Release source selection for the Desktop updater: the official DSH Desktop
 * version service, or one GitHub repository's Releases. Fork maintainers point
 * the updater at their own repository without changing the official default.
 * @module dsh-plugin-desktop/src/update-source
 */

/** Official DSH Desktop release service. */
export const OFFICIAL_UPDATE_SOURCE = Object.freeze({ kind: 'official' } as const)

/** Where the Desktop updater resolves versions and installers. */
export type DesktopUpdateSource =
  | typeof OFFICIAL_UPDATE_SOURCE
  | { readonly kind: 'github', readonly repository: string }

/** Config spelling selecting one GitHub repository as the release source. */
export const GITHUB_UPDATE_SOURCE_PREFIX = 'github:'

const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-_.]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9-_.]*[A-Za-z0-9])?$/u

/**
 * Parse the `releaseSource` config value: empty or `official` selects the DSH
 * service, `github:<owner>/<repo>` selects that repository's Releases.
 * @param value - Raw config value, or undefined for the official default.
 * @returns the validated source.
 * @throws {Error} When the value is neither spelling.
 */
export function parseDesktopUpdateSource(value: string | undefined): DesktopUpdateSource {
  const normalized = (value ?? '').trim()
  if (normalized === '' || normalized === 'official') return OFFICIAL_UPDATE_SOURCE
  if (normalized.startsWith(GITHUB_UPDATE_SOURCE_PREFIX)) {
    const repository = normalized.slice(GITHUB_UPDATE_SOURCE_PREFIX.length).trim()
    if (GITHUB_REPOSITORY_PATTERN.test(repository)) return { kind: 'github', repository }
  }
  throw new Error(`dsh-plugin-desktop: invalid update source ${JSON.stringify(value)}`)
}

/**
 * Canonical config spelling of one source.
 * @param source - Source to render.
 * @returns `official` or `github:<owner>/<repo>`.
 */
export function formatDesktopUpdateSource(source: DesktopUpdateSource): string {
  return source.kind === 'official' ? 'official' : `${GITHUB_UPDATE_SOURCE_PREFIX}${source.repository}`
}
