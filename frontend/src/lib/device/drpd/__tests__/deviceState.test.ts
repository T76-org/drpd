import { afterEach, describe, expect, it, vi } from 'vitest'
import USBTMCTransport from '../../../transport/usbtmc'
import { DRPDDevice } from '../device'
import type { DRPDSCPIParam, DRPDTransport } from '../transport'
import { CCBusRole } from '../types'

class MockInterruptTransport extends EventTarget implements DRPDTransport {
  public textResponses = new Map<string, string[]>()

  public async sendCommand(_command: string, ..._params: DRPDSCPIParam[]): Promise<void> {}

  public async queryText(command: string, ..._params: DRPDSCPIParam[]): Promise<string[]> {
    const response = this.textResponses.get(command)
    if (!response) {
      throw new Error(`Missing response for ${command}`)
    }
    return response
  }

  public async queryBinary(_command: string, ..._params: DRPDSCPIParam[]): Promise<Uint8Array> {
    return new Uint8Array()
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

    expect(errors.length).toBe(1)
    expect(device.getState().role).toBeNull()
  })
})
