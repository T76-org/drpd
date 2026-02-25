import { describe, expect, it } from 'vitest'
import { DRPDDevice } from '../device'
import { CaptureDecodeResult, OnOffState } from '../types'
import type { DRPDSCPIParam, DRPDTransport } from '../transport'
import { SQLiteWasmStore } from '../logging'

/**
 * Build a capture payload from SOP and decoded bytes.
 *
 * @param sop - SOP bytes.
 * @param decodedData - Decoded data bytes.
 * @returns Binary capture payload.
 */
const buildCapturePayload = (sop: number[], decodedData: number[]): Uint8Array => {
  const pulseWidths = [0x100, 0x101, 0x102]
  const buffer = new Uint8Array(8 + 8 + 4 + 4 + 4 + pulseWidths.length * 2 + 4 + decodedData.length)
  const view = new DataView(buffer.buffer)
  view.setBigUint64(0, 5_000n, true)
  view.setBigUint64(8, 6_000n, true)
  view.setUint32(16, CaptureDecodeResult.SUCCESS, true)
  buffer.set(sop, 20)
  view.setUint32(24, pulseWidths.length, true)
  let offset = 28
  for (let index = 0; index < pulseWidths.length; index += 1) {
    view.setUint16(offset + index * 2, pulseWidths[index], true)
  }
  offset += pulseWidths.length * 2
  view.setUint32(offset, decodedData.length, true)
  buffer.set(decodedData, offset + 4)
  return buffer
}

/**
 * Mock transport for logging integration tests.
 */
class MockTransport implements DRPDTransport {
  public textResponses = new Map<string, string[]>()
  public binaryResponses = new Map<string, Uint8Array[]>()

  public async sendCommand(_command: string, ..._params: DRPDSCPIParam[]): Promise<void> {}

  public async queryText(command: string, ..._params: DRPDSCPIParam[]): Promise<string[]> {
    const response = this.textResponses.get(command)
    if (!response) {
      throw new Error(`Missing response for ${command}`)
    }
    return response
  }

  public async queryBinary(command: string, ..._params: DRPDSCPIParam[]): Promise<Uint8Array> {
    const entries = this.binaryResponses.get(command)
    if (!entries || entries.length === 0) {
      throw new Error(`Missing binary response for ${command}`)
    }
    return entries.shift() as Uint8Array
  }
}

/**
 * Force the driver to connected state in tests.
 *
 * @param device - Device to update.
 */
const setConnected = (device: DRPDDevice): void => {
  ;(device as unknown as { isConnected: boolean }).isConnected = true
}

describe('DRPD logging integration', () => {
  it('auto-enables logging when capture is turned on and logs analog plus messages', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('MEAS:ALL?', [
      '1000',
      '5.0',
      '0.2',
      '0.0',
      '0.0',
      '0.0',
      '0.0',
      '1.2',
      '0.0',
      '0.6',
    ])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['1', '0'])
    transport.binaryResponses.set('BUS:CC:CAP:DATA?', [
      buildCapturePayload(
        [0x18, 0x18, 0x18, 0x11],
        [0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d],
      ),
    ])

    const store = new SQLiteWasmStore({
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })
    setConnected(device)

    await device.setCaptureEnabled(OnOffState.ON)
    expect(device.isLoggingEnabled()).toBe(true)

    await (device as unknown as { pollAnalogMonitor: () => Promise<void> }).pollAnalogMonitor()
    await (
      device as unknown as { refreshAndDrainCapturedMessagesFromDevice: () => Promise<void> }
    ).refreshAndDrainCapturedMessagesFromDevice()

    const analog = await device.queryAnalogSamples({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
    })
    const messages = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
    })

    expect(analog).toHaveLength(1)
    expect(analog[0].vbusV).toBe(5.0)
    expect(analog[0].ibusA).toBe(0.2)
    expect(messages).toHaveLength(1)
  })

  it('ingests analog polling samples and captured messages through device paths', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('MEAS:ALL?', [
      '1000',
      '5.0',
      '0.2',
      '0.0',
      '0.0',
      '0.0',
      '0.0',
      '1.2',
      '0.0',
      '0.6',
    ])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['1', '0'])
    transport.binaryResponses.set('BUS:CC:CAP:DATA?', [
      buildCapturePayload(
        [0x18, 0x18, 0x18, 0x11],
        [0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d],
      ),
    ])

    const store = new SQLiteWasmStore({
      enabled: true,
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })
    await device.configureLogging({
      enabled: true,
      autoStartOnConnect: false,
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    })
    await device.startLogging()
    setConnected(device)

    await (device as unknown as { pollAnalogMonitor: () => Promise<void> }).pollAnalogMonitor()
    await (
      device as unknown as { refreshAndDrainCapturedMessagesFromDevice: () => Promise<void> }
    ).refreshAndDrainCapturedMessagesFromDevice()

    const analog = await device.queryAnalogSamples({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
    })
    const messages = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
    })

    expect(analog.length).toBe(1)
    expect(analog[0].vbusV).toBe(5.0)
    expect(messages.length).toBe(1)
    expect(messages[0].messageKind).toBe('CONTROL')
    expect(messages[0].senderPowerRole).toBe('SOURCE')
    expect(messages[0].senderDataRole).toBe('DFP')
  })

  it('stops writing when logging is disabled or stopped', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('MEAS:ALL?', [
      '1000',
      '4.8',
      '0.3',
      '0.0',
      '0.0',
      '0.0',
      '0.0',
      '1.2',
      '0.0',
      '0.6',
    ])

    const store = new SQLiteWasmStore({
      maxAnalogSamples: 10,
      maxCapturedMessages: 10,
      retentionTrimBatchSize: 5,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })
    await device.configureLogging({
      enabled: true,
      autoStartOnConnect: false,
      maxAnalogSamples: 10,
      maxCapturedMessages: 10,
      retentionTrimBatchSize: 5,
    })
    await device.startLogging()
    await device.stopLogging()
    setConnected(device)

    await (device as unknown as { pollAnalogMonitor: () => Promise<void> }).pollAnalogMonitor()
    const analog = await device.queryAnalogSamples({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
    })
    expect(analog.length).toBe(0)
  })

  it('stops analog logging when capture is turned off', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('MEAS:ALL?', [
      '1000',
      '5.0',
      '0.2',
      '0.0',
      '0.0',
      '0.0',
      '0.0',
      '1.2',
      '0.0',
      '0.6',
    ])

    const store = new SQLiteWasmStore({
      maxAnalogSamples: 10,
      maxCapturedMessages: 10,
      retentionTrimBatchSize: 5,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })
    setConnected(device)

    await device.setCaptureEnabled(OnOffState.ON)
    await (device as unknown as { pollAnalogMonitor: () => Promise<void> }).pollAnalogMonitor()

    transport.textResponses.set('MEAS:ALL?', [
      '2000',
      '5.1',
      '0.3',
      '0.0',
      '0.0',
      '0.0',
      '0.0',
      '1.2',
      '0.0',
      '0.6',
    ])
    await device.setCaptureEnabled(OnOffState.OFF)
    await (device as unknown as { pollAnalogMonitor: () => Promise<void> }).pollAnalogMonitor()

    const analog = await device.queryAnalogSamples({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
    })
    expect(analog).toHaveLength(1)
    expect(analog[0].timestampUs).toBe(1000n)
  })
})
