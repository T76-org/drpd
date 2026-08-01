import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../lib/device'
import { batteryReferencesFromScedb, surveyBatteryCapabilities, surveyBatteryStatus } from './batteryWorkflow'

describe('battery survey helpers', () => {
  it('maps mixed fixed/hot-swappable SCEDB counts to protocol references', () => {
    const body = new Uint8Array(24)
    body[22] = 0x32
    expect(batteryReferencesFromScedb(body)).toEqual([0, 1, 4, 5, 6])
  })

  it('discovers and summarizes every advertised battery capability', async () => {
    const scedb = new Uint8Array(24)
    scedb[22] = 0x11
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 5, responseLength: 9 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 5, responseLength: 9 },
      { outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 3, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 0, responseLength: 0 },
    ]
    const responses = [
      scedb,
      new Uint8Array([0x34, 0x12, 0x78, 0x56, 123, 0, 100, 0, 0]),
    ]
    const sent: string[] = []
    const result = await surveyBatteryCapabilities({
      sendInquiryRequest: vi.fn(async (request) => {
        sent.push(request.type === SinkInquiryType.GET_BATTERY_CAP
          ? `${request.type}:${request.batteryReference}`
          : request.type)
      }),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    })

    expect(sent).toEqual(['GET_SOURCE_CAP_EXTENDED', 'GET_BATTERY_CAP:0', 'GET_BATTERY_CAP:4'])
    expect(result.references).toEqual([0, 4])
    expect(result.summary).toContain('Battery 0 (fixed battery 0): VID 0x1234, PID 0x5678, design capacity 12.3 Wh, last full charge capacity 10.0 Wh, reference valid')
    expect(result.summary).toContain('Battery 4 (hot-swappable slot 0): Not Supported.')
  })

  it('summarizes unsupported battery discovery without querying references', async () => {
    const sendInquiryRequest = vi.fn(async () => undefined)
    const result = await surveyBatteryCapabilities({
      sendInquiryRequest,
      getInquiryStatus: vi.fn()
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 })
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 }),
      getInquiryResponse: vi.fn(),
    })

    expect(sendInquiryRequest).toHaveBeenCalledTimes(1)
    expect(result.summary).toBe('Battery discovery: Not Supported. No Battery_Capabilities requests were sent.')
  })

  it('discovers and summarizes every advertised battery status', async () => {
    const scedb = new Uint8Array(24)
    scedb[22] = 0x11
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_STATUS, responseClass: 2, responseType: 5, responseLength: 4 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_STATUS, responseClass: 2, responseType: 5, responseLength: 4 },
      { outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 3, type: SinkInquiryType.GET_BATTERY_STATUS, responseClass: 0, responseType: 0, responseLength: 0 },
    ]
    const responses = [scedb, new Uint8Array([0, 0x06, 0xf4, 0x01])]
    const sent: string[] = []
    const result = await surveyBatteryStatus({
      sendInquiryRequest: vi.fn(async (request) => {
        sent.push(request.type === SinkInquiryType.GET_BATTERY_STATUS
          ? `${request.type}:${request.batteryReference}`
          : request.type)
      }),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    })

    expect(sent).toEqual(['GET_SOURCE_CAP_EXTENDED', 'GET_BATTERY_STATUS:0', 'GET_BATTERY_STATUS:4'])
    expect(result.references).toEqual([0, 4])
    expect(result.summary).toContain('Battery 0 (fixed battery 0): present yes, present capacity 50.0 Wh, charge state discharging, reference valid; raw 00 06 F4 01.')
    expect(result.summary).toContain('Battery 4 (hot-swappable slot 0): Not Supported.')
  })

  it('summarizes unsupported status discovery without querying references', async () => {
    const sendInquiryRequest = vi.fn(async () => undefined)
    const result = await surveyBatteryStatus({
      sendInquiryRequest,
      getInquiryStatus: vi.fn()
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 })
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 }),
      getInquiryResponse: vi.fn(),
    })

    expect(sendInquiryRequest).toHaveBeenCalledTimes(1)
    expect(result.summary).toBe('Battery discovery: Not Supported. No Battery_Status requests were sent.')
  })
})
