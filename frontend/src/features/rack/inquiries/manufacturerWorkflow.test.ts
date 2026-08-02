import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../lib/device'
import { surveyBatteryManufacturerIdentity } from './manufacturerWorkflow'

describe('battery manufacturer identity survey', () => {
  it('discovers references and summarizes each manufacturer response serially', async () => {
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_MANUFACTURER_INFO, responseClass: 0, responseType: 7, responseLength: 8 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_MANUFACTURER_INFO, responseClass: 0, responseType: 7, responseLength: 8 },
      { outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 3, type: SinkInquiryType.GET_MANUFACTURER_INFO, responseClass: 0, responseType: 0, responseLength: 0 },
    ]
    const scedb = new Uint8Array(24)
    scedb[22] = 0x11
    const responses = [
      scedb,
      new Uint8Array([0x34, 0x12, 0x78, 0x56, 0x41, 0x43, 0x4d, 0]),
    ]
    const sent: SinkInquiryType[] = []
    const result = await surveyBatteryManufacturerIdentity({
      sendInquiryRequest: vi.fn(async (request) => { sent.push(request.type) }),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    }, undefined)

    expect(result.references).toEqual([0, 4])
    expect(sent).toEqual([
      SinkInquiryType.GET_SOURCE_CAP_EXTENDED,
      SinkInquiryType.GET_MANUFACTURER_INFO,
      SinkInquiryType.GET_MANUFACTURER_INFO,
    ])
    expect(result.summary).toContain([
      '- **Battery 0 (fixed):**',
      '  - **VID:** 0x1234',
      '  - **PID:** 0x5678',
      '  - **Manufacturer:** ACM',
      '  - **Battery reference:** Advertised',
    ].join('\n'))
    expect(result.summary).toContain([
      '- **Battery 4 (hot-swappable slot 0):**',
      '  - **Outcome:** Not Supported.',
    ].join('\n'))
    expect(result.eventData?.map(({ title }) => title)).toEqual([
      'Source Capabilities Extended',
      'Battery 0 — Fixed battery 0',
      'Battery 4 — Hot-swappable slot 0',
    ])
    expect(result.eventData![1].entries.find(({ key }) => key === 'Vendor ID (bytes 0–1)')?.value).toContain('0x1234')
    expect(result.eventData![1].entries.find(({ key }) => key === 'Manufacturer String (bytes 4–end)')?.value).toContain('41 43 4D 00')
    expect(result.eventData![1].entries.find(({ key }) => key === 'Raw Logical Response')?.value).toContain('34 12 78 56 41 43 4D 00')
    expect(result.eventData![2].entries.find(({ key }) => key === 'Outcome')?.value).toBe('Not Supported')
  })
})
