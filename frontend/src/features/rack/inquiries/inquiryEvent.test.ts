import { describe, expect, it } from 'vitest'
import {
  SinkInquiryCablePlug,
  SinkInquiryOutcome,
  SinkInquiryType,
  type SinkInquiryRequest,
  type SinkInquiryStatus,
} from '../../../lib/device'
import { inquiryEventTitle, presentInquiryResponse } from './inquiryEvent'

const response = (request: SinkInquiryRequest, rawResponse: Uint8Array, responseClass: number, responseType: number) => ({
  phase: 'response' as const,
  request,
  rawResponse,
  status: {
    outcome: SinkInquiryOutcome.RESPONSE,
    requestId: 7,
    type: request.type,
    responseClass,
    responseType,
    responseLength: rawResponse.length,
  } satisfies SinkInquiryStatus,
})

describe('inquiry event presentation', () => {
  it('uses the exact unique source and cable titles', () => {
    const requests: SinkInquiryRequest[] = [
      { type: SinkInquiryType.GET_SOURCE_CAP },
      { type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED },
      { type: SinkInquiryType.GET_STATUS },
      { type: SinkInquiryType.GET_SOURCE_INFO },
      { type: SinkInquiryType.GET_PPS_STATUS },
      { type: SinkInquiryType.GET_REVISION },
      { type: SinkInquiryType.GET_MANUFACTURER_INFO, target: 'PORT' },
      { type: SinkInquiryType.GET_COUNTRY_CODES },
      { type: SinkInquiryType.GET_STATUS, plug: SinkInquiryCablePlug.SOP_PRIME },
      { type: SinkInquiryType.GET_STATUS, plug: SinkInquiryCablePlug.SOP_DOUBLE_PRIME },
      { type: SinkInquiryType.GET_REVISION, plug: SinkInquiryCablePlug.SOP_PRIME },
      { type: SinkInquiryType.GET_MANUFACTURER_INFO, target: SinkInquiryCablePlug.SOP_DOUBLE_PRIME },
      { type: SinkInquiryType.DISCOVER_IDENTITY, plug: SinkInquiryCablePlug.SOP_PRIME },
      { type: SinkInquiryType.DISCOVER_SVIDS, plug: SinkInquiryCablePlug.SOP_DOUBLE_PRIME },
      { type: SinkInquiryType.DISCOVER_MODES, plug: SinkInquiryCablePlug.SOP_PRIME, svid: 0xff01 },
    ]
    const titles = requests.map(inquiryEventTitle)
    expect(titles).toContain('INQUIRY - Source status')
    expect(titles).toContain('INQUIRY - Revision')
    expect(titles).toContain('INQUIRY - SOP′ cable status')
    expect(titles).toContain('INQUIRY - SOP″ cable manufacturer identity')
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('renders source PDOs as nested Markdown and structured raw evidence', () => {
    const request = { type: SinkInquiryType.GET_SOURCE_CAP } as const
    const raw = new Uint8Array([0x2c, 0x91, 0x01, 0x00])
    const event = presentInquiryResponse(request, response(request, raw, 2, 0x01))
    expect(event.title).toBe('INQUIRY - Source capabilities')
    expect(event.summary).toContain('- **PDO 1 (FIXED):**\n  - **Capability:**')
    expect(event.eventData[0].entries.at(-1)).toMatchObject({ key: 'Raw Logical Response' })
    expect(event.eventData[1].title).toBe('PDO 1 — FIXED')
    expect(event.eventData[1].entries.map(({ key }) => key)).toEqual(expect.arrayContaining([
      'Dual-Role Power (bit 29)',
      'Peak Current (bits 21:20)',
      'Voltage (bits 19:10)',
      'Maximum Current (bits 9:0)',
      'Raw PDO',
    ]))
    expect(event.eventData.flatMap(({ entries }) => entries).map(({ value }) => value).join('\n')).not.toContain('"pdoType"')
  })

  it('provides field-level sections for every defined Source PDO layout', () => {
    const words = [
      (0b01 << 30) | (400 << 20) | (100 << 10) | 40,
      (0b10 << 30) | (400 << 20) | (100 << 10) | 300,
      (0b11 << 30) | (1 << 27) | (200 << 17) | (50 << 8) | 60,
      (0b11 << 30) | (0b01 << 28) | (2 << 26) | (480 << 17) | (150 << 8) | 140,
      (0b11 << 30) | (0b10 << 28) | (1 << 26) | (150 << 10) | 100,
    ].map((word) => word >>> 0)
    const raw = new Uint8Array(words.flatMap((word) => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff]))
    const request = { type: SinkInquiryType.GET_SOURCE_CAP } as const
    const event = presentInquiryResponse(request, response(request, raw, 2, 0x01))
    expect(event.eventData.map(({ title }) => title)).toEqual([
      'Source Capabilities',
      'PDO 1 — BATTERY',
      'PDO 2 — VARIABLE',
      'PDO 3 — SPR_PPS APDO',
      'PDO 4 — EPR_AVS APDO',
      'PDO 5 — SPR_AVS APDO',
    ])
    const keys = event.eventData.flatMap(({ entries }) => entries.map(({ key }) => key))
    expect(keys).toEqual(expect.arrayContaining([
      'Maximum Power (bits 9:0)',
      'PPS Power Limited (bit 27)',
      'PDP (bits 7:0)',
      'Maximum Current at 20 V (bits 9:0)',
    ]))
  })

  it('preserves country-code wire order and byte offsets', () => {
    const request = { type: SinkInquiryType.GET_COUNTRY_CODES } as const
    const raw = new Uint8Array([2, 0, 0x43, 0x41, 0x55, 0x53])
    const event = presentInquiryResponse(request, response(request, raw, 0, 0x0e))
    expect(event.summary).toContain('- **Country 1:** CA')
    expect(event.summary).toContain('- **Country 2:** US')
    expect(event.eventData[0].entries.map(({ key }) => key)).toContain('Country 1 (bytes 2–3)')
  })

  it('retains the explicit cable target and never claims SOP fallback', () => {
    const request = { type: SinkInquiryType.GET_STATUS, plug: SinkInquiryCablePlug.SOP_DOUBLE_PRIME } as const
    const raw = new Uint8Array([71, 1])
    const event = presentInquiryResponse(request, response(request, raw, 0, 0x02))
    expect(event.title).toBe('INQUIRY - SOP″ cable status')
    expect(event.eventData[0].entries).toContainEqual(expect.objectContaining({
      key: 'Target',
      value: expect.stringContaining('no fallback to SOP'),
    }))
  })
})
