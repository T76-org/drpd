import { describe, expect, it, vi } from 'vitest'
import { parseCableTestResult } from './cableTest'
import { DRPDCCBus } from './ccBus'
import type { DRPDTransport } from './transport'
describe('Cable Test snapshot', () => {
  it('preserves identity body and evidence in one generation', () => {
    const result = parseCableTestResult(['7', 'IDENTITY', '2', '1', '2', '41A800FF00000018000000000000000000000000'])
    expect(result).toMatchObject({ generation: 7, outcome: 'IDENTITY', vconnContact: 2, goodCRC: true, revision: 2 })
    expect(result.body).toHaveLength(20)
  })
  it('accepts empty result without inventing identity', () => {
    expect(parseCableTestResult(['8', 'WAITING', '0', '0', '2', '']).body).toHaveLength(0)
  })
  it.each([
    ['1', 'IDENTITY', '0', '1', '2', '00'.repeat(20)],
    ['1', 'IDENTITY', '1', '1', '2', '00'],
    ['1', 'WAITING', '0', '0', '2', '01'],
    ['1', 'NO_RESPONSE', '3', '0', '2', ''],
    ['1', 'WAITING', '0', '0', '9', ''],
    ['1', 'WAITING', '0', '0', '2', 'GG'],
    ['', 'WAITING', '0', '0', '2', ''],
  ])('rejects inconsistent snapshot %s %s', (...values) => {
    expect(() => parseCableTestResult(values)).toThrow()
  })
  it('queries the public atomic snapshot through the CC group', async () => {
    const queryText = vi.fn().mockResolvedValue(['1', 'WAITING', '0', '0', '2', ''])
    const ccBus = new DRPDCCBus({ queryText } as unknown as DRPDTransport)
    expect((await ccBus.getCableTestResult()).outcome).toBe('WAITING')
    expect(queryText).toHaveBeenCalledWith('CABLE:TEST?')
  })
})
