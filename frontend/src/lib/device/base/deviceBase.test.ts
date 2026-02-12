import { describe, expect, it, vi } from 'vitest'
import { Device } from './types'

class TestDevice extends Device {
  public readonly loadCalls: unknown[] = []
  public readonly saveCalls: number[] = []

  public constructor() {
    super({
      identifier: 'com.acme.testdevice',
      displayName: 'Test Device',
      usbSearch: [{ vendorId: 1 }],
    })
  }

  public async loadConfig(config: unknown): Promise<void> {
    this.loadCalls.push(config)
    this.setStoredConfig(config)
  }

  public async saveConfig(): Promise<unknown> {
    this.saveCalls.push(1)
    const config = { saved: true }
    this.setStoredConfig(config)
    return config
  }
}

describe('Device base class', () => {
  it('emits connect/disconnect events and reapplies stored config', async () => {
    const device = new TestDevice()
    const usbDevice = { vendorId: 1 } as USBDevice
    const onConnect = vi.fn()
    const onDisconnect = vi.fn()

    device.addEventListener(Device.CONNECT_EVENT, onConnect)
    device.addEventListener(Device.DISCONNECT_EVENT, onDisconnect)

    device.setStoredConfig({ foo: 'bar' })
    await device.connectDevice(usbDevice)
    device.disconnectDevice()

    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect(device.loadCalls).toEqual([{ foo: 'bar' }])
  })

  it('stores config when saveConfig is called by subclasses', async () => {
    const device = new TestDevice()
    const config = await device.saveConfig()

    expect(config).toEqual({ saved: true })
    expect(device.getStoredConfig()).toEqual({ saved: true })
  })
})
