/** Cordis Host plugin for scheduled and interactive DSH Desktop updates. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import { DESKTOP_UPDATE_CHECK_PATH } from './desktop-settings-contract.ts'
import { handleDesktopUpdateCheckRequest } from './desktop-settings-route.ts'
import type {} from './runtime.ts'
import { startDesktopUpdateLifecycle } from './update-lifecycle.ts'
import { parseDesktopUpdateChannel } from './update-channel.ts'
import type { DesktopReleaseChannel } from './update-checker.ts'
import { parseDesktopUpdateSource, type DesktopUpdateSource } from './update-source.ts'
import { DESKTOP_SETTINGS_ENTRY_ID } from './settings-bridge.ts'

/** Stable Cordis plugin name. */
export const name = 'desktop-updates'

/** Native adapter required for network, tray, confirmation, and installer access. */
export const inject = ['desktopRuntime', 'webServer', 'connection', 'settings']

const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Subset of the Desktop shell settings this plugin consumes. */
interface DesktopUpdateSettings {
  readonly updateSource?: string
  readonly updateChannel?: string
}

/** Non-empty settings override, else the packaged plugin config value. */
function settingsOverride(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim() !== '' ? value : fallback
}

/**
 * Read the Desktop shell entry's live configuration.
 *
 * dsh 0.1.7 addresses a settings document by its Loader entry id and serves it
 * through the `settings` form service, so the Desktop preferences are read from
 * the describe face rather than by a registered namespace.
 * @param ctx - Host context carrying the settings service.
 * @returns the update-relevant preferences, or undefined before the entry is served.
 */
function readDesktopUpdateSettings(ctx: Context): DesktopUpdateSettings | undefined {
  const entry = ctx.settings.describe()
    .find(candidate => String(candidate.ns) === DESKTOP_SETTINGS_ENTRY_ID)
  return entry?.value as DesktopUpdateSettings | undefined
}

function resolveUpdateSource(value: string, fallback: string): DesktopUpdateSource {
  try {
    return parseDesktopUpdateSource(value)
  } catch {
    return parseDesktopUpdateSource(fallback)
  }
}

function resolveUpdateChannel(value: string, fallback: string): DesktopReleaseChannel | undefined {
  try {
    return parseDesktopUpdateChannel(value)
  } catch {
    return parseDesktopUpdateChannel(fallback)
  }
}

/** Scheduled update policy. */
export interface Config {
  /** Enable background checks in packaged applications. */
  enabled: boolean
  /** Delay before the first background check after plugin activation. */
  initialDelayMs: number
  /** Delay between completion of one background check and the next attempt. */
  intervalMs: number
  /** Maximum duration of one version request before caller-owned cancellation. */
  requestTimeoutMs: number
  /**
   * Where versions and installers come from: `official` (default) uses the DSH
   * Desktop service, `github:<owner>/<repo>` uses that repository's Releases.
   */
  releaseSource: string
  /**
   * Followed update stream: uto (default) follows the installed edition,
   * stable or eta pins the stream independent of the running package.
   */
  releaseChannel: string
}

/** Validated scheduled update policy. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  initialDelayMs: z.number().step(1).min(0).max(MAX_TIMER_DELAY_MS).default(60_000),
  intervalMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(6 * 60 * 60 * 1000),
  requestTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(15_000),
  releaseSource: z.string().default('official'),
  releaseChannel: z.string().default('auto'),
})

/**
 * Register effect-scoped update polling and its dynamic tray command.
 * @param ctx - Host context carrying the desktop native adapter.
 * @param config - validated polling and timeout values.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => {
    const settings = readDesktopUpdateSettings(ctx)
    const source = resolveUpdateSource(settingsOverride(settings?.updateSource, config.releaseSource), config.releaseSource)
    const channel = resolveUpdateChannel(settingsOverride(settings?.updateChannel, config.releaseChannel), config.releaseChannel)
    const lifecycle = startDesktopUpdateLifecycle({
      adapter: ctx.desktopRuntime.updates,
      policy: {
        enabled: config.enabled,
        initialDelayMs: config.initialDelayMs,
        intervalMs: config.intervalMs,
        requestTimeoutMs: config.requestTimeoutMs,
        source,
        ...(channel === undefined ? {} : { channel }),
      },
      locale: () => ctx.desktopRuntime.locale,
      registerTrayItem: item => ctx.desktopRuntime.registerTrayItem(item),
    })
    const rendererOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
    const unregister = ctx.webServer.register({
      kind: 'exact',
      path: DESKTOP_UPDATE_CHECK_PATH,
      handler: (req, res) => {
        const rejection = ctx.connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        return handleDesktopUpdateCheckRequest(
          req,
          res,
          rendererOrigin,
          () => lifecycle.checkNow(),
          (operation, cause) => {
            ctx.logger.error(
              `dsh-plugin-desktop: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
            )
          },
        )
      },
    })
    return async () => {
      unregister()
      await lifecycle.dispose()
    }
  }, 'dsh-plugin-desktop: update polling, confirmation, and installer handoff')
}
