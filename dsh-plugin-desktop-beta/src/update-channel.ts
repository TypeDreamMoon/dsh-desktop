/**
 * Update-channel preference for the Desktop updater. The installed edition
 * owns the default stream; `releaseChannel` can pin the lifecycle to one
 * stream without changing which package is running.
 * @module dsh-plugin-desktop/src/update-channel
 */

import type { DesktopReleaseChannel } from './update-checker.ts'

/**
 * Parse the `releaseChannel` config value.
 * @param value - Raw config value; empty or `auto` follows the installed edition.
 * @returns the pinned channel, or undefined to follow the installed edition.
 * @throws {Error} When the value is neither `auto`, `stable`, nor `beta`.
 */
export function parseDesktopUpdateChannel(
  value: string | undefined,
): DesktopReleaseChannel | undefined {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === '' || normalized === 'auto') return undefined
  if (normalized === 'stable' || normalized === 'beta') return normalized
  throw new Error(`dsh-plugin-desktop: invalid update channel ${JSON.stringify(value)}`)
}