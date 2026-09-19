/** Git Bash discovery for the Desktop-owned Windows shell preset. */

import { existsSync } from 'node:fs'
import { win32 } from 'node:path'

/**
 * Resolve the Git Bash executable a Desktop-generated preset runs commands with.
 *
 * Only a canonical `…\Git\bin\bash.exe` layout is accepted: MSYS2 installs keep
 * it, while the `system32` WSL launcher, the `WindowsApps` App Execution Alias,
 * a portable busybox `ash` and the wsl-bridged `bash.exe` do not. Every
 * candidate is an absolute path.
 * @param env - process environment supplying the probed roots and PATH.
 * @param platform - host platform; only Windows resolves a path.
 * @param exists - executable existence probe.
 * @returns the resolved absolute Git Bash path, or undefined when none exists.
 */
export function desktopGitBashPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (platform !== 'win32') return undefined
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = env.LOCALAPPDATA ?? ''
  const roots = [
    win32.join(programFiles, 'Git'),
    win32.join(programFilesX86, 'Git'),
    ...(localAppData.length === 0 ? [] : [win32.join(localAppData, 'Programs', 'Git')]),
  ]
  for (const root of roots) {
    const installed = win32.join(root, 'bin', 'bash.exe')
    if (exists(installed)) return installed
  }
  return relocatedGitBashPath(env, exists)
}

/**
 * Whether one bash candidate sits in the `…\Git\bin\` installation layout.
 * @param candidate - absolute candidate executable path.
 * @returns whether the candidate's parent directories match the install layout.
 */
function isInstalledGitBashLayout(candidate: string): boolean {
  const bin = win32.dirname(candidate)
  return win32.basename(bin).toLowerCase() === 'bin'
    && win32.basename(win32.dirname(bin)).toLowerCase() === 'git'
}

/**
 * Find a Git for Windows installed outside the probed install roots.
 *
 * Git for Windows does not put `bash.exe` on the Windows PATH, but a Git
 * installed on another drive keeps the canonical layout, so a PATH entry that
 * names it still identifies a real installation.
 * @param env - process environment carrying PATH.
 * @param exists - executable existence probe.
 * @returns the first installed-layout PATH candidate, or undefined.
 */
function relocatedGitBashPath(
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
): string | undefined {
  const raw = env.PATH ?? env.Path ?? env.path ?? ''
  for (const entry of raw.split(win32.delimiter)) {
    const directory = entry.trim().replace(/^"(.*)"$/, '$1')
    if (directory.length === 0) continue
    const candidate = win32.join(directory, 'bash.exe')
    if (isInstalledGitBashLayout(candidate) && exists(candidate)) return candidate
  }
  return undefined
}
