// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopSettingsSection, type DesktopSettingsSectionProps } from '../src/client/DesktopSettingsSection.tsx'
import { zh } from '../src/client/desktop-settings-locales.ts'

let root: Root | undefined
let container: HTMLDivElement | undefined

function scope(value: unknown, set: ReturnType<typeof vi.fn> = vi.fn(async () => {})) {
  const snapshot = { status: 'ready', writable: true, value }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set,
  }
}

async function mount(updateSource = '', updateChannel = '') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const set = vi.fn(async () => {})
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
    platform: 'darwin',
    initialMode: 'compatibility',
    micaSupported: false,
    setMode: async () => {},
    desktopSettings: scope({
      mode: 'compatibility',
      openBrowser: false,
      networkExposure: 'loopback',
      macosMaterial: 'off',
      windowsMaterial: 'off',
      updateSource,
      updateChannel,
    }, set),
    notificationSettings: scope({ enabled: false }),
    shellSettings: scope({}),
  } as unknown as DesktopSettingsSectionProps
  await act(async () => { root!.render(createElement(DesktopSettingsSection, props)) })
  return {
    section: container.querySelector('[aria-labelledby="dsh-desktop-updates-title"]') as HTMLElement,
    set,
  }
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

describe('update settings controls', () => {
  it('shows the source and channel selects with the stored values', async () => {
    const { section } = await mount('upstream', 'beta')
    const selects = section.querySelectorAll<HTMLSelectElement>('select')
    expect(selects).toHaveLength(2)
    expect(selects[0]!.value).toBe('upstream')
    expect(selects[1]!.value).toBe('beta')
    expect(section.textContent).toContain(zh.updateSourceFork)
  })

  it('persists a chosen source and requests the governed restart', async () => {
    const { section, set } = await mount()
    const source = section.querySelectorAll<HTMLSelectElement>('select')[0]!
    await act(async () => {
      source.value = 'fork'
      source.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(set).toHaveBeenCalledWith('updateSource', 'fork')
    expect(container!.textContent).toContain(zh.restarting)
  })

  it('persists a chosen channel and requests the governed restart', async () => {
    const { section, set } = await mount()
    const channel = section.querySelectorAll<HTMLSelectElement>('select')[1]!
    await act(async () => {
      channel.value = 'stable'
      channel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(set).toHaveBeenCalledWith('updateChannel', 'stable')
    expect(container!.textContent).toContain(zh.restarting)
  })
})