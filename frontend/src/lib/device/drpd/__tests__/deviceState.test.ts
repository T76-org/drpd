import { afterEach, describe, expect, it, vi } from 'vitest'
import USBTMCTransport from '../../../transport/usbtmc'
import { DRPDDevice } from '../device'
import type { DRPDSCPIParam, DRPDTransport } from '../transport'
import {
  CCBusRole,
  CCBusRoleStatus,
  OnOffState,
  SinkState,
  TriggerEventType,
  TriggerStatus,
  TriggerSyncMode,
  VBusStatus,
} from '../types'

class MockInterruptTransport extends EventTarget implements DRPDTransport {
  public readonly kind = 'winusb' as const
  public textResponses = new Map<string, string[]>()
  public textResponseFactories = new Map<string, () => string[]>()
  public binaryResponses = new Map<string, Uint8Array[]>()
  public callCounts = new Map<string, number>()

  public async sendCommand(command: string, ...params: DRPDSCPIParam[]): Promise<void> {
    void command
    void params
  }

  public async queryText(command: string, ...params: DRPDSCPIParam[]): Promise<string[]> {
    void params
    this.callCounts.set(command, (this.callCounts.get(command) ?? 0) + 1)
    const factory = this.textResponseFactories.get(command)
    if (factory) {
      return factory()
    }
    const response = this.textResponses.get(command)
    if (!response) {
      throw new Error(`Missing response for ${command}`)
    }
    return response
  }

  public async queryBinary(command: string, ...params: DRPDSCPIParam[]): Promise<Uint8Array> {
    void params
    this.callCounts.set(command, (this.callCounts.get(command) ?? 0) + 1)
    const responses = this.binaryResponses.get(command)
    if (!responses || responses.length === 0) {
      return new Uint8Array()
    }
    return responses.shift() as Uint8Array
  }

  public emitInterrupt(): void {
    this.dispatchEvent(new CustomEvent(USBTMCTransport.INTERRUPT_EVENT, { detail: new Uint8Array() }))
  }
}

/**
 * Await the next macrotask tick.
 *
 * @returns Promise resolved on the next tick.
 */
const tick = async (): Promise<void> => await new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Restore real timers after each test.
 */
const restoreTimers = (): void => {
  vi.useRealTimers()
  vi.clearAllTimers()
}

/**
 * Force the device into a connected state for polling.
 *
 * @param device - Device instance to update.
 */
const setDeviceConnected = (device: DRPDDevice): void => {
  ;(device as unknown as { isConnected: boolean }).isConnected = true
}

const buildCapturePayload = (): Uint8Array => {
  const buffer = new Uint8Array(8 + 8 + 4 + 4 + 4 + 3 * 2 + 4 + 6)
  const view = new DataView(buffer.buffer)
  view.setBigUint64(0, 5_000n, true)
  view.setBigUint64(8, 6_000n, true)
  view.setUint32(16, 0, true)
  buffer.set([0x18, 0x18, 0x18, 0x11], 20)
  view.setUint32(24, 3, true)
  view.setUint16(28, 0x100, true)
  view.setUint16(30, 0x101, true)
  view.setUint16(32, 0x102, true)
  view.setUint32(34, 6, true)
  buffer.set([0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d], 38)
  return buffer
}

