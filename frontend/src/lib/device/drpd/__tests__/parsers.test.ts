import { describe, expect, it } from 'vitest'
import {
  analogMonitorCCStatusFromVoltage,
  parseAnalogMonitorChannels,
  parseCapturedMessage,
  parseDeviceIdentity,
  parseDeviceStatus,
  parseSinkPdo,
} from '../parsers'
import { AnalogMonitorCCChannelStatus, CaptureDecodeResult } from '../types'
import { parseUSBPDMessage } from '../usb-pd/parser'
import { PSRDYMessage } from '../usb-pd/message'

const buildCapturePayload = () => {
  const pulseWidths = [5, 6, 7]
  const decoded = Uint8Array.from([0x12, 0x34])
  const buffer = new Uint8Array(8 + 8 + 4 + 4 + 4 + pulseWidths.length * 2 + 4 + decoded.length)
  const view = new DataView(buffer.buffer)
  view.setBigUint64(0, 1_000_000n, true)
  view.setBigUint64(8, 1_000_500n, true)
  view.setUint32(16, CaptureDecodeResult.SUCCESS, true)
  buffer.set([0xde, 0xad, 0xbe, 0xef], 20)
  view.setUint32(24, pulseWidths.length, true)
  let offset = 28
  pulseWidths.forEach((value, index) => {
    view.setUint16(offset + index * 2, value, true)
  })
  offset += pulseWidths.length * 2
  const dataLengthOffset = offset
  view.setUint32(dataLengthOffset, decoded.length, true)
  buffer.set(decoded, dataLengthOffset + 4)
  return buffer
}

const hexToBytes = (hex: string): Uint8Array => {
  const cleaned = hex.replace(/\s+/g, '')
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string must have an even length')
  }
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    const start = index * 2
    bytes[index] = Number.parseInt(cleaned.slice(start, start + 2), 16)
  }
  return bytes
}

