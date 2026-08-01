import { describe, expect, it } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType, type SinkInquiryStatus } from '../../../lib/device'
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

  it.each([
    [0, 0x0c],
    [2, 0x0b],
  ])('rejects unexpected response class/type %i/%i', (messageClass, messageType) => {
    expect(() => decodeInquiryResponse(
      response(SinkInquiryType.GET_REVISION, messageClass, messageType, 4),
      new Uint8Array(4),
    )).toThrow('Unexpected response class/type')
  })

  it.each([26, 27])('decodes Manufacturer_Info across a %i-byte chunk boundary', (length) => {
    const body = new Uint8Array(length).fill(0x41)
    body.set([0x34, 0x12, 0x78, 0x56])
    body[length - 1] = 0
    const decoded = decodeInquiryResponse(
      response(SinkInquiryType.GET_MANUFACTURER_INFO, 0, 0x07, length), body,
      { type: SinkInquiryType.GET_MANUFACTURER_INFO, target: 'PORT' },
    )
    expect(decoded.summary).toContain('manufacturerString')
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

  it('rejects malformed Manufacturer_Info ASCII and termination', () => {
    const status = response(SinkInquiryType.GET_MANUFACTURER_INFO, 0, 0x07, 6)
    expect(() => decodeInquiryResponse(status, new Uint8Array([0, 0, 0, 0, 0x80, 0]))).toThrow('printable ASCII')
    expect(() => decodeInquiryResponse(status, new Uint8Array([0, 0, 0, 0, 0x41, 0x42]))).toThrow('null terminator')
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
})
