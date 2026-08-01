import { describe, expect, it } from 'vitest'
import { buildDiscoverModesSteps, canRetryVdmSurveyStep, deduplicateOrderedSvids, parseDiscoverSvidPage } from './vdmWorkflow'

const words = (...values: number[]) => new Uint8Array(values.flatMap((value) => [value & 0xff, value >>> 8 & 0xff, value >>> 16 & 0xff, value >>> 24 & 0xff]))

describe('Port Partner VDM workflow helpers', () => {
  it('continues a full 12-SVID page and stops on a zero terminator', () => {
    const full = parseDiscoverSvidPage(words(0, 0x00010002, 0x00030004, 0x00050006, 0x00070008, 0x0009000a, 0x000b000c))
    expect(full.ordered).toHaveLength(12)
    expect(full.complete).toBe(false)
    const terminal = parseDiscoverSvidPage(words(0, 0x12340000))
    expect(terminal.complete).toBe(true)
  })

  it('preserves order while deduplicating and bounds all-modes fanout', () => {
    expect(deduplicateOrderedSvids([[1, 2], [2, 3]])).toEqual([1, 2, 3])
    expect(buildDiscoverModesSteps([1, 2, 2])).toHaveLength(2)
    expect(() => buildDiscoverModesSteps(Array.from({ length: 13 }, (_, index) => index + 1))).toThrow('limit of 12')
  })

  it('makes an unterminated safety-bound outcome explicitly non-retryable', () => {
    expect(canRetryVdmSurveyStep(1, true)).toBe(false)
    expect(canRetryVdmSurveyStep(2, false)).toBe(true)
    expect(canRetryVdmSurveyStep(3, false)).toBe(false)
  })

  it('rejects nonzero SVID data after a terminator', () => {
    expect(() => parseDiscoverSvidPage(words(0, 0, 0x12340000))).toThrow('after its zero terminator')
  })
})
