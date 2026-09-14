import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_UPDATE_SOURCE,
  formatDesktopUpdateSource,
  parseDesktopUpdateSource,
} from '../src/update-source.ts'

describe('desktop update source', () => {
  it.each([undefined, '', 'official', '  official  '])('defaults %s to the official source', value => {
    expect(parseDesktopUpdateSource(value)).toEqual({ kind: 'official' })
    expect(parseDesktopUpdateSource(value)).toBe(OFFICIAL_UPDATE_SOURCE)
  })

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
    expect(formatDesktopUpdateSource({ kind: 'github', repository: 'example/fork' })).toBe('github:example/fork')
  })
})
