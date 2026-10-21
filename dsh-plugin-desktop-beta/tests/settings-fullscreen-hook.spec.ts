import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE } from '../src/client/desktop-settings-styles.ts'

/**
 * Shell that owns the settings panel the fullscreen toggle expands.
 *
 * The panel is upstream chrome, so the Desktop expansion rule cannot target a
 * class of its own and keys off this bundle's `data-shortcut-modal` hook. A
 * rename there would leave the toggle visible but inert, which no Desktop-side
 * unit test could notice, so the contract is asserted against the installed
 * bundle instead.
 */
const SETTINGS_SHELL_PACKAGE = '@deepseek-ai/dsh-client-ui-settings-general'

describe('settings panel hook', () => {
  it('keeps the stable data-shortcut-modal hook the fullscreen rule keys off', () => {
    const require = createRequire(import.meta.url)
    const bundle = readFileSync(
      join(dirname(require.resolve(SETTINGS_SHELL_PACKAGE)), 'client.js'),
      'utf8',
    )

    expect(bundle).toContain('"data-shortcut-modal": "settings"')
    expect(DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE).toBe('data-dsh-desktop-settings-fullscreen')
  })
})
