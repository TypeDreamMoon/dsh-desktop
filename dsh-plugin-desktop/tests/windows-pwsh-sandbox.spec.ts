import { fileURLToPath } from 'node:url'
import type { ShellExecSpec } from '@deepseek-ai/dsh-shell'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureWindowsConsoleHost,
  type WindowsConsoleHostApi,
} from '../src/windows-console-host.ts'
import {
  adaptWindowsAclExecution,
  desktopWindowsPwshConfig,
  desktopWindowsPwshPath,
  pwshProfileEnabled,
  withoutProfileFlag,
  type WindowsAclAdaptation,
} from '../src/windows-pwsh-sandbox.ts'
const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE'

function consoleApi(overrides: Partial<WindowsConsoleHostApi> = {}): WindowsConsoleHostApi {
  return {
    getConsoleWindow: vi.fn(() => ({})),
    allocConsole: vi.fn(() => 1),
    getLastError: vi.fn(() => 0),
    showWindow: vi.fn(() => 1),
    ...overrides,
  }
}

function shellSpec(env?: Record<string, string>): ShellExecSpec {
  return {
    command: 'Write-Output ok',
    workdir: 'C:\\workspace',
    timeoutMs: 60_000,
    stdoutMaxBytes: 64_000,
    sandboxPolicy: undefined,
    ...(env === undefined ? {} : { env }),
  }
}

const adaptation: WindowsAclAdaptation = {
  platform: 'win32',
  electron: true,
  execPath: 'C:\\Program Files\\DSH Desktop\\DSH Desktop.exe',
  upstreamRunner: 'C:\\Program Files\\DSH Desktop\\resources\\app.asar\\runner.js',
  trampoline: 'C:\\Program Files\\DSH Desktop\\resources\\app.asar\\desktop-runner.js',
}

