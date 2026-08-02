import { describe, expect, it } from 'vitest'
import { SinkInquiryType } from '../../../lib/device'
import { batteryReferencesFromScedb, buildAllBatterySurveySteps, buildBatterySurveySteps } from './batteryWorkflow'

describe('battery survey helpers', () => {
  it('maps mixed fixed/hot-swappable SCEDB counts to protocol references', () => {
    const body = new Uint8Array(24)
    body[22] = 0x32
    expect(batteryReferencesFromScedb(body)).toEqual([0, 1, 4, 5, 6])
  })

  it('builds Cap then Status sequential pairs', () => {
    expect(buildBatterySurveySteps([0, 4]).map(({ request }) => request)).toEqual([
      { type: SinkInquiryType.GET_BATTERY_CAP, batteryReference: 0 },
      { type: SinkInquiryType.GET_BATTERY_STATUS, batteryReference: 0 },
      { type: SinkInquiryType.GET_BATTERY_CAP, batteryReference: 4 },
      { type: SinkInquiryType.GET_BATTERY_STATUS, batteryReference: 4 },
    ])
    expect(buildAllBatterySurveySteps()).toHaveLength(16)
  })

  it('rejects duplicate, invalid, and oversized references', () => {
    expect(() => buildBatterySurveySteps([0, 0])).toThrow()
    expect(() => buildBatterySurveySteps([8])).toThrow()
  })
})
