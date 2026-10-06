import { describe, expect, it, vi } from 'vitest'
import { dispatchCCBusRpc } from './ccBusRpc'
import { CCBusRole } from '../types'
import type { CableTestResult } from '../cableTest'
describe('worker CC bus routing', () => {
  it('routes cable snapshots and transient mode through the actual whitelist', async () => {
    const result: CableTestResult = { generation: 7, outcome: 'WAITING', vconnContact: 0, goodCRC: false, revision: 2, body: new Uint8Array() }
    const ccBus = { getRole: vi.fn().mockResolvedValue(CCBusRole.CABLE_TEST), setRole: vi.fn(), getCableTestResult: vi.fn().mockResolvedValue(result) }
    expect(await dispatchCCBusRpc(ccBus, 'getCableTestResult', [])).toEqual({ handled: true, value: result })
    expect(await dispatchCCBusRpc(ccBus, 'getRole', [])).toEqual({ handled: true, value: CCBusRole.CABLE_TEST })
    expect(await dispatchCCBusRpc(ccBus, 'setRole', [CCBusRole.DISABLED])).toEqual({ handled: true, value: null })
    expect(ccBus.setRole).toHaveBeenCalledWith(CCBusRole.DISABLED)
    expect(await dispatchCCBusRpc(ccBus, 'unknown', [])).toEqual({ handled: false })
  })
})
