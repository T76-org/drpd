import { describe, expect, it } from 'vitest'
import type { LoggedCapturedMessage } from '../logging'
import { decodeLoggedCapturedMessage, decodeLoggedCapturedMessageWithContext } from '../logDecode'
import { buildMessage, makeExtendedHeader, makeMessageHeader, toBytes32 } from '../usb-pd/messages/messageTestUtils'

const buildMessageRow = (
  overrides: Partial<LoggedCapturedMessage> = {},
): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  wallClockUs: 1_700_000_000_000_000n,
  startTimestampUs: 1000n,
  endTimestampUs: 1005n,
  displayTimestampUs: 0n,
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'CONTROL',
  messageType: 3,
  messageId: 1,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 4,
  rawPulseWidths: Float64Array.from([1, 2, 3, 4]),
  rawSop: Uint8Array.from([0x18, 0x18, 0x18, 0x11]),
  rawDecodedData: Uint8Array.from([0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d]),
  parseError: null,
  createdAtMs: 1_700_000_000_000,
  ...overrides,
})

describe('decodeLoggedCapturedMessage', () => {
  it('resolves a non-compliant PDO 1 SPR AVS Request from captured Source_Capabilities', () => {
    const sop = [0x18, 0x18, 0x18, 0x11]
    const sourceHeader = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x01,
      roleBit: 1,
      dataRoleBit: 1,
    })
    const requestHeader = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x02,
      roleBit: 0,
      dataRoleBit: 0,
    })
    const sourcePacket = buildMessage(sop, sourceHeader, toBytes32(0xec04b0ca))
    const requestPacket = buildMessage(sop, requestHeader, toBytes32(0x1104b028))
    const sourceRow = buildMessageRow({
      startTimestampUs: 900n,
      endTimestampUs: 905n,
      rawSop: sourcePacket.subarray(0, 4),
      rawDecodedData: sourcePacket.subarray(4),
      messageKind: 'DATA',
      messageType: 0x01,
      senderPowerRole: 'SOURCE',
    })
    const requestRow = buildMessageRow({
      startTimestampUs: 1000n,
      endTimestampUs: 1005n,
      rawSop: requestPacket.subarray(0, 4),
      rawDecodedData: requestPacket.subarray(4),
      messageKind: 'DATA',
      messageType: 0x02,
      senderPowerRole: 'SINK',
    })

    const decoded = decodeLoggedCapturedMessageWithContext(requestRow, [sourceRow, requestRow])
    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') return
    const request = decoded.message.humanReadableMetadata.messageSpecificData.getEntry('requestDataObject')
    expect(request?.getEntry('requestTypeHint')?.value).toBe('avs')
    expect(request?.getEntry('decodeConfidence')?.value).toBe('resolved')
    expect(request?.getEntry('decodeSource')?.value).toBe('source_capabilities')
    expect(request?.getEntry('avs')?.getEntry('outputVoltage25mV')?.value).toBe('15000 mV')
    expect(request?.getEntry('avs')?.getEntry('operatingCurrent50mA')?.value).toBe('2000 mA')
    expect(request?.getEntry('pps')).toBeUndefined()
    const referencedPdo = decoded.message.humanReadableMetadata.messageSpecificData.getEntry('referencedPowerDataObject')
    expect(referencedPdo?.Label).toBe('Referenced Power Data Object')
    expect(referencedPdo?.getEntry('raw')?.value).toBe('0xEC04B0CA')
    const summary = decoded.message.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.value).toContain('**Referenced source PDO:**')
    expect(summary?.value).toContain('SPR AVS: 15V @ 3A, 20V @ 2.02A')
  })

  it('does not reuse Source_Capabilities across SOP Hard Reset', () => {
    const sop = [0x18, 0x18, 0x18, 0x11]
    const sourcePacket = buildMessage(sop, makeMessageHeader({ extended: false, numberOfDataObjects: 1, messageTypeNumber: 0x01, roleBit: 1 }), toBytes32(0xec04b0ca))
    const requestPacket = buildMessage(sop, makeMessageHeader({ extended: false, numberOfDataObjects: 1, messageTypeNumber: 0x02 }), toBytes32(0x1104b028))
    const sourceRow = buildMessageRow({ startTimestampUs: 800n, rawSop: sourcePacket.subarray(0, 4), rawDecodedData: sourcePacket.subarray(4), messageKind: 'DATA', messageType: 1, senderPowerRole: 'SOURCE' })
    const resetRow = buildMessageRow({ startTimestampUs: 900n, rawSop: Uint8Array.from([0x07, 0x07, 0x07, 0x19]), rawDecodedData: new Uint8Array(), messageKind: null, messageType: null })
    const requestRow = buildMessageRow({ startTimestampUs: 1000n, rawSop: requestPacket.subarray(0, 4), rawDecodedData: requestPacket.subarray(4), messageKind: 'DATA', messageType: 2, senderPowerRole: 'SINK' })
    const decoded = decodeLoggedCapturedMessageWithContext(requestRow, [sourceRow, resetRow, requestRow])
    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') return
    const request = decoded.message.humanReadableMetadata.messageSpecificData.getEntry('requestDataObject')
    expect(request?.getEntry('decodeConfidence')?.value).toBe('guessed')
    expect(request?.getEntry('decodeWarning')?.value).toContain('Source_Capabilities unavailable')
  })

  it('decodes Hard Reset signaling without requiring a message header', () => {
    const row = buildMessageRow({
      rawSop: Uint8Array.from([0x07, 0x07, 0x07, 0x19]),
      rawDecodedData: new Uint8Array(),
      messageKind: null,
      messageType: null,
      messageId: null,
    })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('reset')
    if (decoded.kind !== 'reset') {
      return
    }
    expect(decoded.resetKind).toBe('SOP_HARD_RESET')
    expect(decoded.metadata.baseInformation.getEntry('messageType')?.value).toBe('Hard Reset')
    expect(decoded.metadata.technicalData.getEntry('sop')?.getEntry('type')?.value).toBe('Hard Reset')
    expect(decoded.metadata.headerData.getEntry('headerStatus')?.value).toBe(
      'Reset signaling has no USB-PD message header.',
    )
  })

  it('decodes imported Hard Reset rows that still carry the old parse error', () => {
    const row = buildMessageRow({
      rawSop: Uint8Array.from([0x07, 0x07, 0x07, 0x19]),
      rawDecodedData: new Uint8Array(),
      messageKind: null,
      messageType: null,
      messageId: null,
      parseError: 'USB-PD payload too short: 4',
    })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('reset')
    if (decoded.kind !== 'reset') {
      return
    }
    expect(decoded.metadata.baseInformation.getEntry('messageType')?.value).toBe('Hard Reset')
  })

  it('decodes Cable Reset signaling without requiring a message header', () => {
    const row = buildMessageRow({
      rawSop: Uint8Array.from([0x07, 0x18, 0x07, 0x06]),
      rawDecodedData: new Uint8Array(),
      messageKind: null,
      messageType: null,
      messageId: null,
    })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('reset')
    if (decoded.kind !== 'reset') {
      return
    }
    expect(decoded.resetKind).toBe('SOP_CABLE_RESET')
    expect(decoded.metadata.baseInformation.getEntry('messageType')?.value).toBe('Cable Reset')
  })

  it('decodes valid message rows into concrete USB-PD message classes', () => {
    const row = buildMessageRow()
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') {
      return
    }
    expect(decoded.message.messageTypeName).toBe('Accept')
    expect(decoded.message.kind).toBe('CONTROL')
    expect(Array.from(decoded.message.pulseWidthsNs)).toEqual([1, 2, 3, 4])
    expect(decoded.message.pulseWidthsNs).not.toBe(row.rawPulseWidths)
    expect(decoded.message.startTimestampUs).toBe(1000n)
    expect(decoded.message.endTimestampUs).toBe(1005n)
    expect(decoded.message.wallClockUs).toBe(1_700_000_000_000_000n)
    const timingInformation = decoded.message.humanReadableMetadata.technicalData.getEntry('timingInformation')
    expect(timingInformation?.getEntry('startTimestamp')?.value).toBe('1000')
    expect(timingInformation?.getEntry('wallClockTimestamp')?.value).toBe('17:13:20.000000')
    expect(timingInformation?.getEntry('duration')?.value).toBe('5µs')
  })

  it('returns event rows without decode attempt', () => {
    const row = buildMessageRow({
      entryKind: 'event',
      eventType: 'capture_changed',
      eventText: 'Capture turned off',
      rawSop: new Uint8Array(),
      rawDecodedData: new Uint8Array(),
    })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('event')
  })

  it('marks rows invalid when firmware decode failed', () => {
    const row = buildMessageRow({ decodeResult: 2 })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('invalid')
    if (decoded.kind !== 'invalid') {
      return
    }
    expect(decoded.reason).toBe('Bad CRC')
    expect(decoded.metadata.baseInformation.getEntry('messageType')?.value).toBe('Invalid')
    expect(decoded.metadata.baseInformation.getEntry('invalidReason')?.value).toBe('Bad CRC')
    expect(decoded.metadata.baseInformation.getEntry('inferredMessageType')?.value).toBe('Accept')
    expect(decoded.metadata.headerData.getEntry('messageHeader')).not.toBeUndefined()
    expect(decoded.metadata.technicalData.getEntry('crc32')?.getEntry('actual')?.value).toBe('0x5DFAAC6F')
  })

  it('marks rows invalid when row contains parseError', () => {
    const row = buildMessageRow({ parseError: 'CRC mismatch' })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('invalid')
    if (decoded.kind !== 'invalid') {
      return
    }
    expect(decoded.reason).toContain('CRC mismatch')
    expect(decoded.metadata.baseInformation.getEntry('messageType')?.value).toBe('Invalid')
    expect(decoded.metadata.baseInformation.getEntry('invalidReason')?.value).toBe('CRC mismatch')
    expect(decoded.metadata.headerData.getEntry('messageHeader')).not.toBeUndefined()
  })

  it('recovers the beta Get Manufacturer Info payload while retaining a protocol warning', () => {
    const row = buildMessageRow({
      rawSop: Uint8Array.from([0x18, 0x18, 0x18, 0x11]),
      rawDecodedData: Uint8Array.from([
        0x86, 0x9c, 0x00, 0x80, 0x00, 0x00, 0xf7, 0x87, 0xe8, 0x8c,
      ]),
      messageKind: 'EXTENDED',
      messageType: 6,
      messageId: 0,
    })

    const decoded = decodeLoggedCapturedMessage(row)

    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') return
    const metadata = decoded.message.humanReadableMetadata
    expect(metadata.baseInformation.getEntry('messageType')?.value).toBe('Get_Manufacturer_Info')
    expect(metadata.baseInformation.getEntry('protocolWarning')?.value).toContain(
      'Data Size 0',
    )
    expect(metadata.baseInformation.getEntry('protocolWarning')?.value).toContain(
      'recovered the required two-byte request block',
    )
    const dataBlock = metadata.messageSpecificData.getEntry('getManufacturerInfoDataBlock')
    expect(dataBlock?.getEntry('manufacturerInfoTarget')?.value).toBe('0')
    expect(dataBlock?.getEntry('manufacturerInfoRef')?.value).toBe('0')
  })

  it('accepts a zero-size Request Chunk header for contextual decoding', () => {
    const row = buildMessageRow({
      rawSop: Uint8Array.from([0x18, 0x18, 0x18, 0x11]),
      rawDecodedData: Uint8Array.from([
        0xa6, 0x9b, 0x00, 0x8c, 0x00, 0x00, 0xb5, 0xa7, 0x7e, 0x30,
      ]),
      messageKind: 'EXTENDED',
      messageType: 6,
      messageId: 5,
    })

    expect(decodeLoggedCapturedMessage(row).kind).toBe('message')
  })

  it('builds best-effort metadata for truncated invalid rows with a parseable header', () => {
    const row = buildMessageRow({
      decodeResult: 4,
      rawDecodedData: Uint8Array.from([0x82, 0x10]),
      messageKind: 'DATA',
      messageType: 2,
    })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('invalid')
    if (decoded.kind !== 'invalid') {
      return
    }
    expect(decoded.reason).toBe('Truncated or incomplete capture')
    expect(decoded.metadata.baseInformation.getEntry('messageType')?.value).toBe('Invalid')
    expect(decoded.metadata.baseInformation.getEntry('inferredMessageType')?.value).toBe('Request')
    expect(decoded.metadata.headerData.getEntry('messageHeader')?.getEntry('messageType')?.value).toBe('Request (0x02)')
    expect(decoded.metadata.technicalData.getEntry('messageBytes')?.type).toBe('ByteData')
    expect(decoded.metadata.technicalData.getEntry('crc32')?.getEntry('actual')?.value).toBe('Unavailable')
  })

  it('builds fallback metadata for invalid rows that are too short to parse', () => {
    const row = buildMessageRow({
      decodeResult: 4,
      rawSop: Uint8Array.from([0x18, 0x18]),
      rawDecodedData: new Uint8Array(),
      pulseCount: 2,
      rawPulseWidths: Float64Array.from([1, 2]),
    })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('invalid')
    if (decoded.kind !== 'invalid') {
      return
    }
    expect(decoded.reason).toBe('Truncated or incomplete capture')
    expect(decoded.metadata.baseInformation.getEntry('messageType')?.value).toBe('Invalid')
    expect(decoded.metadata.baseInformation.getEntry('parseFailure')?.value).toContain('USB-PD payload too short')
    expect(decoded.metadata.technicalData.getEntry('timingInformation')?.getEntry('pulseCount')?.value).toBe('2')
    expect(decoded.metadata.technicalData.getEntry('messageBytes')?.type).toBe('ByteData')
    expect(decoded.metadata.headerData.getEntry('headerStatus')?.value).toBe('Truncated before complete message header')
  })

  it('reassembles chunked EPR source capabilities when decoding with ordered context', () => {
    const sop = [0x18, 0x18, 0x18, 0x11]
    const messageHeader = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x11,
      roleBit: 1,
      dataRoleBit: 1,
      specRevisionBits: 0b10,
    })
    const pdo1 = 0x0001912c
    const pdo2 = 0x0002d12c
    const chunk0 = buildMessage(
      sop,
      messageHeader,
      [...toBytes32(pdo1), 0xaa, 0xbb, 0xcc, 0xdd],
      makeExtendedHeader({ chunked: true, chunkNumber: 0, dataSize: 8 }),
    )
    const chunk1 = buildMessage(
      sop,
      messageHeader,
      [...toBytes32(pdo2), 0x01, 0x02, 0x03, 0x04],
      makeExtendedHeader({ chunked: true, chunkNumber: 1, dataSize: 8 }),
    )
    const firstRow = buildMessageRow({
      startTimestampUs: 1000n,
      endTimestampUs: 1005n,
      rawSop: chunk0.subarray(0, 4),
      rawDecodedData: chunk0.subarray(4),
      messageKind: 'EXTENDED',
      messageType: 0x11,
      createdAtMs: 1_700_000_000_001,
    })
    const secondRow = buildMessageRow({
      startTimestampUs: 1010n,
      endTimestampUs: 1015n,
      rawSop: chunk1.subarray(0, 4),
      rawDecodedData: chunk1.subarray(4),
      messageKind: 'EXTENDED',
      messageType: 0x11,
      createdAtMs: 1_700_000_000_002,
    })

    const decoded = decodeLoggedCapturedMessageWithContext(secondRow, [firstRow, secondRow])
    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') {
      return
    }

    const powerDataObjects = decoded.message.humanReadableMetadata.messageSpecificData.getEntry('powerDataObjects')
    expect(powerDataObjects).not.toBeUndefined()
    expect(Array.from(decoded.message.capturePayload)).toEqual(Array.from(chunk1))
    const crc32 = decoded.message.humanReadableMetadata.technicalData.getEntry('crc32')
    expect(crc32?.getEntry('actual')?.value).toBe('0x04030201')
    expect(crc32?.getEntry('actual')?.value).not.toBe('Unavailable')
  })

  it('keeps incomplete chunked EPR source capabilities fragment-local when context is incomplete', () => {
    const sop = [0x18, 0x18, 0x18, 0x11]
    const messageHeader = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x11,
      roleBit: 1,
      dataRoleBit: 1,
      specRevisionBits: 0b10,
    })
    const pdo1 = 0x0001912c
    const chunk0 = buildMessage(
      sop,
      messageHeader,
      [...toBytes32(pdo1), 0xaa, 0xbb, 0xcc, 0xdd],
      makeExtendedHeader({ chunked: true, chunkNumber: 0, dataSize: 8 }),
    )
    const firstRow = buildMessageRow({
      rawSop: chunk0.subarray(0, 4),
      rawDecodedData: chunk0.subarray(4),
      messageKind: 'EXTENDED',
      messageType: 0x11,
    })

    const decoded = decodeLoggedCapturedMessageWithContext(firstRow, [firstRow])
    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') {
      return
    }

    expect(decoded.message.humanReadableMetadata.messageSpecificData.getEntry('powerDataObjects')).toBeUndefined()
    const crc32 = decoded.message.humanReadableMetadata.technicalData.getEntry('crc32')
    expect(crc32?.getEntry('actual')?.value).toBe('0xDDCCBBAA')
  })
})
