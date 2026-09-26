/** Settings-header action that expands the settings panel to the whole window. */

import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE } from './desktop-settings-styles.ts'

/** Renderer-composed props for the settings fullscreen action. */
export type DesktopSettingsFullscreenActionProps =
  PropsRuntime<'settings.action'>
  & PropsLocale<'desktop.settings'>

/** @returns whether the settings panel is currently expanded to the window. */
export function settingsFullscreenActive(): boolean {
  return document.documentElement.hasAttribute(DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE)
}

/**
 * Toggle the settings panel between its shipped 800x800 geometry and the whole
 * window.
 *
 * The flag lands on `documentElement` because the sized element is the settings
 * shell's panel, not anything this action renders. The header renders actions
 * only while the panel is open, so unmounting restores the normal geometry and
 * the next visit never opens already expanded.
 */
export function DesktopSettingsFullscreenAction({ t }: DesktopSettingsFullscreenActionProps) {
  const [fullscreen, setFullscreen] = useState(settingsFullscreenActive)

  useEffect(() => () => {
    document.documentElement.removeAttribute(DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE)
  }, [])

  const toggle = (): void => {
    const next = !fullscreen
    if (next) document.documentElement.setAttribute(DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE, '')
    else document.documentElement.removeAttribute(DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE)
    setFullscreen(next)
  }

  return (
    <button
      type="button"
      className="dshDesktopSettingsHeaderButton"
      aria-pressed={fullscreen}
      onClick={toggle}
    >
      {t(fullscreen ? 'settingsFullscreenExit' : 'settingsFullscreen')}
    </button>
  )
}
