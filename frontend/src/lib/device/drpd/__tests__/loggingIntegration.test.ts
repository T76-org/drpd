import { describe, expect, it, vi } from 'vitest'
import { DRPDDevice } from '../device'
import { CaptureDecodeResult, OnOffState } from '../types'
import type { DRPDSCPIParam, DRPDTransport } from '../transport'
import { buildDefaultLoggingConfig, SQLiteWasmStore } from '../logging'
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

const buildCaptureEventPayload = (
  eventType: number,
  eventText: string,
  timestampUs = 7_000n,
): Uint8Array => {
  const eventTextBytes = new TextEncoder().encode(eventText)
  const dataLength = 4 + eventTextBytes.length
  const buffer = new Uint8Array(8 + 8 + 4 + 4 + 4 + 4 + dataLength)
  const view = new DataView(buffer.buffer)
  view.setBigUint64(0, timestampUs, true)
  view.setBigUint64(8, timestampUs, true)
  view.setUint32(16, CaptureDecodeResult.FIRMWARE_EVENT, true)
  view.setUint32(24, 0, true)
  view.setUint32(28, dataLength, true)
  view.setUint32(32, eventType, true)
  buffer.set(eventTextBytes, 36)
  return buffer
}

/**
 * Mock transport for logging integration tests.
 */
class MockTransport implements DRPDTransport {
  public readonly kind = 'winusb' as const
  public textResponses = new Map<string, string[]>()
  public binaryResponses = new Map<string, Uint8Array[]>()

  public async sendCommand(command: string, ...params: DRPDSCPIParam[]): Promise<void> {
    void command
    void params
  }

  public async queryText(command: string, ...params: DRPDSCPIParam[]): Promise<string[]> {
    void params
    const response = this.textResponses.get(command)
    if (!response) {
      throw new Error(`Missing response for ${command}`)
    }
    return response
  }

  public async queryBinary(command: string, ...params: DRPDSCPIParam[]): Promise<Uint8Array> {
    void params
    const entries = this.binaryResponses.get(command)
    if (!entries || entries.length === 0) {
      throw new Error(`Missing binary response for ${command}`)
    }
    return entries.shift() as Uint8Array
  }
}

const buildLoggingConfig = (
  overrides: Partial<ReturnType<typeof buildDefaultLoggingConfig>> = {},
) => ({
  ...buildDefaultLoggingConfig(),
  ...overrides,
})

