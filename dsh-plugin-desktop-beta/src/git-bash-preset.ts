/**
 * Generate the Desktop-owned Git Bash agent preset declaration.
 *
 * dsh 0.1.7-alpha.1 replaced filesystem preset discovery with preset
 * declarations carried by patch files: every shipped preset is one
 * `@deepseek-ai/dsh-agent-preset` row inserted from
 * `@deepseek-ai/dsh-web-app/presets/*.patch.yml`. Desktop therefore declares
 * its own preset instead of copying a preset directory, which is also what
 * keeps the `!!js` expressions of the shipped preset intact — the transform
 * edits the parsed document and re-emits it rather than rebuilding rows.
 * @module dsh-plugin-desktop-beta/src/git-bash-preset
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { isMap, isSeq, parseDocument, type Node, type YAMLSeq } from 'yaml'

/** Preset id the Desktop owns and regenerates. */
export const DESKTOP_GIT_BASH_PRESET_ID = 'git-bash'

/** Loader row id carrying the generated preset declaration. */
export const DESKTOP_GIT_BASH_PRESET_ROW_ID = 'preset-git-bash'

/** Package that owns one agent preset declaration. */
const PRESET_PACKAGE = '@deepseek-ai/dsh-agent-preset'

/** Backend that runs one persistent bash shell through an explicit executable. */
const TERMINAL_PACKAGE = '@deepseek-ai/dsh-terminal-bash'

/** Model-facing tool over that backend. */
const PERSISTENT_TOOL_PACKAGE = '@deepseek-ai/dsh-tool-bash-persistent'

/**
 * Row ids the generator drops before appending its own shell rows.
 *
 * `tool-pwsh` and `tool-bash` are the one-shot tools over the host `ctx.shell`,
 * which stays the confined PowerShell on Windows; the other two are this
 * generator's own rows, dropped so a regeneration is idempotent.
 */
const REPLACED_ROW_IDS = new Set(['tool-pwsh', 'tool-bash', 'shell-git-bash', 'tool-bash-persistent'])

/** Preset id prefix every shipped declaration inserts. */
const PRESET_ROW_PREFIX = 'preset-'

/**
 * Order the generated preset sorts at.
 *
 * Shipped presets occupy 3 (minimal), 4 (cordis) and 5 (standard/ptc), so the
 * Desktop-owned one sorts last without competing for a shipped slot.
 */
const PRESET_ORDER = 9

/** One generated preset's identity on disk. */
export interface GeneratedGitBashPreset {
  /** Preset id a session selects. */
  readonly id: string
  /** Absolute path of the overlay patch declaring it. */
  readonly path: string
  /** Shipped preset id this generation derived from. */
  readonly source: string
}

/**
 * Absolute path of one shipped preset declaration.
 * @param presetId - shipped preset id (`minimal`, `standard`, `ptordis`, `ptc`).
 * @param moduleUrl - module URL used to resolve the owning package.
 * @returns the preset patch file path.
 */
export function shippedPresetPatchPath(presetId: string, moduleUrl: string = import.meta.url): string {
  const require = createRequire(moduleUrl)
  const packageJson = require.resolve('@deepseek-ai/dsh-web-app/package.json') as string
  return join(dirname(packageJson), 'presets', `${presetId}.patch.yml`)
}

/**
 * Rewrite one shipped preset declaration into the Desktop Git Bash preset.
 *
 * The declaration row is renamed and re-identified, and its `plugins` sequence
 * swaps the confined shell rows for the persistent Git Bash backend. Comments,
 * unrelated rows, and `!!js` expressions survive because this mutates the
 * parsed document instead of re-emitting a hand-built row list.
 * @param sourcePatch - text of the shipped preset patch file.
 * @param bashPath - absolute Git Bash executable the preset runs commands with.
 * @returns the overlay patch text declaring the generated preset.
 */
export function gitBashPresetPatch(sourcePatch: string, bashPath: string): string {
  const document = parseDocument(sourcePatch, { prettyErrors: true })
  if (document.errors.length > 0) {
    throw new Error(`dsh-plugin-desktop: source preset is not valid YAML: ${document.errors.map(error => error.message).join('; ')}`)
  }
  const rows = document.contents
  if (!isSeq(rows)) throw new Error('dsh-plugin-desktop: source preset must be a YAML sequence of rows')
  const declaration = presetDeclarationRow(rows)
  declaration.set('id', DESKTOP_GIT_BASH_PRESET_ROW_ID)
  declaration.set('name', PRESET_PACKAGE)
  const config = declaration.get('config')
  if (!isMap(config)) throw new Error('dsh-plugin-desktop: source preset declaration has no config map')
  config.set('id', DESKTOP_GIT_BASH_PRESET_ID)
  config.set('order', PRESET_ORDER)
  const plugins = config.get('plugins')
  if (!isSeq(plugins)) throw new Error('dsh-plugin-desktop: source preset declaration has no plugins sequence')
  for (let index = plugins.items.length - 1; index >= 0; index -= 1) {
    const row = plugins.items[index]
    if (isMap(row) && REPLACED_ROW_IDS.has(String(row.get('id')))) plugins.delete(index)
  }
  plugins.items.push(document.createNode({
    id: 'shell-git-bash',
    name: TERMINAL_PACKAGE,
    config: { shellDialect: 'bash', shellPath: bashPath },
  }) as Node)
  plugins.items.push(document.createNode({
    id: 'tool-bash-persistent',
    name: PERSISTENT_TOOL_PACKAGE,
  }) as Node)
  return document.toString()
}

/**
 * Find the shipped preset declaration row inside one preset patch sequence.
 * @param rows - top-level rows of the parsed preset patch.
 * @returns the declaration row map.
 */
function presetDeclarationRow(rows: YAMLSeq): import('yaml').YAMLMap {
  for (const row of rows.items) {
    if (!isMap(row)) continue
    const insert = row.get('insert')
    if (!isSeq(insert)) continue
    for (const entry of insert.items) {
      if (!isMap(entry)) continue
      const id = entry.get('id')
      if (typeof id === 'string' && id.startsWith(PRESET_ROW_PREFIX) && entry.get('name') === PRESET_PACKAGE) {
        return entry
      }
    }
  }
  throw new Error('dsh-plugin-desktop: source preset patch declares no agent preset')
}

/**
 * Materialize the Desktop Git Bash preset overlay patch on disk.
 *
 * The caller owns the path, so this module holds no preset-root policy. A
 * disabled or unavailable preset is removed by {@link removeGitBashPreset}
 * instead, which keeps a stale declaration from outliving its setting.
 * @param path - absolute overlay patch path to write.
 * @param sourcePatch - text of the shipped preset patch to derive from.
 * @param bashPath - absolute Git Bash executable the preset runs commands with.
 * @param source - shipped preset id, recorded in the result only.
 * @returns the generated preset's identity on disk.
 */
export function generateGitBashPreset(
  path: string,
  sourcePatch: string,
  bashPath: string,
  source: string = 'standard',
): GeneratedGitBashPreset {
  const patch = gitBashPresetPatch(sourcePatch, bashPath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, patch)
  return { id: DESKTOP_GIT_BASH_PRESET_ID, path, source }
}

/**
 * Remove a previously generated preset overlay patch.
 * @param path - absolute overlay patch path to delete.
 */
export function removeGitBashPreset(path: string): void {
  rmSync(path, { force: true })
}
