import { describe, expect, it } from 'vitest'
import {
  FORK_UPDATE_REPOSITORY,
  OFFICIAL_UPDATE_SOURCE,
  UPSTREAM_UPDATE_REPOSITORY,
  formatDesktopUpdateSource,
  parseDesktopUpdateSource,
} from '../src/update-source.ts'

describe('desktop update source', () => {
  it.each([undefined, '', 'official', '  OFFICIAL  '])('defaults %s to the official service', value => {
    expect(parseDesktopUpdateSource(value)).toBe(OFFICIAL_UPDATE_SOURCE)
  })

  it.each([['fork', FORK_UPDATE_REPOSITORY], ['Fork', FORK_UPDATE_REPOSITORY], ['upstream', UPSTREAM_UPDATE_REPOSITORY], [' UPSTREAM ', UPSTREAM_UPDATE_REPOSITORY]] as const)(
    'resolves the %s alias to %s',
    (value, repository) => {
      expect(parseDesktopUpdateSource(value)).toEqual({ kind: 'github', repository })
    },
  )

  it.each(['github:example/fork', '  github:example/fork  ', 'github: example/fork '])(
    'parses GitHub repository source %s',
    value => {
      expect(parseDesktopUpdateSource(value)).toEqual({ kind: 'github', repository: 'example/fork' })
    },
  )

  it.each([
    'github:',
    'github:example',
    'github:example/fork/extra',
    'github:/fork',
    'github:example/',
    'gitlab:example/fork',
    'nonsense',
  ])('rejects invalid source %s', value => {
    expect(() => parseDesktopUpdateSource(value)).toThrow('invalid update source')
  })

  it('renders each source back to its canonical spelling', () => {
    expect(formatDesktopUpdateSource(OFFICIAL_UPDATE_SOURCE)).toBe('official')
    expect(formatDesktopUpdateSource({ kind: 'github', repository: FORK_UPDATE_REPOSITORY })).toBe('fork')
    expect(formatDesktopUpdateSource({ kind: 'github', repository: UPSTREAM_UPDATE_REPOSITORY })).toBe('upstream')
    expect(formatDesktopUpdateSource({ kind: 'github', repository: 'example/fork' })).toBe('github:example/fork')
  })
})