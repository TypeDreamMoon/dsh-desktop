/** Electron adapter for the upstream Windows ACL PowerShell executor. */

import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { win32 } from 'node:path'
import type { ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'
import type { Config as PwshConfig } from '@deepseek-ai/dsh-pwsh-local'

const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE'
const UPSTREAM_RUNNER = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-sandbox-windows-acl/runner'))
const DESKTOP_TRAMPOLINE = fileURLToPath(new URL('./windows-acl-runner.js', import.meta.url))

/** Inputs controlling one exact ACL-runner argv rewrite. */
export interface WindowsAclAdaptation {
  /** Host platform; only Windows is adapted. */
  platform: NodeJS.Platform
  /** Whether the current Host executable is Electron. */
  electron: boolean
  /** Current Electron executable path. */
  execPath: string
  /** Resolved upstream ACL runner path. */
  upstreamRunner: string
  /** Desktop-owned Node-mode trampoline path. */
  trampoline: string
}

/** Adapted execution inputs passed to the ordinary local executor. */
export interface AdaptedWindowsAclExecution {
  /** Spec carrying the runner-only Electron environment. */
  spec: ShellExecSpec
  /** Exact argv, with the desktop trampoline inserted when required. */
  argv: readonly string[]
}

/**
 * Whether one pwsh candidate sits in the `…\PowerShell\7\` installation layout.
 *
 * The layout is what separates an installation from the two PATH-reachable pwsh
 * shapes this probe keeps ignoring: an unpacked portable archive, and the
 * `WindowsApps` App Execution Alias that resolves to the Store package.
 * @param candidate - absolute candidate executable path.
 * @returns whether the candidate's parent directories match the install layout.
 */
function isInstalledPwshLayout(candidate: string): boolean {
  const version = win32.dirname(candidate)
  return win32.basename(version) === '7'
    && win32.basename(win32.dirname(version)).toLowerCase() === 'powershell'
}

/**
 * Find a PowerShell 7 installed outside the probed `%ProgramFiles%` root.
 *
 * A relocated Program Files on another drive keeps the canonical
 * `PowerShell\7` layout, so PATH carries it even though this probe deliberately
 * ignores PATH-provided portable runtimes.
 * @param env - process environment carrying PATH.
 * @param exists - executable existence probe.
 * @returns the first installed-layout PATH candidate, or undefined.
 */
function relocatedPwshPath(
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
): string | undefined {
  const raw = env.PATH ?? env.Path ?? env.path ?? ''
  for (const entry of raw.split(win32.delimiter)) {
    const directory = entry.trim().replace(/^"(.*)"$/, '$1')
    if (directory.length === 0) continue
    const candidate = win32.join(directory, 'pwsh.exe')
    if (isInstalledPwshLayout(candidate) && exists(candidate)) return candidate
  }
  return undefined
}

/**
 * Resolve the PowerShell the Desktop Windows sandbox runs commands through.
 *
 * The standard install stays first, a PowerShell 7 under a relocated Program
 * Files follows, and Windows PowerShell 5.1 is the last resort. Every candidate
 * is an absolute path, so a PATH-provided portable runtime never becomes the
 * confined executable. Built with win32 semantics on every host so results are
 * deterministic off Windows.
 * @param env - process environment supplying the probed roots and PATH.
 * @param platform - host platform; only Windows resolves a path.
 * @param exists - executable existence probe.
 * @returns the resolved absolute PowerShell path, or undefined when none exists.
 */
export function desktopWindowsPwshPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (platform !== 'win32') return undefined
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  const systemRoot = env.SystemRoot ?? 'C:\\Windows'
  const installed = win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe')
  if (exists(installed)) return installed
  const relocated = relocatedPwshPath(env, exists)
  if (relocated !== undefined) return relocated
  const windowsPowerShell = win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return exists(windowsPowerShell) ? windowsPowerShell : undefined
}

/**
 * Desktop-injected keys that ride the upstream pwsh config.
 *
 * schemastery keeps unknown keys, so a key the Desktop adds to the composed row
 * config reaches the executor even though the upstream schema does not name it.
 */
export interface DesktopPwshConfig extends PwshConfig {
  /** Whether commands load the user's PowerShell profile instead of running `-NoProfile`. */
  pwshProfile?: boolean
}

/** The upstream element that suppresses PowerShell profile loading. */
const NO_PROFILE_FLAG = '-NoProfile'

/** The upstream element that separates the command text from the pwsh options. */
const COMMAND_FLAG = '-Command'

/**
 * Whether one Desktop pwsh config asks commands to load the user's profile.
 * @param config - composed pwsh config carrying the Desktop keys.
 * @returns whether profile loading was requested.
 */
export function pwshProfileEnabled(config: DesktopPwshConfig): boolean {
  return config.pwshProfile === true
}

/**
 * Drop the `-NoProfile` element from one upstream pwsh argv.
 *
 * Only elements ahead of `-Command` are candidates: the command text travels as
 * the single element after it, and a command that happens to read `-NoProfile`
 * must survive. An argv with no `-Command` element is returned unchanged, so an
 * upstream option-shape change suppresses profile loading rather than trimming
 * an element this function cannot place.
 * @param argv - the upstream pwsh invocation argv.
 * @returns the same argv without the profile-suppressing option.
 */
