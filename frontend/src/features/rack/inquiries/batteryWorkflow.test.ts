import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../lib/device'
import { batteryReferencesFromScedb, surveyBatteryCapabilities, surveyBatteryStatus } from './batteryWorkflow'

const sectionEntry = (
  section: NonNullable<Awaited<ReturnType<typeof surveyBatteryCapabilities>>['eventData']>[number],
  key: string,
): string | undefined => section.entries.find((entry) => entry.key === key)?.value

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
    expect(result.summary).toBe([
      '- **Advertised batteries:** 2 total — 1 fixed, 1 hot-swappable.',
      '- **Battery 0 (fixed):**',
      '  - **VID:** 0x1234',
      '  - **PID:** 0x5678',
      '  - **Design capacity:** 12.3 Wh',
      '  - **Last full-charge capacity:** 10.0 Wh',
      '  - **Battery reference:** Valid',
      '- **Battery 4 (hot-swappable slot 0):**',
      '  - **Outcome:** Not Supported.',
    ].join('\n'))
    expect(result.eventData?.map((section) => section.title)).toEqual([
      'Source Capabilities Extended',
      'Battery 0 — Fixed battery 0',
      'Battery 4 — Hot-swappable slot 0',
    ])
    const discovery = result.eventData![0]
    expect(discovery.entries.map((entry) => entry.key)).toEqual([
      'Outcome', 'Data Block Length', 'Vendor ID (bytes 0–1)', 'Product ID (bytes 2–3)',
      'XID (bytes 4–7)', 'Firmware Version (byte 8)', 'Hardware Version (byte 9)',
      'Voltage Regulation (byte 10)', 'Holdup Time (byte 11)', 'Compliance (byte 12)',
      'Touch Current (byte 13)', 'Peak Current 1 (bytes 14–15)', 'Peak Current 2 (bytes 16–17)',
      'Peak Current 3 (bytes 18–19)', 'Touch Temperature (byte 20)', 'Source Inputs (byte 21)',
      'Battery Counts (byte 22)', 'Battery References', 'SPR Source PDP (byte 23)',
      'EPR Source PDP (byte 24)', 'Raw Logical Response',
    ])
    expect(sectionEntry(discovery, 'Battery Counts (byte 22)')).toContain('Bits 3:0')
    expect(sectionEntry(discovery, 'Raw Logical Response')).toContain('00 00 00 00')
    const battery = result.eventData![1]
    expect(sectionEntry(battery, 'Vendor ID (bytes 0–1)')).toContain('0x1234')
    expect(sectionEntry(battery, 'Design Capacity (bytes 4–5)')).toContain('0x007B')
    expect(sectionEntry(battery, 'Raw Logical Response')).toContain('34 12 78 56 7B 00 64 00 00')
    expect(sectionEntry(result.eventData![2], 'Outcome')).toBe('Not Supported')
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
    expect(result.summary).toBe('- **Battery discovery:** Not Supported. No Battery_Capabilities requests were sent.')
    expect(result.eventData).toEqual([{
      title: 'Source Capabilities Extended',
      entries: [{ key: 'Outcome', value: 'Not Supported' }],
    }])
  })

  it('reports zero batteries and every field in a 25-byte SCEDB without battery requests', async () => {
    const scedb = new Uint8Array(25)
    scedb.set([0x34, 0x12, 0x78, 0x56, 0x04, 0x03, 0x02, 0x01], 0)
    scedb[23] = 100
    scedb[24] = 140
    const sendInquiryRequest = vi.fn(async () => undefined)
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 25 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 25 },
    ]
    const result = await surveyBatteryCapabilities({
      sendInquiryRequest,
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => scedb),
    })

    expect(sendInquiryRequest).toHaveBeenCalledTimes(1)
    expect(result.summary).toBe('- **Advertised batteries:** 0 total — 0 fixed, 0 hot-swappable.')
    expect(result.eventData).toHaveLength(1)
    expect(sectionEntry(result.eventData![0], 'Vendor ID (bytes 0–1)')).toContain('0x1234')
    expect(sectionEntry(result.eventData![0], 'XID (bytes 4–7)')).toContain('0x01020304')
    expect(sectionEntry(result.eventData![0], 'EPR Source PDP (byte 24)')).toContain('140 W')
    expect(sectionEntry(result.eventData![0], 'Battery References')).toBe('None advertised.')
  })

  it('preserves capacity sentinels and invalid-reference semantics', async () => {
    const scedb = new Uint8Array(24)
    scedb[22] = 0x01
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 5, responseLength: 9 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 5, responseLength: 9 },
    ]
    const responses = [scedb, new Uint8Array([1, 0, 2, 0, 0, 0, 0xff, 0xff, 1])]
    const result = await surveyBatteryCapabilities({
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    })

    expect(result.summary).toContain('  - **Design capacity:** battery not present')
    expect(result.summary).toContain('  - **Last full-charge capacity:** unknown')
    expect(result.summary).toContain('  - **Battery reference:** Invalid')
    const battery = result.eventData![1]
    expect(sectionEntry(battery, 'Design Capacity (bytes 4–5)')).toContain('0x0000')
    expect(sectionEntry(battery, 'Last Full-Charge Capacity (bytes 6–7)')).toContain('0xFFFF')
    expect(sectionEntry(battery, 'Invalid Battery Reference (bit 0)')).toContain('invalid battery reference')
    expect(sectionEntry(battery, 'Reserved (bits 7:1)')).toContain('0b0000000')
  })

  it('retains malformed battery raw data and exact decode error', async () => {
    const scedb = new Uint8Array(24)
    scedb[22] = 0x01
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED, responseClass: 0, responseType: 1, responseLength: 24 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 5, responseLength: 3 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_BATTERY_CAP, responseClass: 0, responseType: 5, responseLength: 3 },
    ]
    const responses = [scedb, new Uint8Array([1, 2, 3])]
    const result = await surveyBatteryCapabilities({
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    })

    expect(result.summary).toContain('  - **Outcome:** Malformed response (Battery_Capabilities response must contain exactly 9 bytes).')
    const battery = result.eventData![1]
    expect(sectionEntry(battery, 'Decode Error')).toBe('Battery_Capabilities response must contain exactly 9 bytes')
    expect(sectionEntry(battery, 'Raw Logical Response')).toContain('01 02 03')
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