const buildImportMessage = (index: number): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  wallClockUs: BigInt(1_700_000_000_000_000 + index),
  startTimestampUs: BigInt(1_000 + index),
  endTimestampUs: BigInt(1_005 + index),
  displayTimestampUs: BigInt(index),
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'CONTROL',
  messageType: 3,
  messageId: index,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 3,
  rawPulseWidths: Float64Array.from([1, 2, 3]),
  rawSop: Uint8Array.from([0x12, 0x34]),
  rawDecodedData: Uint8Array.from([0xaa, 0xbb]),
  parseError: null,
  createdAtMs: 1_700_000_000_000 + index,
})

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
const setRoleSnapshot = (device: DRPDDevice, role: 'DISABLED' | 'OBSERVER' | 'SINK'): void => {
  const asAny = device as unknown as {
    state: {
      role: 'DISABLED' | 'OBSERVER' | 'SINK' | null
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
      role: 'DISABLED' | 'OBSERVER' | 'SINK' | null
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
  it('clears all log data before importing captured messages', async () => {
    const store = new SQLiteWasmStore(buildLoggingConfig({ storageBackend: 'memory' }))
    const device = new DRPDDevice(new MockTransport(), {
      createLogStore: () => store,
    })
    const imported = [buildImportMessage(1), buildImportMessage(2)]

    await device.importCapturedMessages([buildImportMessage(0)], { clearScope: 'all' })
    await store.insertAnalogSample({
      timestampUs: 1n,
      displayTimestampUs: 1n,
      wallClockUs: 1n,
      vbusV: 5,
      ibusA: 0.1,
      role: 'SINK',
      createdAtMs: 1,
    })

    const result = await device.importCapturedMessages(imported, { clearScope: 'all' })
    const counts = await store.getCounts()
    const rows = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
      sortOrder: 'asc',
    })

    expect(result).toEqual({
      analogDeleted: 1,
      messagesDeleted: 1,
      messagesImported: 2,
    })
    expect(counts).toEqual({ analog: 0, messages: 2 })
    expect(rows.map((row) => row.messageId)).toEqual([1, 2])
  })

  it('enters capture mode immediately when connect hydration finds capture already on', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SYST:TIME?', ['1000'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    transport.textResponses.set('BUS:CC:ROLE?', ['SINK'])
    transport.textResponses.set('SINK:EPR:EN?', ['OFF'])
    transport.textResponses.set('SINK:PPS:STATUS:EN?', ['OFF'])
    transport.textResponses.set('BUS:CC:ROLE:STAT?', ['ATTACHED'])
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
      '2500',
      '12',
      '34',
    ])
    transport.textResponses.set('BUS:VBUS:STAT?', ['ENABLED', 'NONE', 'NONE'])
    transport.textResponses.set('BUS:VBUS:OVPT?', ['21'])
    transport.textResponses.set('BUS:VBUS:OCPT?', ['3.5'])
    transport.textResponses.set('BUS:CC:CAP:EN?', ['ON'])
    transport.textResponses.set('TRIG:STAT?', ['IDLE'])
    transport.textResponses.set('TRIG:EV:TYPE?', ['OFF'])
    transport.textResponses.set('TRIG:EV:THRESH?', ['1'])
    transport.textResponses.set('TRIG:EV:AUTOREPEAT?', ['OFF'])
    transport.textResponses.set('TRIG:EV:COUNT?', ['0'])
    transport.textResponses.set('TRIG:SYNC:MODE?', ['PULSE_HIGH'])
    transport.textResponses.set('TRIG:SYNC:PULSEWIDTH?', ['1'])
    transport.textResponses.set('SINK:STATUS?', ['PE_SNK_READY'])
    transport.textResponses.set('SINK:STATUS:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('SINK:STATUS:VOLTAGE?', ['5'])
    transport.textResponses.set('SINK:STATUS:CURRENT?', ['2'])
    transport.textResponses.set('SINK:STATUS:ERROR?', ['0'])
    transport.textResponses.set('SINK:PDO:COUNT?', ['1'])
    transport.textResponses.set('SINK:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('STAT:DEV?', ['0'])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['0'])

    const store = new SQLiteWasmStore({
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })

    await device.handleConnect()

    expect(device.getState().captureEnabled).toBe(OnOffState.ON)
    expect(device.isLoggingEnabled()).toBe(true)
    expect(device.getLoggingDiagnostics().loggingConfigured).toBe(true)

    device.handleDisconnect()
  })

  it('keeps logging active when saved logging config is applied after hydration finds capture already on', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SYST:TIME?', ['1000'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    transport.textResponses.set('BUS:CC:ROLE?', ['SINK'])
    transport.textResponses.set('SINK:EPR:EN?', ['OFF'])
    transport.textResponses.set('SINK:PPS:STATUS:EN?', ['OFF'])
    transport.textResponses.set('BUS:CC:ROLE:STAT?', ['ATTACHED'])
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
      '2500',
      '12',
      '34',
    ])
    transport.textResponses.set('BUS:VBUS:STAT?', ['ENABLED', 'NONE', 'NONE'])
    transport.textResponses.set('BUS:VBUS:OVPT?', ['21'])
    transport.textResponses.set('BUS:VBUS:OCPT?', ['3.5'])
    transport.textResponses.set('BUS:CC:CAP:EN?', ['ON'])
    transport.textResponses.set('TRIG:STAT?', ['IDLE'])
    transport.textResponses.set('TRIG:EV:TYPE?', ['OFF'])
    transport.textResponses.set('TRIG:EV:THRESH?', ['1'])
    transport.textResponses.set('TRIG:EV:AUTOREPEAT?', ['OFF'])
    transport.textResponses.set('TRIG:EV:COUNT?', ['0'])
    transport.textResponses.set('TRIG:SYNC:MODE?', ['PULSE_HIGH'])
    transport.textResponses.set('TRIG:SYNC:PULSEWIDTH?', ['1'])
    transport.textResponses.set('SINK:STATUS?', ['PE_SNK_READY'])
    transport.textResponses.set('SINK:STATUS:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('SINK:STATUS:VOLTAGE?', ['5'])
    transport.textResponses.set('SINK:STATUS:CURRENT?', ['2'])
    transport.textResponses.set('SINK:STATUS:ERROR?', ['0'])
    transport.textResponses.set('SINK:PDO:COUNT?', ['1'])
    transport.textResponses.set('SINK:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('STAT:DEV?', ['0'])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['0'])

    const store = new SQLiteWasmStore({
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })

    await device.handleConnect()
    expect(device.getState().captureEnabled).toBe(OnOffState.ON)
    expect(device.isLoggingEnabled()).toBe(true)

    await device.configureLogging(buildLoggingConfig({
      enabled: false,
      autoStartOnConnect: true,
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    }))

    expect(device.getState().captureEnabled).toBe(OnOffState.ON)
    expect(device.isLoggingEnabled()).toBe(true)
    expect(device.getLoggingDiagnostics().loggingConfigured).toBe(true)

    device.handleDisconnect()
  })

  it('can query existing log rows even when logging has not been started', async () => {
    const transport = new MockTransport()
    const expectedRow: LoggedCapturedMessage = {
      entryKind: 'message',
      eventType: null,
      eventText: null,
      eventWallClockMs: null,
      wallClockUs: 42_000n,
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
      rawPulseWidths: Float64Array.from([1]),
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
      public async queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]> {
        void query
        return []
      }
      public async queryCapturedMessages(query: CapturedMessageQuery): Promise<LoggedCapturedMessage[]> {
        void query
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

    await device.configureLogging(buildLoggingConfig({
      enabled: true,
      autoStartOnConnect: false,
      maxAnalogSamples: 1_000_000,
      maxCapturedMessages: 50,
      retentionTrimBatchSize: 2_000,
    }))
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
      '2500',
      '12',
      '34',
    ])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['1', '0'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
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
    expect(Array.from(messages[0].rawPulseWidths)).toEqual([2560, 2570, 2580])
  })

  it('logs firmware capture events from the existing capture drain path', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['10'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    transport.binaryResponses.set('BUS:CC:CAP:DATA?', [
      buildCapturePayload(
        [0x18, 0x18, 0x18, 0x11],
        [0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d],
        5_000n,
        6_000n,
      ),
      buildCaptureEventPayload(0x12345678, 'Policy engine ready', 7_000n),
      buildCaptureEventPayload(1, 'VBUS OVP event', 8_000n),
      buildCaptureEventPayload(2, 'VBUS OCP event', 9_000n),
      buildCaptureEventPayload(3, 'Device status changed to UNATTACHED', 10_000n),
      buildCaptureEventPayload(4, 'Device status changed to SOURCE_FOUND', 11_000n),
      buildCaptureEventPayload(5, 'Device status changed to ATTACHED', 12_000n),
      buildCaptureEventPayload(6, 'CC role changed to DISABLED', 13_000n),
      buildCaptureEventPayload(7, 'CC role changed to OBSERVER', 14_000n),
      buildCaptureEventPayload(8, 'CC role changed to SINK', 15_000n),
      buildCaptureEventPayload(9, 'Sink error flags changed: 0x00000001', 16_000n),
      buildCaptureEventPayload(10, 'Sync trigger', 17_000n),
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
    await (
      device as unknown as { refreshAndDrainCapturedMessagesFromDevice: () => Promise<void> }
    ).refreshAndDrainCapturedMessagesFromDevice()

    const rows = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 20_000n,
      sortOrder: 'asc',
    })

    expect(rows).toHaveLength(12)
    expect(rows[0].entryKind).toBe('message')
    expect(rows[1].entryKind).toBe('event')
    expect(rows[1].eventType).toBe('firmware_event')
    expect(rows[1].eventText).toBe('Firmware event 305419896: Policy engine ready')
    expect(rows[1].startTimestampUs).toBe(7_000n)
    expect(rows[2].entryKind).toBe('event')
    expect(rows[2].eventType).toBe('vbus_ovp')
    expect(rows[2].eventText).toBe('VBUS OVP event')
    expect(rows[2].startTimestampUs).toBe(8_000n)
    expect(rows[3].entryKind).toBe('event')
    expect(rows[3].eventType).toBe('vbus_ocp')
    expect(rows[3].eventText).toBe('VBUS OCP event')
    expect(rows[3].startTimestampUs).toBe(9_000n)
    expect(rows[4].entryKind).toBe('event')
    expect(rows[4].eventType).toBe('cc_status_changed')
    expect(rows[4].eventText).toBe('Device status changed to UNATTACHED')
    expect(rows[4].startTimestampUs).toBe(10_000n)
    expect(rows[5].entryKind).toBe('event')
    expect(rows[5].eventType).toBe('cc_status_changed')
    expect(rows[5].eventText).toBe('Device status changed to SOURCE_FOUND')
    expect(rows[5].startTimestampUs).toBe(11_000n)
    expect(rows[6].entryKind).toBe('event')
    expect(rows[6].eventType).toBe('cc_status_changed')
    expect(rows[6].eventText).toBe('Device status changed to ATTACHED')
    expect(rows[6].startTimestampUs).toBe(12_000n)
    expect(rows[7].entryKind).toBe('event')
    expect(rows[7].eventType).toBe('cc_role_changed')
    expect(rows[7].eventText).toBe('CC role changed to DISABLED')
    expect(rows[7].startTimestampUs).toBe(13_000n)
    expect(rows[8].entryKind).toBe('event')
    expect(rows[8].eventType).toBe('cc_role_changed')
    expect(rows[8].eventText).toBe('CC role changed to OBSERVER')
    expect(rows[8].startTimestampUs).toBe(14_000n)
    expect(rows[9].entryKind).toBe('event')
    expect(rows[9].eventType).toBe('cc_role_changed')
    expect(rows[9].eventText).toBe('CC role changed to SINK')
    expect(rows[9].startTimestampUs).toBe(15_000n)
    expect(rows[10].entryKind).toBe('event')
    expect(rows[10].eventType).toBe('sink_errors')
    expect(rows[10].eventText).toBe('Sink error flags changed: 0x00000001')
    expect(rows[10].startTimestampUs).toBe(16_000n)
    expect(rows[11].entryKind).toBe('event')
    expect(rows[11].eventType).toBe('sync_trigger')
    expect(rows[11].eventText).toBe('Sync trigger')
    expect(rows[11].startTimestampUs).toBe(17_000n)
  })

  it('records SOP prime cable/port origin metadata for sender/receiver resolution', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['2', '0'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
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
      '2500',
      '12',
      '34',
    ])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['1', '0'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
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
      '2500',
      '12',
      '34',
    ])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['1', '0'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
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
    await device.configureLogging(buildLoggingConfig({
      enabled: true,
      autoStartOnConnect: false,
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    }))
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
      '2500',
      '12',
      '34',
    ])

    const store = new SQLiteWasmStore({
      maxAnalogSamples: 10,
      maxCapturedMessages: 10,
      retentionTrimBatchSize: 5,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })
    await device.configureLogging(buildLoggingConfig({
      enabled: true,
      autoStartOnConnect: false,
      maxAnalogSamples: 10,
      maxCapturedMessages: 10,
      retentionTrimBatchSize: 5,
    }))
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
      '2500',
      '12',
      '34',
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
      '3500',
      '13',
      '35',
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

  it('logs firmware status events from the capture stream', async () => {
    const transport = new MockTransport()
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
      '2500',
      '12',
      '34',
    ])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['2', '0'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    transport.binaryResponses.set('BUS:CC:CAP:DATA?', [
      buildCaptureEventPayload(5, 'Device status changed to ATTACHED', 9_990n),
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
    expect(messages[0].eventText).toBe('Device status changed to ATTACHED')
    expect(messages[1].entryKind).toBe('message')
    expect(messages[1].displayTimestampUs).toBe(10n)
    expect(analog).toHaveLength(1)
    expect(analog[0].displayTimestampUs).toBe(30n)
  })

  it('inserts a manual mark event even while capture is off without starting logging', async () => {
    const transport = new MockTransport()
    const store = new SQLiteWasmStore({
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })
    setConnected(device)

    const addedKinds: string[] = []
    device.addEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, (event) => {
      const detail = (event as CustomEvent<{ kind: string }>).detail
      addedKinds.push(detail.kind)
    })

    expect(device.isLoggingEnabled()).toBe(false)
    await device.markLog()

    const rows = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: BigInt('9223372036854775807'),
      sortOrder: 'asc',
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].entryKind).toBe('event')
    expect(rows[0].eventType).toBe('mark')
    expect(rows[0].eventText).toBe('Mark')
    expect(device.isLoggingEnabled()).toBe(false)
    expect(addedKinds).toEqual(['event'])
  })

  it('does not log CC status events from status refresh after capture is toggled off then on', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:CC:ROLE:STAT?', ['ATTACHED'])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['1', '0'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    transport.binaryResponses.set('BUS:CC:CAP:DATA?', [
      buildCapturePayload(
        [0x18, 0x18, 0x18, 0x11],
        [0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d],
        15_000n,
        15_020n,
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
      device as unknown as { refreshAndDrainCapturedMessagesFromDevice: () => Promise<void> }
    ).refreshAndDrainCapturedMessagesFromDevice()
    await device.setCaptureEnabled(OnOffState.OFF)
    await device.setCaptureEnabled(OnOffState.ON)
    await (
      device as unknown as { refreshRoleStatusFromDevice: () => Promise<void> }
    ).refreshRoleStatusFromDevice()

    const rows = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 30_000n,
      sortOrder: 'asc',
    })
    const statusEvent = rows.find((row) => row.entryKind === 'event' && row.eventType === 'cc_status_changed')

    expect(statusEvent).toBeUndefined()
  })

  it('does not log CC role events from role refresh', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:CC:ROLE?', ['OBSERVER'])

    const store = new SQLiteWasmStore({
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })
    setConnected(device)
    setRoleSnapshot(device, 'DISABLED')

    await device.setCaptureEnabled(OnOffState.ON)
    await (
      device as unknown as { refreshRoleFromDevice: () => Promise<void> }
    ).refreshRoleFromDevice()

    const rows = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 30_000n,
      sortOrder: 'asc',
    })
    const roleEvent = rows.find((row) => row.entryKind === 'event' && row.eventType === 'cc_role_changed')

    expect(roleEvent).toBeUndefined()
  })

  it('derives microsecond wall-clock anchors from clock-sync samples', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SYST:TIME?', ['1000'])

    const device = new DRPDDevice(transport)
    const originalTimeOrigin = performance.timeOrigin
    Object.defineProperty(performance, 'timeOrigin', {
      configurable: true,
      value: 1_700_000_000_000,
    })
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 1)
      .mockImplementationOnce(() => 10)
      .mockImplementationOnce(() => 13)
      .mockImplementationOnce(() => 20)
      .mockImplementationOnce(() => 24)
      .mockImplementationOnce(() => 30)
      .mockImplementationOnce(() => 35)
      .mockImplementationOnce(() => 40)
      .mockImplementationOnce(() => 46)

    try {
      await (device as unknown as { synchronizeClock(source: 'connect' | 'periodic'): Promise<void> })
        .synchronizeClock('connect')
    } finally {
      nowSpy.mockRestore()
      Object.defineProperty(performance, 'timeOrigin', {
        configurable: true,
        value: originalTimeOrigin,
      })
    }

    const diagnostics = device.getLoggingDiagnostics()
    expect(diagnostics.clockSyncActive).toBe(true)
    expect(diagnostics.clockSync?.source).toBe('connect')
    expect(diagnostics.clockSync?.roundTripUs).toBe(1000n)
    expect(diagnostics.clockSync?.hostWallClockUs).toBe(1_700_000_000_000_500n)
    expect(
      (
        device as unknown as {
          resolveWallClockUs(timestampUs: bigint): bigint | null
        }
      ).resolveWallClockUs(1_025n),
    ).toBe(1_700_000_000_000_525n)
  })

  it('does not log VBUS OVP events from status refresh timestamps', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('BUS:VBUS:STAT?', ['OVP', '12000', 'NONE'])
    transport.textResponses.set('BUS:VBUS:OVPT?', ['21'])
    transport.textResponses.set('BUS:VBUS:OCPT?', ['3.5'])

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
    await (
      device as unknown as { refreshVBusFromDevice: () => Promise<void> }
    ).refreshVBusFromDevice()
    await (
      device as unknown as { refreshVBusFromDevice: () => Promise<void> }
    ).refreshVBusFromDevice()

    const rows = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 20_000n,
      sortOrder: 'asc',
    })

    const ovpEvents = rows.filter((row) => row.entryKind === 'event' && row.eventType === 'vbus_ovp')
    expect(ovpEvents).toHaveLength(0)
  })

  it('does not backfill stale VBUS event timestamps when logging starts after connect', async () => {
    const transport = new MockTransport()
    transport.textResponses.set('SYST:TIME?', ['1000'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    transport.textResponses.set('BUS:CC:ROLE?', ['SINK'])
    transport.textResponses.set('SINK:EPR:EN?', ['OFF'])
    transport.textResponses.set('SINK:PPS:STATUS:EN?', ['OFF'])
    transport.textResponses.set('BUS:CC:ROLE:STAT?', ['ATTACHED'])
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
      '2500',
      '12',
      '34',
    ])
    transport.textResponses.set('BUS:VBUS:STAT?', ['OVP', '9000', 'NONE'])
    transport.textResponses.set('BUS:VBUS:OVPT?', ['21'])
    transport.textResponses.set('BUS:VBUS:OCPT?', ['3.5'])
    transport.textResponses.set('BUS:CC:CAP:EN?', ['OFF'])
    transport.textResponses.set('TRIG:STAT?', ['IDLE'])
    transport.textResponses.set('TRIG:EV:TYPE?', ['OFF'])
    transport.textResponses.set('TRIG:EV:THRESH?', ['1'])
    transport.textResponses.set('TRIG:EV:AUTOREPEAT?', ['OFF'])
    transport.textResponses.set('TRIG:EV:COUNT?', ['0'])
    transport.textResponses.set('TRIG:SYNC:MODE?', ['PULSE_HIGH'])
    transport.textResponses.set('TRIG:SYNC:PULSEWIDTH?', ['1'])
    transport.textResponses.set('SINK:STATUS?', ['PE_SNK_READY'])
    transport.textResponses.set('SINK:STATUS:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('SINK:STATUS:VOLTAGE?', ['5'])
    transport.textResponses.set('SINK:STATUS:CURRENT?', ['2'])
    transport.textResponses.set('SINK:STATUS:ERROR?', ['0'])
    transport.textResponses.set('SINK:PDO:COUNT?', ['1'])
    transport.textResponses.set('SINK:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('STAT:DEV?', ['0'])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['0'])

    const store = new SQLiteWasmStore({
      maxAnalogSamples: 100,
      maxCapturedMessages: 100,
      retentionTrimBatchSize: 10,
    })
    const device = new DRPDDevice(transport, {
      createLogStore: () => store,
    })

    await device.handleConnect()
    await device.setCaptureEnabled(OnOffState.ON)

    const rows = await device.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 20_000n,
      sortOrder: 'asc',
    })

    expect(rows.filter((row) => row.entryKind === 'event' && row.eventType === 'vbus_ovp')).toHaveLength(0)
  })
})
