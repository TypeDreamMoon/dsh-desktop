// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopSettingsSection, type DesktopSettingsSectionProps } from '../src/client/DesktopSettingsSection.tsx'
import { zh } from '../src/client/desktop-settings-locales.ts'

let root: Root | undefined
let container: HTMLDivElement | undefined

/**
 * One Desktop form snapshot fixture.
 *
 * `DesktopSettingsSection` reads the shared `ConfigForm` face, so a fixture only
 * has to answer `getSnapshot`, `subscribe`, and `set`.
 */
function form(value: unknown, user: unknown = undefined) {
  const snapshot = { status: 'ready', writable: true, value, user, base: undefined, revision: 1, mode: 'host' }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: vi.fn(async () => true),
  }
}

const DESKTOP_VALUE = {
  mode: 'compatibility',
  openBrowser: false,
  networkExposure: 'loopback',
  macosMaterial: 'off',
  windowsMaterial: 'off',
  updateSource: '',
  updateChannel: '',
  pwshProfile: false,
}

async function mount(platform: 'win32' | 'darwin') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const desktop = form({ ...DESKTOP_VALUE })
  const props = {
    t: (key: keyof typeof zh) => zh[key],
    api: {
      read: async () => ({
        current: 'desktop',
        profiles: [],
        aa: { requested: false, effective: false },
        market: { requested: 'disabled', effective: 'disabled', legacyDefaulted: false },
        web: { localUrl: '', lanUrls: [], lanState: 'inactive', lanError: null, lanCaFingerprint: null, lanCaUrls: [] },
      }),
      selectAa: async () => ({ accepted: true as const, restartRequired: true }),
    },
    platform,
    initialMode: 'compatibility',
    setMode: async () => {},
    desktopSettings: desktop,
    notificationSettings: form({ enabled: false }),
  } as unknown as DesktopSettingsSectionProps
  await act(async () => { root!.render(createElement(DesktopSettingsSection, props)) })
  return {
    section: container,
    shell: container.querySelector('[aria-labelledby="dsh-desktop-shell-title"]') as HTMLElement | null,
    updates: container.querySelector('[aria-labelledby="dsh-desktop-updates-title"]') as HTMLElement | null,
    desktop,
  }
}

/** Select one option the way a user does, so React's change handler runs. */
function choose(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  setter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

describe('Desktop shell and update settings controls', () => {
  it('offers the PowerShell profile preference on Windows only', async () => {
    const windows = await mount('win32')
    expect(windows.shell).not.toBeNull()
    expect(windows.shell!.textContent).toContain(zh.pwshProfile)

    const mac = await mount('darwin')
    expect(mac.shell).toBeNull()
  })

  it('persists the PowerShell profile preference and requests the governed restart', async () => {
    const { shell, desktop } = await mount('win32')

    const toggle = shell!.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async () => { toggle.click() })

    expect(desktop.set).toHaveBeenCalledWith('pwshProfile', true)
    expect(container!.textContent).toContain(zh.restarting)
  })

  it('renders the configured update source and channel', async () => {
    const { updates } = await mount('win32')

    const selects = updates!.querySelectorAll<HTMLSelectElement>('select')
    expect(selects).toHaveLength(2)
    expect(selects[0]!.value).toBe('')
    expect(selects[1]!.value).toBe('')
    expect(updates!.textContent).toContain(zh.updateSource)
    expect(updates!.textContent).toContain(zh.updateChannel)
  })

  it('persists a chosen update source and channel', async () => {
    const { updates, desktop } = await mount('win32')

    const selects = updates!.querySelectorAll<HTMLSelectElement>('select')
    await act(async () => { choose(selects[0]!, 'fork') })
    expect(desktop.set).toHaveBeenCalledWith('updateSource', 'fork')

    await act(async () => { choose(selects[1]!, 'beta') })
    expect(desktop.set).toHaveBeenCalledWith('updateChannel', 'beta')
  })
})
