import { describe, expect, it } from 'vitest'
import { desktopGitBashPath } from '../src/git-bash.ts'

const SYSTEM32_WSL = 'C:\\WINDOWS\\system32\\bash.exe'
const WINDOWS_APPS_ALIAS = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe'

describe('Git Bash discovery', () => {
  it('prefers the machine-wide Git installation', () => {
    const found = desktopGitBashPath({
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    }, 'win32', () => true)

    expect(found).toBe('C:\\Program Files\\Git\\bin\\bash.exe')
  })

  it('falls back to the per-user and 32-bit installations', () => {
    const installed = 'C:\\Users\\me\\AppData\\Local\\Programs\\Git\\bin\\bash.exe'
    const found = desktopGitBashPath({
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    }, 'win32', path => path === installed)

    expect(found).toBe(installed)
  })

  it('finds a Git installed outside the probed roots through its canonical PATH layout', () => {
    const relocated = 'D:\\Tools\\Git\\bin\\bash.exe'
    const found = desktopGitBashPath({
      ProgramFiles: 'C:\\missing',
      'ProgramFiles(x86)': 'C:\\missing',
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
      Path: 'C:\\WINDOWS\\system32;D:\\Tools\\Git\\bin',
    }, 'win32', path => path === relocated || path === SYSTEM32_WSL)

    expect(found).toBe(relocated)
  })

  it('never selects a non-Git bash that sits on PATH', () => {
    const candidates = [
      SYSTEM32_WSL,
      WINDOWS_APPS_ALIAS,
      'C:\\w64devkit\\w64devkit\\bin\\bash.exe',
      'D:\\Tools\\7\\bash.exe',
    ]
    const found = desktopGitBashPath({
      ProgramFiles: 'C:\\missing',
      'ProgramFiles(x86)': 'C:\\missing',
      LOCALAPPDATA: 'C:\\missing',
      PATH: [
        'C:\\WINDOWS\\system32',
        'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps',
        'C:\\w64devkit\\w64devkit\\bin',
        'D:\\Tools\\7',
      ].join(';'),
    }, 'win32', path => candidates.includes(path))

    expect(found).toBeUndefined()
  })

  it('reads quoted PATH entries and resolves nothing off Windows', () => {
    const relocated = 'D:\\Tools\\Git\\bin\\bash.exe'
    const found = desktopGitBashPath({
      ProgramFiles: 'C:\\missing',
      'ProgramFiles(x86)': 'C:\\missing',
      LOCALAPPDATA: 'C:\\missing',
      Path: '"D:\\Tools\\Git\\bin"',
    }, 'win32', path => path === relocated)

    expect(found).toBe(relocated)
    expect(desktopGitBashPath({}, 'darwin')).toBeUndefined()
    expect(desktopGitBashPath({ ProgramFiles: 'C:\\Program Files' }, 'linux', () => true))
      .toBeUndefined()
  })
})
