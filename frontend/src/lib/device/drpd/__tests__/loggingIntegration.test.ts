import { describe, expect, it } from 'vitest'
import { DRPDDevice } from '../device'
import { CaptureDecodeResult, OnOffState } from '../types'
import type { DRPDSCPIParam, DRPDTransport } from '../transport'
import { SQLiteWasmStore } from '../logging'
import type {
  AnalogSampleQuery,
  CapturedMessageQuery,
  DRPDLogStore,
  LoggedAnalogSample,
  LoggedCapturedMessage,
} from '../logging'

/**
 * Build a capture payload from SOP and decoded bytes.
 *
 * @param sop - SOP bytes.
 * @param decodedData - Decoded data bytes.
 * @returns Binary capture payload.
 */
const buildCapturePayload = (
  sop: number[],
  decodedData: number[],
  startTimestampUs = 5_000n,
  endTimestampUs = 6_000n,
): Uint8Array => {
  const pulseWidths = [0x100, 0x101, 0x102]
  const buffer = new Uint8Array(8 + 8 + 4 + 4 + 4 + pulseWidths.length * 2 + 4 + decodedData.length)
  const view = new DataView(buffer.buffer)
  view.setBigUint64(0, startTimestampUs, true)
  view.setBigUint64(8, endTimestampUs, true)
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

/**
 * Force an in-memory role snapshot in tests.
 *
 * @param device - Device to update.
 * @param role - Role to set.
 */
const setRoleSnapshot = (device: DRPDDevice, role: 'SOURCE' | 'SINK'): void => {
  const asAny = device as unknown as {
    state: {
      role: 'SOURCE' | 'SINK' | null
      ccBusRoleStatus: unknown
      analogMonitor: unknown
      vbusInfo: unknown
      captureEnabled: unknown
      triggerInfo: unknown
      sinkInfo: unknown
      sinkPdoList: unknown
    }
  }
  asAny.state = { ...asAny.state, role }
}

/**
 * Force an in-memory role-status snapshot in tests.
 *
 * @param device - Device to update.
 * @param roleStatus - Role status to set.
 */
const setRoleStatusSnapshot = (
  device: DRPDDevice,
  roleStatus: 'UNATTACHED' | 'SOURCE_FOUND' | 'ATTACHED',
): void => {
  const asAny = device as unknown as {
    state: {
      role: 'SOURCE' | 'SINK' | null
      ccBusRoleStatus: 'UNATTACHED' | 'SOURCE_FOUND' | 'ATTACHED' | null
      analogMonitor: unknown
      vbusInfo: unknown
      captureEnabled: unknown
      triggerInfo: unknown
      sinkInfo: unknown
      sinkPdoList: unknown
    }
  }
  asAny.state = { ...asAny.state, ccBusRoleStatus: roleStatus }
}

describe('DRPD logging integration', () => {
  it('can query existing log rows even when logging has not been started', async () => {
    const transport = new MockTransport()
    const expectedRow: LoggedCapturedMessage = {
      entryKind: 'message',
      eventType: null,
      eventText: null,
      eventWallClockMs: null,
      startTimestampUs: 1234n,
      endTimestampUs: 1240n,
      displayTimestampUs: 0n,
      decodeResult: 0,
      sopKind: 'SOP',
      messageKind: 'CONTROL',
      messageType: 1,
      messageId: 2,
      senderPowerRole: 'SOURCE',
      senderDataRole: 'DFP',
      pulseCount: 1,
      rawPulseWidths: Uint16Array.from([1]),
      rawSop: Uint8Array.from([0x11]),
      rawDecodedData: Uint8Array.from([0x22]),
      parseError: null,
      createdAtMs: 42,
    }

    class ReadableLogStore implements DRPDLogStore {
      public initialized = false

      public async init(): Promise<void> {
        this.initialized = true
      }
      public async close(): Promise<void> {}
      public async insertAnalogSample(): Promise<void> {}
      public async insertCapturedMessage(): Promise<void> {}
      public async queryAnalogSamples(_query: AnalogSampleQuery): Promise<LoggedAnalogSample[]> {
        return []
      }
      public async queryCapturedMessages(_query: CapturedMessageQuery): Promise<LoggedCapturedMessage[]> {
        return [expectedRow]
      }
      public async exportData(): Promise<{
        mimeType: string
        payload: string
        analogCount: number
        messageCount: number
      }> {
        return { mimeType: 'application/json', payload: '{}', analogCount: 0, messageCount: 0 }
      }
      public async clear(): Promise<{ analogDeleted: number; messagesDeleted: number }> {
        return { analogDeleted: 0, messagesDeleted: 0 }
      }
      public async enforceRetention(): Promise<void> {}
      public async getCounts(): Promise<{ analog: number; messages: number }> {
        return { analog: 0, messages: 1 }
      }
    }

    const store = new ReadableLogStore()
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })

    const rows = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 99999n,
    })

    expect(store.initialized).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].startTimestampUs).toBe(1234n)
  })

  it('upgrades legacy capture retention cap before creating the log store', async () => {
    const transport = new MockTransport()
    let createdConfigMaxCaptured = -1

    const store = new SQLiteWasmStore()
    const device = new DRPDDevice(transport, {
      createLogStore: (config) => {
        createdConfigMaxCaptured = config.maxCapturedMessages
        return store
      },
    })
    setConnected(device)

    await device.configureLogging({
      enabled: true,
      autoStartOnConnect: false,
      maxAnalogSamples: 1_000_000,
      maxCapturedMessages: 50,
      retentionTrimBatchSize: 2_000,
    })
    await device.setCaptureEnabled(OnOffState.ON)

    expect(createdConfigMaxCaptured).toBe(1_000_000)
  })

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

  it('records SOP prime cable/port origin metadata for sender/receiver resolution', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['2', '0'])
    transport.binaryResponses.set('BUS:CC:CAP:DATA?', [
      // SOP' with Cable Plug bit set (message originated from cable/VPD).
      buildCapturePayload(
        [0x18, 0x18, 0x06, 0x06],
        [0x01, 0x01, 0x28, 0x13, 0xc5, 0x2f],
        5_000n,
        6_000n,
      ),
      // SOP' with Cable Plug bit clear (message originated from DFP/UFP port).
      buildCapturePayload(
        [0x18, 0x18, 0x06, 0x06],
        [0x01, 0x00, 0x28, 0x13, 0xc5, 0x2f],
        7_000n,
        8_000n,
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
    setRoleSnapshot(device, 'SINK')

    await device.setCaptureEnabled(OnOffState.ON)
    await (
      device as unknown as { refreshAndDrainCapturedMessagesFromDevice: () => Promise<void> }
    ).refreshAndDrainCapturedMessagesFromDevice()

    const messages = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
      sortOrder: 'asc',
    })

    expect(messages).toHaveLength(2)
    expect(messages[0].sopKind).toBe('SOP_PRIME')
    expect(messages[0].senderPowerRole).toBe('SOURCE')
    expect(messages[0].senderDataRole).toBe('CABLE_PLUG_VPD')
    expect(messages[1].sopKind).toBe('SOP_PRIME')
    expect(messages[1].senderPowerRole).toBe('SOURCE')
    expect(messages[1].senderDataRole).toBe('UFP_DFP')
  })

  it('emits log change events when entries are added and cleared', async () => {
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
    const addedKinds: string[] = []
    const deletedEvents: Array<{ analogDeleted: number; messagesDeleted: number }> = []
    device.addEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, (event) => {
      const detail = (event as CustomEvent<{ kind: string }>).detail
      addedKinds.push(detail.kind)
    })
    device.addEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, (event) => {
      const detail = (event as CustomEvent<{ analogDeleted: number; messagesDeleted: number }>).detail
      deletedEvents.push({
        analogDeleted: detail.analogDeleted,
        messagesDeleted: detail.messagesDeleted,
      })
    })
    setConnected(device)

    await device.setCaptureEnabled(OnOffState.ON)
    await (device as unknown as { pollAnalogMonitor: () => Promise<void> }).pollAnalogMonitor()
    await (
      device as unknown as { refreshAndDrainCapturedMessagesFromDevice: () => Promise<void> }
    ).refreshAndDrainCapturedMessagesFromDevice()

    const clearResult = await device.clearLogs('all')

    expect(addedKinds).toEqual(['analog', 'message'])
    expect(deletedEvents).toEqual([{ analogDeleted: 1, messagesDeleted: 1 }])
    expect(clearResult).toEqual({ analogDeleted: 1, messagesDeleted: 1 })
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

  it('logs significant events and resets display epoch on next message', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:CC:ROLE:STAT?', ['ATTACHED'])
    transport.textResponses.set('MEAS:ALL?', [
      '10020',
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
        10_000n,
        10_010n,
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
    setRoleStatusSnapshot(device, 'UNATTACHED')

    await device.setCaptureEnabled(OnOffState.ON)
    await (
      device as unknown as { refreshRoleStatusFromDevice: () => Promise<void> }
    ).refreshRoleStatusFromDevice()
    await (
      device as unknown as { refreshAndDrainCapturedMessagesFromDevice: () => Promise<void> }
    ).refreshAndDrainCapturedMessagesFromDevice()
    await (device as unknown as { pollAnalogMonitor: () => Promise<void> }).pollAnalogMonitor()

    const messages = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 20_000n,
      sortOrder: 'asc',
    })
    const analog = await device.queryAnalogSamples({
      startTimestampUs: 0n,
      endTimestampUs: 20_000n,
    })

    expect(messages).toHaveLength(2)
    expect(messages[0].entryKind).toBe('event')
    expect(messages[0].eventType).toBe('cc_status_changed')
    expect(messages[1].entryKind).toBe('message')
    expect(messages[1].displayTimestampUs).toBe(0n)
    expect(analog).toHaveLength(1)
    expect(analog[0].displayTimestampUs).toBe(20n)
  })
})
