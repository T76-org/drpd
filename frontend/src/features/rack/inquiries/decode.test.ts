import { describe, expect, it } from 'vitest'
import { SinkInquiryCablePlug, SinkInquiryOutcome, SinkInquiryType, type SinkInquiryStatus } from '../../../lib/device'
import { decodeInquiryResponse } from './decode'

const response = (
  type: SinkInquiryType,
  responseClass: number,
  responseType: number,
  length: number,
): SinkInquiryStatus => ({
  outcome: SinkInquiryOutcome.RESPONSE,
  requestId: 1,
  type,
  responseClass,
  responseType,
  responseLength: length,
})

describe('decodeInquiryResponse', () => {
  const words = (...values: number[]) => new Uint8Array(values.flatMap((value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]))
  const vdmHeader = (svid: number, command: number, commandType = 1) => (svid << 16) | (1 << 15) | (1 << 13) | (commandType << 6) | command
  it.each([
    [SinkInquiryType.GET_SOURCE_CAP, 2, 0x01, 4, 'Source_Capabilities'],
    [SinkInquiryType.GET_SOURCE_CAP_EXTENDED, 0, 0x01, 24, 'Source_Capabilities_Extended'],
    [SinkInquiryType.GET_SOURCE_CAP_EXTENDED, 0, 0x01, 25, 'Source_Capabilities_Extended'],
    [SinkInquiryType.GET_STATUS, 0, 0x02, 6, 'Status'],
    [SinkInquiryType.GET_STATUS, 0, 0x02, 7, 'Status'],
    [SinkInquiryType.GET_SOURCE_INFO, 2, 0x0b, 4, 'Source_Info'],
    [SinkInquiryType.GET_PPS_STATUS, 0, 0x0c, 4, 'PPS_Status'],
    [SinkInquiryType.GET_REVISION, 2, 0x0c, 4, 'Revision'],
  ] as const)('decodes %s logical body of length %i', (type, messageClass, messageType, length, name) => {
    const decoded = decodeInquiryResponse(
      response(type, messageClass, messageType, length),
      new Uint8Array(length),
    )
    expect(decoded.messageTypeName).toBe(name)
    expect(() => JSON.parse(decoded.summary)).not.toThrow()
  })

  it.each([
    [SinkInquiryType.GET_SOURCE_CAP, 2, 0x01, 0],
    [SinkInquiryType.GET_SOURCE_CAP, 2, 0x01, 29],
    [SinkInquiryType.GET_SOURCE_CAP_EXTENDED, 0, 0x01, 23],
    [SinkInquiryType.GET_SOURCE_CAP_EXTENDED, 0, 0x01, 26],
    [SinkInquiryType.GET_STATUS, 0, 0x02, 5],
    [SinkInquiryType.GET_STATUS, 0, 0x02, 8],
    [SinkInquiryType.GET_SOURCE_INFO, 2, 0x0b, 3],
    [SinkInquiryType.GET_PPS_STATUS, 0, 0x0c, 5],
    [SinkInquiryType.GET_REVISION, 2, 0x0c, 5],
  ] as const)('rejects malformed %s logical body of length %i', (type, messageClass, messageType, length) => {
    expect(() => decodeInquiryResponse(
      response(type, messageClass, messageType, length),
      new Uint8Array(length),
    )).toThrow()
  })

  it('rejects mismatched response length', () => {
    expect(() => decodeInquiryResponse(
      response(SinkInquiryType.GET_REVISION, 2, 0x0c, 5),
      new Uint8Array(4),
    )).toThrow('Response length does not match body')
  })

  it('decodes cable Status as the two-byte SOP prime data block and retains the plug', () => {
    const decoded = decodeInquiryResponse(
      response(SinkInquiryType.GET_STATUS, 0, 0x02, 2),
      new Uint8Array([71, 0b1]),
      { type: SinkInquiryType.GET_STATUS, plug: SinkInquiryCablePlug.SOP_DOUBLE_PRIME },
    )
    expect(JSON.parse(decoded.summary)).toMatchObject({
      plug: 'SOP_DOUBLE_PRIME',
      internalTemp: 71,
      flags: 1,
      internalTemperatureRaw: 71,
      internalTemperatureC: 71,
      below2C: false,
      flagsRaw: 1,
      thermalShutdown: true,
    })
  })

  it.each([
    [0, null, false],
    [1, null, true],
    [2, 2, false],
    [255, 255, false],
  ])('preserves cable temperature meaning for raw %i', (raw, degreesC, below2C) => {
    const decoded = decodeInquiryResponse(
      response(SinkInquiryType.GET_STATUS, 0, 0x02, 2),
      new Uint8Array([raw, 0]),
      { type: SinkInquiryType.GET_STATUS, plug: SinkInquiryCablePlug.SOP_PRIME },
    )
    expect(JSON.parse(decoded.summary)).toMatchObject({
      internalTemperatureRaw: raw,
      internalTemperatureC: degreesC,
      below2C,
      thermalShutdown: false,
    })
  })

  it.each([0x02, 0x80, 0xff])('rejects Cable Status reserved flags 0x%s', (flags) => {
    expect(() => decodeInquiryResponse(
      response(SinkInquiryType.GET_STATUS, 0, 0x02, 2),
      new Uint8Array([30, flags]),
      { type: SinkInquiryType.GET_STATUS, plug: SinkInquiryCablePlug.SOP_PRIME },
    )).toThrow('reserved flag bits')
  })

  it('never falls back from cable Status to the six-byte SOP parser', () => {
    expect(() => decodeInquiryResponse(
      response(SinkInquiryType.GET_STATUS, 0, 0x02, 6),
      new Uint8Array(6),
      { type: SinkInquiryType.GET_STATUS, plug: SinkInquiryCablePlug.SOP_PRIME },
    )).toThrow('Cable Status body must contain exactly 2 bytes')
  })

  it.each([
    [0, 0x0c],
    [2, 0x0b],
  ])('rejects unexpected response class/type %i/%i', (messageClass, messageType) => {
    expect(() => decodeInquiryResponse(
      response(SinkInquiryType.GET_REVISION, messageClass, messageType, 4),
      new Uint8Array(4),
    )).toThrow('Unexpected response class/type')
  })

  it('decodes Manufacturer_Info at its 26-byte maximum', () => {
    const body = new Uint8Array(26).fill(0x41)
    body.set([0x34, 0x12, 0x78, 0x56])
    body[25] = 0
    const decoded = decodeInquiryResponse(
      response(SinkInquiryType.GET_MANUFACTURER_INFO, 0, 0x07, 26), body,
      { type: SinkInquiryType.GET_MANUFACTURER_INFO, target: 'PORT' },
    )
    expect(decoded.summary).toContain('manufacturerString')
  })

  it('rejects Manufacturer_Info above its 26-byte maximum', () => {
    const body = new Uint8Array(27).fill(0x41)
    body[26] = 0
    expect(() => decodeInquiryResponse(
      response(SinkInquiryType.GET_MANUFACTURER_INFO, 0, 0x07, 27), body,
      { type: SinkInquiryType.GET_MANUFACTURER_INFO, target: 'PORT' },
    )).toThrow('5 to 26 bytes')
  })

  it('decodes and validates Country_Codes count, reserved byte, and pairs', () => {
    const body = new Uint8Array([2, 0, 0x43, 0x41, 0x55, 0x53])
    expect(decodeInquiryResponse(response(SinkInquiryType.GET_COUNTRY_CODES, 0, 0x0e, 6), body).summary)
      .toContain('CA')
    expect(() => decodeInquiryResponse(response(SinkInquiryType.GET_COUNTRY_CODES, 0, 0x0e, 6), new Uint8Array([2, 1, 0x43, 0x41, 0x55, 0x53]))).toThrow()
  })

  it.each([25, 26])('decodes correlated Country_Info across a %i-byte chunk boundary', (length) => {
    const body = new Uint8Array(length)
    body.set([0x43, 0x41, 0, 0])
    const request = { type: SinkInquiryType.GET_COUNTRY_INFO, countryCode: 'CA' } as const
    expect(decodeInquiryResponse(response(SinkInquiryType.GET_COUNTRY_INFO, 0, 0x0d, length), body, request).summary).toContain('CA')
    expect(() => decodeInquiryResponse(response(SinkInquiryType.GET_COUNTRY_INFO, 0, 0x0d, length), body, { ...request, countryCode: 'US' })).toThrow('echoed CA')
  })

  it('rejects 27-byte Country_Info', () => {
    const body = new Uint8Array(27)
    body.set([0x43, 0x41, 0, 0])
    expect(() => decodeInquiryResponse(
      response(SinkInquiryType.GET_COUNTRY_INFO, 0, 0x0d, 27), body,
      { type: SinkInquiryType.GET_COUNTRY_INFO, countryCode: 'CA' },
    )).toThrow('malformed')
  })

  it('accepts the Apple unterminated Manufacturer_Info interoperability quirk', () => {
    const body = new Uint8Array([0xac, 0x05, 0x08, 0x73, ...new TextEncoder().encode('Macintosh')])
    const decoded = decodeInquiryResponse(
      response(SinkInquiryType.GET_MANUFACTURER_INFO, 0, 0x07, body.length),
      body,
      { type: SinkInquiryType.GET_MANUFACTURER_INFO, target: 'PORT' },
    )
    expect(decoded.summary).toContain('Macintosh')
  })

  it('rejects malformed Manufacturer_Info ASCII and bytes after termination', () => {
    const status = response(SinkInquiryType.GET_MANUFACTURER_INFO, 0, 0x07, 6)
    expect(() => decodeInquiryResponse(status, new Uint8Array([0, 0, 0, 0, 0x80, 0]))).toThrow('printable ASCII')
    expect(() => decodeInquiryResponse(status, new Uint8Array([0, 0, 0, 0, 0, 0x42]))).toThrow('after its null terminator')
  })

  it('decodes battery capabilities with raw 0.1 Wh and converted Wh units', () => {
    const body = new Uint8Array([0x34, 0x12, 0x78, 0x56, 16, 0, 8, 0, 1])
    const decoded = decodeInquiryResponse(
      response(SinkInquiryType.GET_BATTERY_CAP, 0, 0x05, 9), body,
      { type: SinkInquiryType.GET_BATTERY_CAP, batteryReference: 4 },
    )
    expect(decoded.summary).toContain('"designCapacityWh": 1.6')
    expect(decoded.summary).toContain('"batteryReference": 4')
  })

  it('decodes invalid-reference battery status without hiding wire semantics', () => {
    const raw = (0xffff << 16) | (1 << 8)
    const body = new Uint8Array([raw & 0xff, (raw >>> 8) & 0xff, (raw >>> 16) & 0xff, (raw >>> 24) & 0xff])
    const decoded = decodeInquiryResponse(
      response(SinkInquiryType.GET_BATTERY_STATUS, 2, 0x05, 4), body,
      { type: SinkInquiryType.GET_BATTERY_STATUS, batteryReference: 7 },
    )
    expect(decoded.summary).toContain('"invalidBatteryReference": true')
    expect(decoded.summary).toContain('"presentCapacityWh": null')
  })

  it.each([
    [0x00000100, '"batteryPresentCapacity": 0', '"presentCapacityWh": null'],
    [0xffff0100, '"batteryPresentCapacity": 65535', '"presentCapacityWh": null'],
  ])('preserves invalid-reference capacity form 0x%s', (raw, rawCapacity, convertedCapacity) => {
    const body = new Uint8Array([raw & 0xff, (raw >>> 8) & 0xff, (raw >>> 16) & 0xff, (raw >>> 24) & 0xff])
    const decoded = decodeInquiryResponse(
      response(SinkInquiryType.GET_BATTERY_STATUS, 2, 0x05, 4), body,
      { type: SinkInquiryType.GET_BATTERY_STATUS, batteryReference: 3 },
    )
    expect(decoded.summary).toContain('"invalidBatteryReference": true')
    expect(decoded.summary).toContain(rawCapacity)
    expect(decoded.summary).toContain(convertedCapacity)
  })

  it('decodes Identity ACK with raw ordered VDOs', () => {
    const body = words(vdmHeader(0xff00, 1), 1, 2, 3)
    const decoded = decodeInquiryResponse(response(SinkInquiryType.DISCOVER_IDENTITY, 2, 0x0f, 16), body, { type: SinkInquiryType.DISCOVER_IDENTITY })
    expect(decoded.summary).toContain('"rawVdos"')
  })

  it('deduplicates SVIDs deterministically while preserving ordered entries', () => {
    const body = words(vdmHeader(0xff00, 2), (0x1234 << 16) | 0xabcd, (0xabcd << 16))
    const decoded = decodeInquiryResponse(response(SinkInquiryType.DISCOVER_SVIDS, 2, 0x0f, 12), body, { type: SinkInquiryType.DISCOVER_SVIDS })
    expect(decoded.summary).toContain('"orderedSvids": [\n    4660,\n    43981,\n    43981')
    expect(decoded.summary).toContain('"svids": [\n    4660,\n    43981')
  })

  it.each([[2, 'NAK'], [3, 'BUSY']])('rejects non-ACK command type %i %s as a response body', (commandType) => {
    const body = words(vdmHeader(0xff00, 2, commandType), 0)
    expect(() => decodeInquiryResponse(response(SinkInquiryType.DISCOVER_SVIDS, 2, 0x0f, 8), body, { type: SinkInquiryType.DISCOVER_SVIDS })).toThrow('does not correlate')
  })

  it('correlates Discover Modes selected SVID', () => {
    const body = words(vdmHeader(0x1234, 3), 0xdeadbeef)
    expect(decodeInquiryResponse(response(SinkInquiryType.DISCOVER_MODES, 2, 0x0f, 8), body, { type: SinkInquiryType.DISCOVER_MODES, svid: 0x1234 }).summary).toContain('3735928559')
    expect(() => decodeInquiryResponse(response(SinkInquiryType.DISCOVER_MODES, 2, 0x0f, 8), body, { type: SinkInquiryType.DISCOVER_MODES, svid: 0xabcd })).toThrow('does not correlate')
  })

  it.each([
    [SinkInquiryType.DISCOVER_IDENTITY, vdmHeader(0xff00, 1), 12],
    [SinkInquiryType.DISCOVER_SVIDS, vdmHeader(0xff00, 2), 4],
    [SinkInquiryType.DISCOVER_MODES, vdmHeader(0x1234, 3), 4],
  ] as const)('rejects undersized %s ACK body', (type, header, length) => {
    const request = type === SinkInquiryType.DISCOVER_MODES ? { type, svid: 0x1234 } as const : { type } as const
    expect(() => decodeInquiryResponse(response(type, 2, 0x0f, length), words(header, 1, 2).subarray(0, length), request)).toThrow('body must contain')
  })

  it('rejects reserved header bit 5 and nonzero SVID after terminator', () => {
    expect(() => decodeInquiryResponse(response(SinkInquiryType.DISCOVER_SVIDS, 2, 0x0f, 8), words(vdmHeader(0xff00, 2) | 0x20, 0), { type: SinkInquiryType.DISCOVER_SVIDS })).toThrow('bit 5')
    expect(() => decodeInquiryResponse(response(SinkInquiryType.DISCOVER_SVIDS, 2, 0x0f, 12), words(vdmHeader(0xff00, 2), 0, 0x12340000), { type: SinkInquiryType.DISCOVER_SVIDS })).toThrow('after its zero terminator')
  })
})
