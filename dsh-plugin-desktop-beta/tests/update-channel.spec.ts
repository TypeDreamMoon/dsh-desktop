import { describe, expect, it } from 'vitest'
import { parseDesktopUpdateChannel } from '../src/update-channel.ts'

describe('desktop update channel preference', () => {
  it.each([undefined, '', 'auto', '  AUTO  '])('resolves %s to the installed edition', value => {
    expect(parseDesktopUpdateChannel(value)).toBeUndefined()
  })

  it.each([['stable', 'stable'], ['beta', 'beta'], [' Beta ', 'beta']] as const)(
    'pins %s to %s',
    (value, expected) => {
      expect(parseDesktopUpdateChannel(value)).toBe(expected)
    },
  )

  it.each(['nightly', 'latest', '1', 'stable-ish'])('rejects invalid channel %s', value => {
    expect(() => parseDesktopUpdateChannel(value)).toThrow('invalid update channel')
  })
})