describe('Windows Electron PowerShell sandbox adaptation', () => {
  it('prefers stable Windows PowerShell locations over PATH-provided portable pwsh', () => {
    const programFilesPwsh = desktopWindowsPwshPath({
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows',
      PATH: 'D:\\AI-Agent\\tools\\pwsh',
    }, 'win32', path => path === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')

    expect(programFilesPwsh).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  })

  it('keeps the regular Program Files PowerShell 7 install as the first Windows choice', () => {
    const programFilesPwsh = desktopWindowsPwshPath({
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows',
    }, 'win32', () => true)

    expect(programFilesPwsh).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
  })

  it('finds a PowerShell 7 installed under a relocated Program Files', () => {
    const relocated = 'D:\\Program Files\\PowerShell\\7\\pwsh.exe'
    const found = desktopWindowsPwshPath({
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows',
      PATH: 'C:\\Windows\\system32;D:\\Program Files\\PowerShell\\7',
    }, 'win32', path => path === relocated
      || path === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')

    expect(found).toBe(relocated)
  })

  it('ignores a portable pwsh even when the PATH candidate exists', () => {
    const portable = 'D:\\AI-Agent\\tools\\pwsh\\pwsh.exe'
    const found = desktopWindowsPwshPath({
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows',
      PATH: 'D:\\AI-Agent\\tools\\pwsh',
    }, 'win32', path => path === portable
      || path === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')

    expect(found).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  })

  it('requires the PowerShell product directory, not only a version directory', () => {
    const decoy = 'D:\\AI-Agent\\7\\pwsh.exe'
    const found = desktopWindowsPwshPath({
      ProgramFiles: 'C:\\missing',
      SystemRoot: 'C:\\Windows',
      PATH: 'D:\\AI-Agent\\7',
    }, 'win32', path => path === decoy
      || path === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')

    expect(found).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  })

  it('reads quoted PATH entries and skips the WindowsApps alias directory', () => {
    const alias = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe'
    const relocated = 'D:\\Program Files\\PowerShell\\7\\pwsh.exe'
    const found = desktopWindowsPwshPath({
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows',
      Path: '"C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps";"D:\\Program Files\\PowerShell\\7"',
    }, 'win32', path => path === alias || path === relocated)

    expect(found).toBe(relocated)
  })

  it('keeps explicit pwshPath config and non-Windows config unchanged', () => {
    const explicit = { cwd: 'C:\\workspace', pwshPath: 'D:\\tools\\pwsh\\pwsh.exe' }
    expect(desktopWindowsPwshConfig(explicit, {}, 'win32')).toBe(explicit)

    const nonWindows = { cwd: '/workspace' }
    expect(desktopWindowsPwshConfig(nonWindows, {}, 'darwin')).toBe(nonWindows)
  })

  it('carries the Desktop profile preference through the row config', () => {
    const configured = { cwd: 'C:\\workspace', pwshPath: 'D:\\pwsh.exe', pwshProfile: true }
    expect(desktopWindowsPwshConfig(configured, {}, 'win32')).toBe(configured)

    const resolved = desktopWindowsPwshConfig({ cwd: 'C:\\workspace', pwshProfile: true }, {
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows',
    }, 'win32', () => true)

    expect(resolved.pwshProfile).toBe(true)
    expect(pwshProfileEnabled(resolved)).toBe(true)
    expect(pwshProfileEnabled({ cwd: 'C:\\workspace' })).toBe(false)
    expect(pwshProfileEnabled({ cwd: 'C:\\workspace', pwshProfile: false })).toBe(false)
  })

  it('drops only the profile-suppressing element from a pwsh argv', () => {
    const command = '-NoProfile'
    const argv = [
      'D:\\pwsh.exe',
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      command,
    ]

    expect(withoutProfileFlag(argv)).toEqual([
      'D:\\pwsh.exe',
      '-NoLogo',
      '-NonInteractive',
      '-Command',
      command,
    ])
    expect(withoutProfileFlag(['D:\\pwsh.exe', '-NoLogo', '-NonInteractive'])).toEqual([
      'D:\\pwsh.exe',
      '-NoLogo',
      '-NonInteractive',
    ])
  })

  it('defaults Windows sandbox config to a stable system PowerShell when available', () => {
    const result = desktopWindowsPwshConfig({ cwd: 'C:\\workspace' }, {
      ProgramFiles: 'C:\\missing',
      SystemRoot: 'C:\\Windows',
      PATH: 'D:\\portable\\pwsh',
    }, 'win32', path => path === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')

    expect(result).toEqual({
      cwd: 'C:\\workspace',
      pwshPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    })
  })

  it('adapts only the exact Electron-hosted win32 ACL runner argv', () => {
    const env = Object.freeze({ KEEP: 'value' })
    const spec = Object.freeze(shellSpec(env))
    const argv = Object.freeze([
      adaptation.execPath,
      adaptation.upstreamRunner,
      '--workspace',
      'C:\\workspace',
      '--',
      'powershell.exe',
      '-Command',
      'Write-Output ok',
    ])

    const result = adaptWindowsAclExecution(spec, argv, adaptation)

    expect(result.spec).not.toBe(spec)
    expect(result.argv).toEqual([
      adaptation.execPath,
      adaptation.trampoline,
      adaptation.upstreamRunner,
      '--workspace',
      'C:\\workspace',
      '--',
      'powershell.exe',
      '-Command',
      'Write-Output ok',
    ])
    expect(result.spec.env).toEqual({
      KEEP: 'value',
      [RUN_AS_NODE]: '1',
    })
    expect(spec.env).toBe(env)
    expect(argv).toEqual([
      adaptation.execPath,
      adaptation.upstreamRunner,
      '--workspace',
      'C:\\workspace',
      '--',
      'powershell.exe',
      '-Command',
      'Write-Output ok',
    ])
  })

  it.each([
    ['non-Windows host', { platform: 'darwin' as const }],
    ['plain Node host', { electron: false }],
    ['different executable', { execPath: 'C:\\other\\electron.exe' }],
    ['different runner', { upstreamRunner: 'C:\\other\\runner.js' }],
  ])('leaves a %s invocation and its object identities unchanged', (_label, override) => {
    const spec = shellSpec({ KEEP: 'value' })
    const argv = [adaptation.execPath, adaptation.upstreamRunner, '--', 'powershell.exe']

    const result = adaptWindowsAclExecution(spec, argv, { ...adaptation, ...override })

    expect(result.spec).toBe(spec)
    expect(result.argv).toBe(argv)
    expect(result.spec.env).toEqual({ KEEP: 'value' })
  })

  it('leaves the danger-full-access direct PowerShell argv unchanged', () => {
    const spec = shellSpec({ KEEP: 'value' })
    const argv = [
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Write-Output ok',
    ]

    const result = adaptWindowsAclExecution(spec, argv, adaptation)

    expect(result).toEqual({ spec, argv })
    expect(result.spec).toBe(spec)
    expect(result.argv).toBe(argv)
    expect(result.spec.env).not.toHaveProperty(RUN_AS_NODE)
  })

  it('removes every inherited Node-mode key case-insensitively', () => {
    const spec = shellSpec({
      electron_run_as_node: 'legacy-value',
      KEEP: 'value',
    })
    const argv = [adaptation.execPath, adaptation.upstreamRunner, '--', 'powershell.exe']

    const result = adaptWindowsAclExecution(spec, argv, adaptation)

    expect(result.spec.env).toEqual({
      KEEP: 'value',
      [RUN_AS_NODE]: '1',
    })
    expect(spec.env).toEqual({
      electron_run_as_node: 'legacy-value',
      KEEP: 'value',
    })
  })

  it('puts Node-mode variables only on the adapted child spec', () => {
    const previousRunAsNode = process.env[RUN_AS_NODE]
    process.env[RUN_AS_NODE] = 'host-value'
    try {
      const spec = shellSpec({ KEEP: 'value' })
      const result = adaptWindowsAclExecution(
        spec,
        [adaptation.execPath, adaptation.upstreamRunner, '--', 'powershell.exe'],
        adaptation,
      )

      expect(result.spec.env?.[RUN_AS_NODE]).toBe('1')
      expect(spec.env).toEqual({ KEEP: 'value' })
      expect(process.env[RUN_AS_NODE]).toBe('host-value')
    } finally {
      if (previousRunAsNode === undefined) delete process.env[RUN_AS_NODE]
      else process.env[RUN_AS_NODE] = previousRunAsNode
    }
  })
})

describe('Windows ACL runner trampoline', () => {
  const originalArgv = process.argv
  const originalExitCode = process.exitCode
  const originalRunAsNode = process.env[RUN_AS_NODE]
  const originalLowercaseRunAsNode = process.env.electron_run_as_node

  afterEach(() => {
    process.argv = originalArgv
    process.exitCode = originalExitCode
    if (originalRunAsNode === undefined) delete process.env[RUN_AS_NODE]
    else process.env[RUN_AS_NODE] = originalRunAsNode
    if (originalLowercaseRunAsNode === undefined) delete process.env.electron_run_as_node
    else process.env.electron_run_as_node = originalLowercaseRunAsNode
    vi.restoreAllMocks()
  })

  it('leaves the console untouched when the runner fails validation', async () => {
    const ensureWindowsConsoleHost = vi.fn()
    vi.doMock('../src/windows-console-host.ts', () => ({ ensureWindowsConsoleHost }))
    process.argv = [process.execPath, 'windows-acl-runner.js', 'unexpected-runner.js']
    const stderr = vi.spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as typeof process.stderr.write)

    const runnerModule: string = '../src/windows-acl-runner.ts?console-after-validation'
    await import(/* @vite-ignore */ runnerModule)
    await new Promise<void>(resolve => setImmediate(resolve))

    expect(ensureWindowsConsoleHost).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(127)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('unexpected ACL runner'))
    vi.doUnmock('../src/windows-console-host.ts')
  })

  it('fails closed without importing the upstream runner when console setup fails', async () => {
    const upstreamRunner = fileURLToPath(
      import.meta.resolve('@deepseek-ai/dsh-sandbox-windows-acl/runner'),
    )
    const argv = [process.execPath, 'windows-acl-runner.js', upstreamRunner, 'shell-argument']
    vi.doMock('../src/windows-console-host.ts', () => ({
      ensureWindowsConsoleHost: () => {
        throw new Error('could not allocate a console for the Windows ACL runner (Win32 5)')
      },
    }))
    process.argv = [...argv]
    const stderr = vi.spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as typeof process.stderr.write)

    const runnerModule: string = '../src/windows-acl-runner.ts?console-failure'
    await import(/* @vite-ignore */ runnerModule)
    await new Promise<void>(resolve => setImmediate(resolve))

    expect(process.exitCode).toBe(127)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining(
      'windows-acl-run: desktop trampoline: could not allocate a console for the Windows ACL runner (Win32 5)',
    ))
    // argv 未被改写，说明失败发生在重建上游 argv 与导入上游 runner 之前：
    // 受限子进程绝不会在没有 console 的情况下被启动。
    expect(process.argv).toEqual(argv)
    vi.doUnmock('../src/windows-console-host.ts')
  })

  it('removes Node mode from the target environment before rejecting an unexpected runner', async () => {
    process.argv = [process.execPath, 'windows-acl-runner.js', 'unexpected-runner.js']
    process.env[RUN_AS_NODE] = '1'
    process.env.electron_run_as_node = 'legacy-value'
    const stderr = vi.spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as typeof process.stderr.write)

    const runnerModule: string = '../src/windows-acl-runner.ts?unexpected-runner-test'
    await import(/* @vite-ignore */ runnerModule)
    await new Promise<void>(resolve => setImmediate(resolve))

    expect(process.env[RUN_AS_NODE]).toBeUndefined()
    expect(process.env.electron_run_as_node).toBeUndefined()
    expect(process.exitCode).toBe(127)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining(
      'windows-acl-run: desktop trampoline: desktop trampoline received an unexpected ACL runner',
    ))
  })

})

