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
})
