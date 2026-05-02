import { describe, expect, it } from 'vitest'
import { buildCapturedLogSelectionKey, type LoggedCapturedMessage } from '../../lib/device'
import {
  buildMessage as buildUsbPdMessage,
  makeMessageHeader,
  setBits,
  toBytes32,
} from '../../lib/device/drpd/usb-pd/messages/messageTestUtils'
import { formatWallClock } from './messageLogFormat'
import { buildSelectedMessageLogCsv } from './messageLogExport'

const SOP = [0x18, 0x18, 0x18, 0x11]

const buildSourceCapabilitiesExportRow = (
  index: number,
  overrides: Partial<LoggedCapturedMessage> = {},
): LoggedCapturedMessage => {
  let pdo = 0
  pdo = setBits(pdo, 29, 29, 1)
  pdo = setBits(pdo, 28, 28, 1)
  pdo = setBits(pdo, 27, 27, 1)
  pdo = setBits(pdo, 26, 26, 1)
  pdo = setBits(pdo, 25, 25, 1)
  pdo = setBits(pdo, 24, 24, 1)
  pdo = setBits(pdo, 23, 23, 1)
  pdo = setBits(pdo, 21, 20, 2)
  pdo = setBits(pdo, 19, 10, 100)
  pdo = setBits(pdo, 9, 0, 200)
  const payload = buildUsbPdMessage(
    SOP,
    makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageId: 4,
      messageTypeNumber: 0x01,
    }),
    [...toBytes32(pdo), 0x01, 0x02, 0x03, 0x04],
  )
  return {
    entryKind: 'message',
    eventType: null,
    eventText: null,
    eventWallClockMs: null,
    wallClockUs: BigInt(1_700_000_000_000_000 + index * 10),
    startTimestampUs: BigInt(1000 + index * 10),
    endTimestampUs: BigInt(1005 + index * 10),
    displayTimestampUs: BigInt(index * 10),
    decodeResult: 0,
    sopKind: 'SOP',
    messageKind: 'DATA',
    messageType: 1,
    messageId: 4,
    senderPowerRole: 'SOURCE',
    senderDataRole: 'DFP',
    pulseCount: 3,
    rawPulseWidths: Float64Array.from([1, 2, 3]),
    rawSop: payload.subarray(0, 4),
    rawDecodedData: payload.subarray(4),
    parseError: null,
    createdAtMs: 1_700_000_000_000 + index,
    ...overrides,
  }
}

const buildCaptureChangedExportEvent = (index: number): LoggedCapturedMessage => ({
  entryKind: 'event',
  eventType: 'capture_changed',
  eventText: 'Capture changed',
  eventWallClockMs: 1_700_000_100_000 + index,
  wallClockUs: BigInt(1_700_000_100_000_000 + index),
  startTimestampUs: BigInt(2000 + index),
  endTimestampUs: BigInt(2000 + index),
  displayTimestampUs: null,
  decodeResult: 0,
  sopKind: null,
  messageKind: null,
  messageType: null,
  messageId: null,
  senderPowerRole: null,
  senderDataRole: null,
  pulseCount: 0,
  rawPulseWidths: new Float64Array(),
  rawSop: new Uint8Array(),
  rawDecodedData: new Uint8Array(),
  parseError: null,
  createdAtMs: 1_700_000_100_000 + index,
})

describe('buildSelectedMessageLogCsv', () => {
  it('exports selected message and event rows with display fields and decoded metadata', () => {
    const previous = buildSourceCapabilitiesExportRow(0, {
      startTimestampUs: 1000n,
      endTimestampUs: 1005n,
    })
    const message = buildSourceCapabilitiesExportRow(1, {
      startTimestampUs: 1010n,
      endTimestampUs: 1015n,
    })
    const event = buildCaptureChangedExportEvent(2)

    const payload = buildSelectedMessageLogCsv(
      [previous, message, event],
      [buildCapturedLogSelectionKey(message), buildCapturedLogSelectionKey(event)],
    )

    expect(payload.split('\n')[0]).toBe(
      'Type,Wall time,Length,Δt,ID,Message type,Sender,Receiver,SOP,CRC32,Valid,Message Summary',
    )
    expect(payload).toContain(
      [
        'message',
        formatWallClock(message.wallClockUs),
        '5',
        '5',
        '4',
        'Source Capabilities',
        'Source',
        'Sink',
        'SOP',
        '0x04030201',
        'Valid',
      ].join(','),
    )
    expect(payload).toContain('"The source is reporting the following capabilities:')
    expect(payload).toContain('- 5V @ 2A')
    expect(payload).toContain(
      `event,${formatWallClock(event.wallClockUs)},,,,capture_changed,,,,,,`,
    )
  })
})
