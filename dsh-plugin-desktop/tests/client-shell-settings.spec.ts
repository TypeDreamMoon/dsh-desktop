// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopSettingsSection, type DesktopSettingsSectionProps } from '../src/client/DesktopSettingsSection.tsx'
import { zh } from '../src/client/desktop-settings-locales.ts'

let root: Root | undefined
let container: HTMLDivElement | undefined

const PROBED = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

function scope(
  value: unknown,
  user: unknown = undefined,
  set = vi.fn(async () => {}),
  unset = vi.fn(async () => {}),
) {
  const snapshot = { status: 'ready', writable: true, value, user }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set,
    unset,
  }
}

async function mount(
  platform: 'win32' | 'darwin',
  shellValue: unknown,
  shellUser: unknown = undefined,
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const shell = scope(shellValue, shellUser)
  const desktop = scope({
    mode: 'compatibility',
    openBrowser: false,
    networkExposure: 'loopback',
    macosMaterial: 'off',
    windowsMaterial: 'off',
    updateSource: '',
    updateChannel: '',
    pwshProfile: false,
  })
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
    micaSupported: false,
    setMode: async () => {},
    desktopSettings: desktop,
    notificationSettings: scope({ enabled: false }),
    shellSettings: shell,
  } as unknown as DesktopSettingsSectionProps
  await act(async () => { root!.render(createElement(DesktopSettingsSection, props)) })
  return {
    section: container.querySelector('[aria-labelledby="dsh-desktop-shell-title"]') as HTMLElement | null,
    shell,
    desktop,
  }
}

function submitShell(section: HTMLElement): void {
  section.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

/**
 * Type into one controlled input.
 *
 * React patches the `value` property setter to track the last rendered value, so
 * assigning through the instance leaves the tracker agreeing and the dispatched
 * event reports no change. Assigning through the prototype setter is what makes
 * the following event look like user input.
 */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

describe('Windows shell settings controls', () => {
  it('renders the probed PowerShell as the effective executable while the override stays empty', async () => {
    const { section } = await mount('win32', { pwshPath: PROBED })

    const input = section!.querySelector<HTMLInputElement>('input')!
    expect(input.value).toBe('')
    expect(section!.textContent).toContain(PROBED)
    expect(section!.textContent).not.toContain(zh.pwshPathAuto)
  })

  it('stays absent on non-Windows hosts', async () => {
    const { section } = await mount('darwin', { pwshPath: PROBED })

    expect(section).toBeNull()
  })

  it('persists a typed PowerShell executable', async () => {
    const { section, shell } = await mount('win32', { pwshPath: PROBED })
    const input = section!.querySelector<HTMLInputElement>('input')!

    await act(async () => {
      typeInto(input, 'D:\\Program Files\\PowerShell\\7\\pwsh.exe')
    })
    await act(async () => { submitShell(section!) })

    expect(shell.set).toHaveBeenCalledWith('pwshPath', 'D:\\Program Files\\PowerShell\\7\\pwsh.exe')
  })

  it('clears a stored override back to the automatic probe', async () => {
    const override = 'D:\\tools\\pwsh\\pwsh.exe'
    const { section, shell } = await mount('win32', { pwshPath: override }, { pwshPath: override })

    expect(section!.querySelector<HTMLInputElement>('input')!.value).toBe(override)
    const restore = [...section!.querySelectorAll('button')]
      .find(button => button.textContent === zh.pwshPathAuto)!
    await act(async () => { restore.click() })

    expect(shell.unset).toHaveBeenCalledWith('pwshPath')
  })

  it('persists the profile preference and requests the governed restart', async () => {
    const { section, desktop } = await mount('win32', { pwshPath: PROBED })

    const toggle = section!.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async () => { toggle.click() })

    expect(desktop.set).toHaveBeenCalledWith('pwshProfile', true)
    expect(container!.textContent).toContain(zh.restarting)
  })

  it('persists the Git Bash preset preference', async () => {
    const { section, desktop } = await mount('win32', { pwshPath: PROBED })

    const toggles = section!.querySelectorAll<HTMLButtonElement>('[role="switch"]')
    await act(async () => { toggles[1]!.click() })

    expect(desktop.set).toHaveBeenCalledWith('gitBashPreset', true)
    expect(section!.textContent).toContain(zh.gitBashPreset)
  })
})