describe('Windows ACL runner console host', () => {
  it('does not load native APIs outside Windows', () => {
    const loadApi = vi.fn(() => consoleApi())

    ensureWindowsConsoleHost('darwin', loadApi)

    expect(loadApi).not.toHaveBeenCalled()
  })

  it('keeps an existing console unchanged', () => {
    const api = consoleApi()

    ensureWindowsConsoleHost('win32', () => api)

    expect(api.allocConsole).not.toHaveBeenCalled()
    expect(api.showWindow).not.toHaveBeenCalled()
  })

  it('allocates and hides a console for a consoleless Windows runner', () => {
    const allocatedWindow = {}
    const calls: string[] = []
    const api = consoleApi({
      getConsoleWindow: vi.fn(() => {
        calls.push('get-console')
        return calls.length === 1 ? null : allocatedWindow
      }),
      allocConsole: vi.fn(() => {
        calls.push('allocate')
        return 1
      }),
      showWindow: vi.fn((window, command) => {
        expect(window).toBe(allocatedWindow)
        calls.push(`hide-${command}`)
        return 1
      }),
    })

    ensureWindowsConsoleHost('win32', () => api)

    expect(calls).toEqual(['get-console', 'allocate', 'get-console', 'hide-0'])
  })

  it('fails closed with the native error when console allocation fails', () => {
    const api = consoleApi({
      getConsoleWindow: vi.fn(() => null),
      allocConsole: vi.fn(() => 0),
      getLastError: vi.fn(() => 5),
    })

    expect(() => ensureWindowsConsoleHost('win32', () => api)).toThrow(
      'could not allocate a console for the Windows ACL runner (Win32 5)',
    )
    expect(api.showWindow).not.toHaveBeenCalled()
  })

  it('accepts a successful allocation without a visible console window', () => {
    const api = consoleApi({
      getConsoleWindow: vi.fn(() => null),
    })

    ensureWindowsConsoleHost('win32', () => api)

    expect(api.allocConsole).toHaveBeenCalledOnce()
    expect(api.showWindow).not.toHaveBeenCalled()
  })
})