describe('DRPDDevice state updates', () => {
  afterEach(restoreTimers)

  it('polls analog monitor and updates state when values change', async () => {
    vi.useFakeTimers()
    const transport = new MockInterruptTransport()
    transport.textResponses.set('MEAS:ALL?', [
      '1000',
      '5.0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '1.2',
      '0.0',
      '0.6',
      '2500',
      '12',
      '34',
    ])
    const device = new DRPDDevice(transport)
    setDeviceConnected(device)
    const updates: number[] = []
    device.addEventListener(DRPDDevice.ANALOG_MONITOR_CHANGED_EVENT, () => updates.push(1))

    device.startAnalogMonitorPolling(100)
    await vi.advanceTimersByTimeAsync(100)
    expect(device.getState().analogMonitor?.vbus).toBe(5.0)
    expect(updates.length).toBe(1)

    transport.textResponses.set('MEAS:ALL?', [
      '1200',
      '5.1',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '1.2',
      '0.0',
      '0.6',
      '2700',
      '13',
      '35',
    ])
    await vi.advanceTimersByTimeAsync(100)
    expect(device.getState().analogMonitor?.vbus).toBe(5.1)
    expect(updates.length).toBe(2)

    device.stopAnalogMonitorPolling()
  })

  it('updates role when interrupt indicates role change', async () => {
    const transport = new MockInterruptTransport()
    transport.textResponses.set('STAT:DEV?', ['2'])
    transport.textResponses.set('BUS:CC:ROLE?', ['SINK'])

    const device = new DRPDDevice(transport)
    const roleChanges: CCBusRole[] = []
    const stateUpdates: string[][] = []

    device.addEventListener(DRPDDevice.ROLE_CHANGED_EVENT, (event) => {
      const detail = (event as CustomEvent<{ role: CCBusRole }>).detail
      roleChanges.push(detail.role)
    })
    device.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, (event) => {
      const detail = (event as CustomEvent<{ changed: string[] }>).detail
      stateUpdates.push(detail.changed)
    })

    transport.emitInterrupt()
    await tick()
    await tick()

    expect(device.getState().role).toBe(CCBusRole.SINK)
    expect(roleChanges).toEqual([CCBusRole.SINK])
    expect(stateUpdates).toEqual([['role']])
  })

  it('emits error event when role fetch fails', async () => {
    const transport = new MockInterruptTransport()
    transport.textResponses.set('STAT:DEV?', ['2'])

    const device = new DRPDDevice(transport)
    const errors: unknown[] = []

    device.addEventListener(DRPDDevice.STATE_ERROR_EVENT, (event) => {
      const detail = (event as CustomEvent<{ error: unknown }>).detail
      errors.push(detail.error)
    })

    transport.emitInterrupt()
    await tick()
    await tick()

    expect(errors.length).toBe(1)
    expect(device.getState().role).toBeNull()
  })

  it('uses status polling as the message fallback path so polling clears the message flag', async () => {
    const transport = new MockInterruptTransport()
    transport.textResponses.set('STAT:DEV?', ['128'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    let captureCountCalls = 0
    transport.textResponseFactories.set('BUS:CC:CAP:COUNT?', () => {
      captureCountCalls += 1
      return [captureCountCalls === 1 ? '1' : '0']
    })
    transport.binaryResponses.set('BUS:CC:CAP:DATA?', [buildCapturePayload()])

    const device = new DRPDDevice(transport)
    setDeviceConnected(device)
    const messages: unknown[] = []
    device.addEventListener(DRPDDevice.MESSAGE_CAPTURED_EVENT, (event) => {
      messages.push((event as CustomEvent).detail)
    })

    await (
      device as unknown as { pollCaptureDrain: () => Promise<void> }
    ).pollCaptureDrain()

    expect(transport.callCounts.get('STAT:DEV?')).toBe(1)
    expect(transport.callCounts.get('BUS:CC:CAP:COUNT?')).toBe(2)
    expect(messages).toHaveLength(1)
  })

  it('hydrates all tracked state during handleConnect before the promise resolves', async () => {
    const transport = new MockInterruptTransport()
    transport.textResponses.set('SYST:TIME?', ['1000'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    transport.textResponses.set('BUS:CC:ROLE?', ['SINK'])
    transport.textResponses.set('BUS:CC:ROLE:STAT?', ['ATTACHED'])
    transport.textResponses.set('MEAS:ALL?', [
      '1000',
      '5.0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
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
    transport.textResponses.set('TRIG:STAT?', ['ARMED'])
    transport.textResponses.set('TRIG:EV:TYPE?', ['MESSAGE_COMPLETE'])
    transport.textResponses.set('TRIG:EV:THRESH?', ['2'])
    transport.textResponses.set('TRIG:EV:SENDER?', ['ANY'])
    transport.textResponses.set('TRIG:EV:AUTOREPEAT?', ['ON'])
    transport.textResponses.set('TRIG:EV:COUNT?', ['7'])
    transport.textResponses.set('TRIG:SYNC:MODE?', ['TOGGLE'])
    transport.textResponses.set('TRIG:SYNC:PULSEWIDTH?', ['25'])
    transport.textResponses.set('TRIG:EV:MSGTYPE:FILTER?', [''])
    transport.textResponses.set('SINK:STATUS?', ['PE_SNK_READY'])
    transport.textResponses.set('SINK:STATUS:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('SINK:STATUS:VOLTAGE?', ['5'])
    transport.textResponses.set('SINK:STATUS:CURRENT?', ['2'])
    transport.textResponses.set('SINK:STATUS:ERROR?', ['0'])
    transport.textResponses.set('SINK:PDO:COUNT?', ['1'])
    transport.textResponses.set('SINK:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('STAT:DEV?', ['0'])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['0'])

    const device = new DRPDDevice(transport, {
      createLogStore: () =>
        ({
          init: async () => undefined,
          close: async () => undefined,
        }) as never,
    })

    await device.handleConnect()

    expect(device.getState()).toMatchObject({
      role: CCBusRole.SINK,
      ccBusRoleStatus: CCBusRoleStatus.ATTACHED,
      captureEnabled: OnOffState.ON,
      vbusInfo: {
        status: VBusStatus.ENABLED,
        ovpThresholdMv: 21000,
        ocpThresholdMa: 3500,
        ovpEventTimestampUs: null,
        ocpEventTimestampUs: null,
      },
      triggerInfo: {
        status: TriggerStatus.ARMED,
        type: TriggerEventType.MESSAGE_COMPLETE,
        eventThreshold: 2,
        senderFilter: 'ANY',
        autorepeat: OnOffState.ON,
        eventCount: 7,
        syncMode: TriggerSyncMode.TOGGLE,
        syncPulseWidthUs: 25,
        messageTypeFilters: [],
      },
      sinkInfo: {
        status: SinkState.PE_SNK_READY,
        negotiatedVoltageMv: 5000,
        negotiatedCurrentMa: 2000,
        error: false,
      },
      sinkPdoList: [
        {
          type: 'FIXED',
          voltageV: 5,
          maxCurrentA: 3,
        },
      ],
    })
    expect(device.getState().analogMonitor?.vbus).toBe(5)
    expect(device.getState().analogMonitor?.ibus).toBe(0.1)
    expect(transport.callCounts.get('STAT:DEV?')).toBe(1)
    device.handleDisconnect()
  })

  it('does not block handleConnect on a stuck logging store open', async () => {
    vi.useFakeTimers()
    const transport = new MockInterruptTransport()
    transport.textResponses.set('SYST:TIME?', ['1000'])
    transport.textResponses.set('BUS:CC:CAP:CYCLETIME?', ['10'])
    transport.textResponses.set('BUS:CC:ROLE?', ['SINK'])
    transport.textResponses.set('BUS:CC:ROLE:STAT?', ['ATTACHED'])
    transport.textResponses.set('MEAS:ALL?', [
      '1000',
      '5.0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
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
    transport.textResponses.set('TRIG:STAT?', ['ARMED'])
    transport.textResponses.set('TRIG:EV:TYPE?', ['MESSAGE_COMPLETE'])
    transport.textResponses.set('TRIG:EV:THRESH?', ['2'])
    transport.textResponses.set('TRIG:EV:SENDER?', ['ANY'])
    transport.textResponses.set('TRIG:EV:AUTOREPEAT?', ['ON'])
    transport.textResponses.set('TRIG:EV:COUNT?', ['7'])
    transport.textResponses.set('TRIG:SYNC:MODE?', ['TOGGLE'])
    transport.textResponses.set('TRIG:SYNC:PULSEWIDTH?', ['25'])
    transport.textResponses.set('TRIG:EV:MSGTYPE:FILTER?', [''])
    transport.textResponses.set('SINK:STATUS?', ['PE_SNK_READY'])
    transport.textResponses.set('SINK:STATUS:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('SINK:STATUS:VOLTAGE?', ['5'])
    transport.textResponses.set('SINK:STATUS:CURRENT?', ['2'])
    transport.textResponses.set('SINK:STATUS:ERROR?', ['0'])
    transport.textResponses.set('SINK:PDO:COUNT?', ['1'])
    transport.textResponses.set('SINK:PDO?', ['FIXED,5.00,3.00'])
    transport.textResponses.set('STAT:DEV?', ['0'])
    transport.textResponses.set('BUS:CC:CAP:COUNT?', ['0'])

    const device = new DRPDDevice(transport, {
      createLogStore: () =>
        ({
          init: async () => await new Promise<void>(() => undefined),
          close: async () => undefined,
        }) as never,
    })

    const connectPromise = device.handleConnect()
    await vi.advanceTimersByTimeAsync(251)
    await connectPromise

    expect(device.getState().captureEnabled).toBe(OnOffState.ON)
    expect(device.getState().role).toBe(CCBusRole.SINK)
    expect(transport.callCounts.get('STAT:DEV?')).toBe(1)
    device.handleDisconnect()
  })
})
