import { describe, expect, it, vi } from 'vitest'
import { DebugLogRegistry } from '../../../debugLogger'
import { DRPDDevice } from '../device'
import type { DRPDTransport } from '../transport'

class TestTransport extends EventTarget implements DRPDTransport {
  public readonly kind = 'winusb' as const
  async sendCommand(): Promise<void> {}
  async queryText(): Promise<string[]> {
    return []
  }
  async queryBinary(): Promise<Uint8Array> {
    return new Uint8Array()
  }
}

class TestDevice extends DRPDDevice {
  public emitDebug(message: string): void {
    this.logDebug(message)
  }
}

describe('DRPDDevice debug logging', () => {
  it('uses the shared debug log registry', () => {
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const debugLogs = new DebugLogRegistry()
    const device = new TestDevice(new TestTransport(), { debugLogRegistry: debugLogs })

    device.emitDebug('before')
    debugLogs.setScopeEnabled('drpd.device', true)
    device.emitDebug('after')

    expect(consoleDebug).toHaveBeenCalledTimes(1)
    expect(consoleDebug).toHaveBeenCalledWith('[drpd.device] after')
  })
})
