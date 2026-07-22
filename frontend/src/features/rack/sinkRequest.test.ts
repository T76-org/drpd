import { describe, expect, it } from 'vitest'
import { SinkPdoType } from '../../lib/device'
import { buildSinkRequestArgs, computeEprAvsMaxCurrentMa, getSprAvsMaxCurrentA } from './sinkRequest'

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

  it('uses SPR AVS current bands at the 15 V boundary', () => {
    const pdo = {
      type: SinkPdoType.SPR_AVS,
      minVoltageV: 9,
      maxVoltageV: 20,
      maxCurrent15VA: 2.66,
      maxCurrent20VA: 2,
    } as const

    expect(getSprAvsMaxCurrentA(pdo, 9)).toBe(2.66)
    expect(getSprAvsMaxCurrentA(pdo, 15)).toBe(2.66)
    expect(getSprAvsMaxCurrentA(pdo, 15.1)).toBe(2)
    expect(buildSinkRequestArgs({ pdo, voltageV: '9', currentA: '3' })).toEqual({
      error: 'Current must be between 0.00 and 2.66 A.',
    })
    expect(buildSinkRequestArgs({ pdo, voltageV: '18', currentA: '2.1' })).toEqual({
      error: 'Current must be between 0.00 and 2.00 A.',
    })
    expect(buildSinkRequestArgs({ pdo, voltageV: '15', currentA: '2.66' })).toEqual({
      voltageMv: 15000,
      currentMa: 2660,
    })
  })

  it('keeps SPR PPS request behavior unchanged', () => {
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
