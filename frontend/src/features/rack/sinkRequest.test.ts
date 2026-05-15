import { describe, expect, it } from 'vitest'
import { SinkPdoType } from '../../lib/device'
import { buildSinkRequestArgs, computeEprAvsMaxCurrentMa } from './sinkRequest'

describe('sink request argument builder', () => {
  const eprAvsPdo = {
    type: SinkPdoType.EPR_AVS,
    minVoltageV: 15,
    maxVoltageV: 28,
    maxPowerW: 140,
  } as const

  it('uses advertised max current as default EPR AVS current', () => {
    expect(computeEprAvsMaxCurrentMa(eprAvsPdo, 15000)).toBe(5000)
    expect(buildSinkRequestArgs({
      pdo: eprAvsPdo,
      voltageV: '15',
      currentA: '',
    })).toEqual({
      voltageMv: 15000,
      currentMa: 5000,
    })
  })

  it('clamps excessive EPR AVS current to advertised current limit', () => {
    expect(buildSinkRequestArgs({
      pdo: eprAvsPdo,
      voltageV: '16',
      currentA: '16',
    })).toEqual({
      voltageMv: 16000,
      currentMa: 5000,
    })
  })

  it('keeps non-EPR request types unchanged', () => {
    expect(buildSinkRequestArgs({
      pdo: {
        type: SinkPdoType.SPR_AVS,
        minVoltageV: 9,
        maxVoltageV: 20,
        maxPowerW: 100,
      },
      voltageV: '20',
      currentA: '6',
    })).toEqual({
      error: 'Current must be between 0.00 and 5.00 A.',
    })

    expect(buildSinkRequestArgs({
      pdo: {
        type: SinkPdoType.SPR_PPS,
        minVoltageV: 3.3,
        maxVoltageV: 11,
        maxCurrentA: 3,
      },
      voltageV: '9',
      currentA: '2.5',
    })).toEqual({
      voltageMv: 9000,
      currentMa: 2500,
    })
  })
})
