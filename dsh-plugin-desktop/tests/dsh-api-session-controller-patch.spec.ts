import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const patch = readFileSync(new URL(
  '../../patches/dsh-api-session-controller@0.1.5-rc.2.patch',
  import.meta.url,
), 'utf8')

describe('api session-controller root-workspace patch', () => {
  it('tolerates a Windows drive-root mkdir EPERM when the directory already exists', () => {
    for (const marker of [
      'import { mkdir, stat } from "node:fs/promises";',
      'existingDirectory = (await stat(cwd)).isDirectory();',
      'if (!existingDirectory) {',
      'failed to ensure project directory',
    ]) {
      expect(patch).toContain(marker)
    }
  })
})