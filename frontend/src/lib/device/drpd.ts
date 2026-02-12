/**
 * @file drpd.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD device definition and exports.
 */

import { Device } from './base'
import USBTMCTransport from '../transport/usbtmc'
import { parseDeviceIdentity } from './drpd/parsers'
import { DRPDDevice } from './drpd/device'
import type { DRPDTransport } from './drpd/transport'
import { buildDefaultLoggingConfig, normalizeLoggingConfig } from './drpd/logging'
import type { DRPDDeviceConfig, DRPDLoggingConfig } from './drpd/types'

/**
 * DRPD device definition.
 */
export class DRPDDeviceDefinition extends Device {
  /**
   * Optional post-connect verification to confirm compatibility.
   */
  public static verifyConnectedDevice = async (device: USBDevice): Promise<boolean> => {
    const transport = new USBTMCTransport(device)
    try {
      await transport.open()
      const response = await transport.queryText('*IDN?')
      const identity = parseDeviceIdentity(response)
      return identity.manufacturer === 'MTA Inc.' && identity.model === 'Dr. PD'
    } catch {
      return false
    } finally {
      try {
        await transport.close()
      } catch {
        // Ignore close errors in verification.
      }
    }
  }

  /**
   * Create a DRPD device definition.
   */
  public constructor() {
    super({
      identifier: 'com.mta.drpd',
      displayName: 'Dr. PD',
      usbSearch: [
        { vendorId: 0x2e8a, productId: 0x000a, note: 'Dr.PD VID/PID' },
        {
          vendorId: 0x2e8a,
          classCode: 0xfe,
          subclassCode: 0x03,
          protocolCode: 0x01,
          note: 'USBTMC interface',
        },
      ],
    })
  }

  /**
   * Create a DRPD driver bound to the provided transport.
   *
   * @param transport - Transport instance.
   * @returns DRPD device driver.
   */
  public createDriver(transport: DRPDTransport): DRPDDevice {
    this.driver = new DRPDDevice(transport)
    this.driver.setDebugLoggingEnabled(false)
    const config = this.getStoredConfig()
    const loggingConfig = this.extractLoggingConfig(config)
    void this.driver.configureLogging(loggingConfig)
    return this.driver
  }

  /**
   * Record a device connection and emit the connect event.
   *
   * @param device - Connected WebUSB device.
   */
  public override async connectDevice(device: USBDevice): Promise<void> {
    await super.connectDevice(device)
    this.driver?.handleConnect()
  }

  /**
   * Record a device disconnection and emit the disconnect event.
   */
  public override disconnectDevice(): void {
    this.driver?.handleDisconnect()
    super.disconnectDevice()
  }

  /**
   * Load configuration into the device.
   *
   * @param config - Configuration payload.
   */
  public async loadConfig(config: unknown): Promise<void> {
    const logging = this.extractLoggingConfig(config)
    const stored: DRPDDeviceConfig = { logging }
    this.setStoredConfig(stored)
    if (this.driver) {
      await this.driver.configureLogging(logging)
    }
  }

  /**
   * Save configuration from the device.
   *
   * @returns Serialized configuration payload.
   */
  public async saveConfig(): Promise<unknown> {
    return this.getStoredConfig() ?? { logging: buildDefaultLoggingConfig() }
  }

  /**
   * Extract and normalize logging config from arbitrary payload.
   *
   * @param config - Serialized config payload.
   * @returns Normalized logging config.
   */
  protected extractLoggingConfig(config: unknown): DRPDLoggingConfig {
    if (!config || typeof config !== 'object') {
      return buildDefaultLoggingConfig()
    }
    const value = config as { logging?: Partial<DRPDLoggingConfig> }
    return normalizeLoggingConfig(value.logging)
  }

  protected driver?: DRPDDevice ///< Cached driver instance.
}

export * from './drpd/index'
