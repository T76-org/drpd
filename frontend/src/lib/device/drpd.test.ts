import { describe, expect, it, vi } from 'vitest'
import { Device } from './base'

const mockState = vi.hoisted(() => ({ nextResponse: [] as string[] }))

vi.mock('../transport/usbtmc', () => {
  /**
   * Mock USBTMC transport for device definition tests.
   */
  class MockUSBTMCTransport {
    ///< Track open/close state for verification.
    public opened = false

    /**
     * Create the mock transport.
     *
     * @param device - USB device instance.
     */
    public constructor(device: USBDevice) {
      void device
    }

    /**
     * Open the mock transport.
     */
    public async open(): Promise<void> {
      this.opened = true
    }

    /**
     * Close the mock transport.
     */
    public async close(): Promise<void> {
      this.opened = false
    }

    /**
     * Return the next response for a SCPI query.
     *
     * @param command - SCPI command string.
     * @returns Mock response list.
     */
    public async queryText(command: string): Promise<string[]> {
      void command
      return mockState.nextResponse
    }
  }

  return { default: MockUSBTMCTransport }
})

import { CCBusRole, OnOffState, TriggerEventType, TriggerSenderFilter, TriggerSyncMode, DRPDDeviceDefinition } from './drpd'
import { buildDefaultLoggingConfig } from './drpd/logging'

/**
 * Build a mock USB device for tests.
 *
 * @returns Mock USB device.
 */
const createUsbDevice = () => ({
  productId: 0x000a,
  vendorId: 0x2e8a,
}) as USBDevice

describe('DRPDDeviceDefinition', () => {
  it('exposes USB search filters', () => {
    const device = new DRPDDeviceDefinition()
    expect(device.usbSearch[0]).toMatchObject({ vendorId: 0x2e8a, productId: 0x000a })
  })

  it('stores configuration on load/save', async () => {
    const device = new DRPDDeviceDefinition()
    await device.loadConfig({
      logging: { enabled: true, maxAnalogSamples: 25 },
      role: CCBusRole.SINK,
      captureEnabled: OnOffState.ON,
      sinkRequest: {
        index: 1,
        voltageMv: 9000,
        currentMa: 2000,
      },
      trigger: {
        type: TriggerEventType.CRC_ERROR,
        eventThreshold: 3,
        senderFilter: TriggerSenderFilter.CABLE,
        autorepeat: OnOffState.OFF,
        syncMode: TriggerSyncMode.PULSE_HIGH,
        syncPulseWidthUs: 10,
        messageTypeFilters: [],
      },
    })
    const saved = await device.saveConfig()
    expect(saved).toEqual({
      logging: {
        ...buildDefaultLoggingConfig(),
        enabled: true,
        maxAnalogSamples: 25,
      },
      role: CCBusRole.SINK,
      captureEnabled: OnOffState.ON,
      sinkRequest: {
        index: 1,
        voltageMv: 9000,
        currentMa: 2000,
      },
      trigger: {
        type: TriggerEventType.CRC_ERROR,
        eventThreshold: 3,
        senderFilter: TriggerSenderFilter.CABLE,
        autorepeat: OnOffState.OFF,
        syncMode: TriggerSyncMode.PULSE_HIGH,
        syncPulseWidthUs: 10,
        messageTypeFilters: [],
      },
    })
  })

  it('migrates legacy maxCapturedMessages=50 to the modern default cap', async () => {
    const device = new DRPDDeviceDefinition()
    await device.loadConfig({
      logging: {
        enabled: true,
        maxCapturedMessages: 50,
      },
    })
    const saved = await device.saveConfig()
    expect(saved).toEqual({
      logging: {
        ...buildDefaultLoggingConfig(),
        enabled: true,
      },
    })
  })

  it('normalizes invalid clock-sync config values to defaults', async () => {
    const device = new DRPDDeviceDefinition()
    await device.loadConfig({
      logging: {
        clockSyncEnabled: false,
        clockSyncResyncIntervalMs: -1,
      },
    })
    const saved = await device.saveConfig()
    expect(saved).toEqual({
      logging: {
        ...buildDefaultLoggingConfig(),
        clockSyncEnabled: false,
      },
    })
  })

  it('normalizes invalid message fallback polling interval to the default', async () => {
    const device = new DRPDDeviceDefinition()
    await device.loadConfig({
      logging: {
        messagePollFallbackIntervalMs: 0,
      },
    })
    const saved = await device.saveConfig()
    expect(saved).toEqual({
      logging: buildDefaultLoggingConfig(),
    })
  })

  it('emits connect and disconnect events', async () => {
    const device = new DRPDDeviceDefinition()
    const usbDevice = createUsbDevice()
    const connectSpy = vi.fn()
    const disconnectSpy = vi.fn()

    device.addEventListener(Device.CONNECT_EVENT, connectSpy)
    device.addEventListener(Device.DISCONNECT_EVENT, disconnectSpy)

    await device.connectDevice(usbDevice)
    device.disconnectDevice()

    expect(connectSpy).toHaveBeenCalledTimes(1)
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })

  it('verifies connected device via *IDN?', async () => {
    mockState.nextResponse = ['MTA Inc.,Dr. PD,ABC,1.0']
    const usbDevice = createUsbDevice()
    const verified = await DRPDDeviceDefinition.verifyConnectedDevice(usbDevice)
    expect(verified).toBe(true)
  })
})