describe('drpd parsers', () => {
  it('parses device identity responses with commas', () => {
    const identity = parseDeviceIdentity(['MTA Inc.,Dr. PD,ABC,1.0'])
    expect(identity).toEqual({
      manufacturer: 'MTA Inc.',
      model: 'Dr. PD',
      serialNumber: 'ABC',
      firmwareVersion: '1.0',
    })
  })

  it('parses device status flags', () => {
    const flags = parseDeviceStatus(0x00000085)
    expect(flags.vbusStatusChanged).toBe(true)
    expect(flags.roleChanged).toBe(false)
    expect(flags.captureStatusChanged).toBe(true)
    expect(flags.ccBusStatusChanged).toBe(false)
    expect(flags.messageReceived).toBe(true)
  })

  it('parses analog monitor channels', () => {
    const channels = parseAnalogMonitorChannels([
      '123456',
      '5.0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '1.2',
      '0.0',
      '0.6',
    ])
    expect(channels.captureTimestampUs).toBe(123456n)
    expect(channels.vbus).toBeCloseTo(5.0)
    expect(channels.currentVref).toBeCloseTo(0.6)
  })

  it('parses sink PDO responses', () => {
    const fixed = parseSinkPdo(['FIXED,5.0,3.0'])
    expect(fixed).toEqual({ type: 'FIXED', voltageV: 5.0, maxCurrentA: 3.0 })

    const augmented = parseSinkPdo(['AUGMENTED,3.3,11.0,2.5'])
    expect(augmented).toEqual({
      type: 'AUGMENTED',
      minVoltageV: 3.3,
      maxVoltageV: 11.0,
      maxCurrentA: 2.5,
    })
  })

  it('parses capture payloads', () => {
    const payload = buildCapturePayload()
    const message = parseCapturedMessage(payload)
    expect(message.startTimestampUs).toBe(1_000_000n)
    expect(message.endTimestampUs).toBe(1_000_500n)
    expect(message.decodeResult).toBe(CaptureDecodeResult.SUCCESS)
    expect(message.pulseCount).toBe(3)
    expect(Array.from(message.pulseWidths)).toEqual([5, 6, 7])
    expect(Array.from(message.decodedData)).toEqual([0x12, 0x34])
  })

  it('parses captured PS_RDY payloads and decodes USB-PD header fields', () => {
    const captureHex =
      '193dc20500000000193fc205000000000000000018181811e7000000f400a700a4004d01a500a6004c01a600a5004d01a500a6004c01a600a5004d01a500a6004c01a600a4004e01a500a6004b01a700a5004d01a400a7004b01a700a4004e01a400a6004c01a700a4004d01a500a6004c01a600a5004d01a500a7004b01a600a5004d01a500a6004c01a600a5004d01a500a6004c01a600a5004d01a500a6004b01a600a5004e01a400a6004c01a600a5004e01a400a6004c01a600a5004d01a500a6004c01a600a5004d01a500a6004c01a600a4004e01a500a6004b014e014b01a700a400a700a5004d014c014d01a400a700a400a6004c014d014c01a600a500a600a500a600a5004d014c014d01a500a6004c01a600a500a600a400a700a4004e014c01a600a400a600a5004d01a500a600a500a600a400a7004c01a600a5004d014c01a600a500a600a400a600a500a600a500a600a5004d01a500a600a500a600a400a700a400a7004b014d01a500a6004c01a600a500a600a5004d01a500a600a500a600a400a7004b01a600a500a600a500a600a5004d014c01a600a500a600a400a600a5004e014b01a700a400a600a500a600a500a600a500a600a5004d014c01a600a5004d01a500a6004c01a600a500a600a500a600a4004e01a400a600a500a6004c0106000000a6051ffdeec9'
    const payload = hexToBytes(captureHex)
    const message = parseCapturedMessage(payload)
    expect(message.startTimestampUs).toBe(0x0000000005c23d19n)
    expect(message.endTimestampUs).toBe(0x0000000005c23f19n)
    expect(message.decodeResult).toBe(CaptureDecodeResult.SUCCESS)
    expect(message.pulseCount).toBe(0xe7)
    expect(Array.from(message.decodedData)).toEqual([0xa6, 0x05, 0x1f, 0xfd, 0xee, 0xc9])

    const usbPayload = new Uint8Array(message.sop.length + message.decodedData.length)
    usbPayload.set(message.sop, 0)
    usbPayload.set(message.decodedData, message.sop.length)
    const usbMessage = parseUSBPDMessage(usbPayload)
    expect(usbMessage).toBeInstanceOf(PSRDYMessage)
    expect(usbMessage.sop.kind).toBe('SOP')
    expect(usbMessage.header.messageHeaderRaw).toBe(0x05a6)
    expect(usbMessage.header.messageHeader.messageKind).toBe('CONTROL')
    expect(usbMessage.header.messageHeader.messageTypeNumber).toBe(0x06)
    expect(usbMessage.header.messageHeader.messageId).toBe(0x02)
    expect(usbMessage.header.messageHeader.powerRole).toBe('SOURCE')
    expect(usbMessage.header.messageHeader.dataRole).toBe('DFP')
  })

  it('derives CC status from voltage thresholds', () => {
    expect(analogMonitorCCStatusFromVoltage(0.0)).toBe(
      AnalogMonitorCCChannelStatus.DISCONNECTED,
    )
    expect(analogMonitorCCStatusFromVoltage(0.5)).toBe(
      AnalogMonitorCCChannelStatus.SINK_TX_NG,
    )
    expect(analogMonitorCCStatusFromVoltage(1.5)).toBe(
      AnalogMonitorCCChannelStatus.SINK_TX_OK,
    )
    expect(analogMonitorCCStatusFromVoltage(2.7)).toBe(AnalogMonitorCCChannelStatus.V_CONN)
    expect(analogMonitorCCStatusFromVoltage(2.4)).toBe(AnalogMonitorCCChannelStatus.UNKNOWN)
  })
})
