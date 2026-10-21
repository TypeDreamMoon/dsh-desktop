// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DesktopSettingsFullscreenAction,
  settingsFullscreenActive,
  type DesktopSettingsFullscreenActionProps,
} from '../src/client/DesktopSettingsFullscreenAction.tsx'
import {
  DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE,
  installDesktopSettingsStyles,
} from '../src/client/desktop-settings-styles.ts'
import { en, zh } from '../src/client/desktop-settings-locales.ts'

const STYLE_ID = 'dsh-desktop-settings-styles'

let root: Root | undefined
let container: HTMLDivElement | undefined

async function mount(locale: typeof zh | typeof en = zh): Promise<HTMLButtonElement> {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const props = { t: (key: keyof typeof zh) => locale[key] } as unknown as DesktopSettingsFullscreenActionProps
  await act(async () => { root!.render(createElement(DesktopSettingsFullscreenAction, props)) })
  return container.querySelector('button')!
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = undefined
  container?.remove()
  document.getElementById(STYLE_ID)?.remove()
  document.documentElement.removeAttribute(DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE)
  vi.unstubAllGlobals()
})

describe('settings fullscreen action', () => {
  it('starts collapsed and unpressed', async () => {
    const button = await mount()

    expect(button.textContent).toBe(zh.settingsFullscreen)
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(settingsFullscreenActive()).toBe(false)
  })

  it('expands the panel and reflects the state on the toggle', async () => {
    const button = await mount()

    await act(async () => { button.click() })

    expect(settingsFullscreenActive()).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.textContent).toBe(zh.settingsFullscreenExit)
  })

  it('restores the shipped geometry when toggled back', async () => {
    const button = await mount()

    await act(async () => { button.click() })
    await act(async () => { button.click() })

    expect(settingsFullscreenActive()).toBe(false)
    expect(document.documentElement.hasAttribute(DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE)).toBe(false)
    expect(button.textContent).toBe(zh.settingsFullscreen)
  })

  it('never leaves a later visit expanded', async () => {
    const button = await mount()
    await act(async () => { button.click() })

    // Closing settings unmounts the header, which is the only place this action lives.
    await act(async () => { root!.unmount() })
    root = undefined

    expect(settingsFullscreenActive()).toBe(false)
  })

  it('localizes the toggle', async () => {
    const button = await mount(en)

    expect(button.textContent).toBe(en.settingsFullscreen)
    expect(zh.settingsFullscreen).not.toBe(en.settingsFullscreen)
  })

  it('ships the panel expansion rule under the toggle attribute', () => {
    installDesktopSettingsStyles()

    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    // The panel is upstream chrome, so the rule has to key off its one stable hook.
    expect(css).toContain(`html[${DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE}] [data-shortcut-modal="settings"]`)
    expect(css).toContain('max-width: none;')
    expect(css).toContain(`html[${DESKTOP_SETTINGS_FULLSCREEN_ATTRIBUTE}] .dshDesktopSettings`)
  })
})
