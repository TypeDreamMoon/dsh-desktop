import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_GIT_BASH_PRESET_ID,
  DESKTOP_GIT_BASH_PRESET_ROW_ID,
  generateGitBashPreset,
  gitBashPresetPatch,
  removeGitBashPreset,
  shippedPresetPatchPath,
} from '../src/git-bash-preset.ts'

const BASH = 'C:\\Program Files\\Git\\bin\\bash.exe'

function temporaryHome(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-git-bash-preset-'))
}

/** One shipped-preset-shaped declaration carrying the shell rows to replace. */
const SOURCE = [
  '# keep this comment',
  '- insert:',
  '    - id: preset-standard',
  "      name: '@deepseek-ai/dsh-agent-preset'",
  '      config:',
  '        id: standard',
  '        order: 5',
  '        plugins:',
  '          - id: persona',
  "            name: '@deepseek-ai/dsh-persona'",
  '          # shell rows',
  '          - id: tool-bash',
  "            name: '@deepseek-ai/dsh-tool-bash'",
  "            disabled: !!js process.platform === 'win32'",
  '          - id: tool-pwsh',
  "            name: '@deepseek-ai/dsh-tool-pwsh'",
  "            disabled: !!js process.platform !== 'win32'",
  '          - id: tool-todo',
  "            name: '@deepseek-ai/dsh-tool-todo'",
  "            disabled: !!js process.platform === 'win32'",
  '',
].join('\n')

describe('Git Bash preset declaration', () => {
  it('re-identifies the declaration and swaps the one-shot shell rows', () => {
    const patch = gitBashPresetPatch(SOURCE, BASH)

    expect(patch).toContain('# keep this comment')
    expect(patch).toContain(`id: ${DESKTOP_GIT_BASH_PRESET_ROW_ID}`)
    expect(patch).toContain(`id: ${DESKTOP_GIT_BASH_PRESET_ID}`)
    expect(patch).not.toContain('name: standard')
    expect(patch).toContain('id: persona')
    expect(patch).toContain('id: tool-todo')
    expect(patch).not.toMatch(/id: tool-pwsh/u)
    expect(patch).not.toMatch(/id: tool-bash$/mu)
    expect(patch).toContain('id: shell-git-bash')
    expect(patch).toContain('@deepseek-ai/dsh-terminal-bash')
    expect(patch).toContain('shellDialect: bash')
    expect(patch).toContain(`shellPath: ${BASH}`)
    expect(patch).toContain('id: tool-bash-persistent')
    expect(patch).toContain('@deepseek-ai/dsh-tool-bash-persistent')
    // `!!js` expressions of a surviving row reach the generated preset verbatim.
    expect(patch).toContain("disabled: !!js process.platform === 'win32'")
  })

  it('rejects a patch that declares no agent preset', () => {
    expect(() => gitBashPresetPatch('name: preset\n', BASH))
      .toThrow('must be a YAML sequence of rows')
    expect(() => gitBashPresetPatch('- id: unrelated\n  disabled: false\n', BASH))
      .toThrow('declares no agent preset')
  })
})

describe('Git Bash preset generation', () => {
  it('writes the overlay patch and regenerates it without duplicating rows', () => {
    const home = temporaryHome()
    const path = join(home, 'desktop', 'git-bash.preset.patch.yml')
    const generated = generateGitBashPreset(path, SOURCE, BASH, 'standard')

    expect(generated.id).toBe(DESKTOP_GIT_BASH_PRESET_ID)
    expect(generated.path).toBe(path)
    expect(generated.source).toBe('standard')
    expect(existsSync(path)).toBe(true)

    const written = readFileSync(path, 'utf8')
    expect(written).toContain(`shellPath: ${BASH}`)
    expect(written).not.toContain('@deepseek-ai/dsh-tool-pwsh')

    generateGitBashPreset(path, SOURCE, BASH, 'standard')

    const regenerated = readFileSync(path, 'utf8')
    expect(regenerated.match(/id: shell-git-bash/gu)).toHaveLength(1)
    expect(regenerated.match(/id: tool-bash-persistent/gu)).toHaveLength(1)
    expect(regenerated.match(new RegExp(`id: ${DESKTOP_GIT_BASH_PRESET_ROW_ID}`, 'gu'))).toHaveLength(1)
  })

  it('removes a previously generated overlay', () => {
    const home = temporaryHome()
    const path = join(home, 'desktop', 'git-bash.preset.patch.yml')
    generateGitBashPreset(path, SOURCE, BASH)
    expect(existsSync(path)).toBe(true)

    removeGitBashPreset(path)
    expect(existsSync(path)).toBe(false)
  })

  it('resolves a shipped preset patch from the installed web bundle', () => {
    const path = shippedPresetPatchPath('standard')
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('@deepseek-ai/dsh-agent-preset')
  })
})