export function withoutProfileFlag(argv: readonly string[]): string[] {
  const commandIndex = argv.indexOf(COMMAND_FLAG)
  if (commandIndex === -1) return [...argv]
  return argv.filter((argument, index) => index >= commandIndex || argument !== NO_PROFILE_FLAG)
}

/** Keep explicit user config, otherwise avoid PATH-resolved portable pwsh in the Windows ACL sandbox. */
export function desktopWindowsPwshConfig(
  config: DesktopPwshConfig,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean = existsSync,
): DesktopPwshConfig {
  if (config.pwshPath !== undefined && config.pwshPath.length > 0) return config
  const pwshPath = desktopWindowsPwshPath(env, platform, exists)
  return pwshPath === undefined ? config : { ...config, pwshPath }
}

/**
 * Insert the desktop Node-mode trampoline for the exact upstream ACL runner.
 * @param spec - resolved PowerShell execution spec.
 * @param argv - argv after the upstream sandbox provider has confined it.
 * @param adaptation - executable and runner identities for this Host.
 * @returns unchanged inputs for every non-runner call, otherwise the isolated runner launch.
 */
export function adaptWindowsAclExecution(
  spec: ShellExecSpec,
  argv: readonly string[],
  adaptation: WindowsAclAdaptation,
): AdaptedWindowsAclExecution {
  const [program, runner, ...args] = argv
  if (adaptation.platform !== 'win32'
    || !adaptation.electron
    || program !== adaptation.execPath
    || runner !== adaptation.upstreamRunner) {
    return { spec, argv }
  }

  const env = { ...spec.env }
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === RUN_AS_NODE) delete env[key]
  }
  env[RUN_AS_NODE] = '1'
  return {
    spec: { ...spec, env },
    argv: [adaptation.execPath, adaptation.trampoline, adaptation.upstreamRunner, ...args],
  }
}

/** PowerShell sandbox provider that repairs only Electron-hosted Windows ACL launches. */
export class DesktopWindowsPwshSandbox extends SandboxPwshExecutor {
  private readonly loadProfile: boolean

  constructor(ctx: ConstructorParameters<typeof SandboxPwshExecutor>[0], config: DesktopPwshConfig) {
    const resolved = desktopWindowsPwshConfig(config, process.env, process.platform)
    super(ctx, resolved)
    this.loadProfile = pwshProfileEnabled(resolved)
  }

  /**
   * Build the pwsh invocation, honouring the Desktop profile preference.
   *
   * Read from the constructor-resolved config rather than the live settings
   * section: the preference is a composed row key, so a running Host keeps the
   * value it was launched with until the next generation.
   * @param spec - resolved PowerShell execution spec.
   * @returns the upstream argv, without `-NoProfile` when the user asked for profile loading.
   */
  protected override argv(spec: ShellExecSpec): string[] {
    const argv = super.argv(spec)
    return this.loadProfile ? withoutProfileFlag(argv) : argv
  }

  private adapt(spec: ShellExecSpec, argv: readonly string[]): AdaptedWindowsAclExecution {
    return adaptWindowsAclExecution(spec, argv, {
      platform: process.platform,
      electron: process.versions.electron !== undefined,
      execPath: process.execPath,
      upstreamRunner: UPSTREAM_RUNNER,
      trampoline: DESKTOP_TRAMPOLINE,
    })
  }

  /**
   * Adapt the exact argv the upstream sandbox produced, keeping confinement
   * preparation inside the caller's deadline. Preparation only yields argv after
   * this executor has handed a spec to the local executor, so the runner-only
   * Electron environment lands on this class's own spec copy at the moment the
   * argv becomes known - strictly before the local executor reads the spec to
   * build its spawn request.
   * @param spec - resolved PowerShell execution spec.
   * @param argvOrPrepare - exact argv, or preparation sharing the execution deadline.
   * @returns the foreground result and whether argv reached the subprocess provider.
   */
  protected override runArgv(
    spec: ShellExecSpec,
    argvOrPrepare: readonly string[] | ((signal: AbortSignal) => Promise<readonly string[]>),
  ): Promise<{ result: ShellRunResult, spawnRequested: boolean }> {
    if (typeof argvOrPrepare !== 'function') {
      const adapted = this.adapt(spec, argvOrPrepare)
      return super.runArgv(adapted.spec, adapted.argv)
    }
    const pending: ShellExecSpec = { ...spec }
    return super.runArgv(pending, async signal => {
      const adapted = this.adapt(spec, await argvOrPrepare(signal))
      pending.env = adapted.spec.env
      return adapted.argv
    })
  }

  protected override startArgv(spec: ShellExecSpec, argv: readonly string[]): ShellProcess {
    const adapted = this.adapt(spec, argv)
    return super.startArgv(adapted.spec, adapted.argv)
  }
}

export default DesktopWindowsPwshSandbox
