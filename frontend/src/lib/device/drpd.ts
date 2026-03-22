/**
 * @file drpd.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD device definition and exports.
 */

import { Device } from './base'
import { DebugLogRegistry } from '../debugLogger'
import USBTMCTransport from '../transport/usbtmc'
import { parseDeviceIdentity } from './drpd/parsers'
import { DRPDDevice } from './drpd/device'
import type { DRPDTransport } from './drpd/transport'
import { buildDefaultLoggingConfig, normalizeLoggingConfig, SQLiteWasmStore } from './drpd/logging'
import type { DRPDDeviceConfig, DRPDLoggingConfig } from './drpd/types'
import {
  DRPDWorkerDeviceProxy,
  DRPDWorkerLogStoreProxy,
} from './drpd/worker'

/**
 * DRPD driver runtime exposed to the frontend.
 */
export type DRPDDriverRuntime = DRPDDevice | DRPDWorkerDeviceProxy

/**
 * Connected DRPD runtime resources returned by the definition factory.
 */
export interface DRPDConnectedRuntime {
  driver: DRPDDriverRuntime ///< DRPD driver runtime instance.
  transport: { close(): Promise<void> } ///< Closable transport/runtime resource.
  debugLogs: DebugLogRegistry ///< Shared debug logging controller for this runtime.
}

const LEGACY_CAPTURE_LIMIT = 50

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
    this.driver = new DRPDDevice(transport, {
      createLogStore: (config) =>
        typeof Worker !== 'undefined'
          ? new DRPDWorkerLogStoreProxy(config)
          : new SQLiteWasmStore(config),
    })
    const config = this.getStoredConfig()
    const loggingConfig = this.extractLoggingConfig(config)
    void this.driver.configureLogging(loggingConfig)
    return this.driver
  }

  /**
   * Create a DRPD driver runtime for a selected USB device.
   *
   * @param device - Selected WebUSB device.
   * @returns DRPD driver runtime.
   */
  public async createConnectedRuntime(device: USBDevice): Promise<DRPDConnectedRuntime> {
    if (typeof Worker !== 'undefined') {
      const debugLogs = new DebugLogRegistry()
      const driver = await DRPDWorkerDeviceProxy.create(device, debugLogs)
      const config = this.getStoredConfig()
      const loggingConfig = this.extractLoggingConfig(config)
      await driver.configureLogging(loggingConfig)
      this.driver = driver
      return { driver, transport: driver, debugLogs }
    }

    // Capability fallback for test/non-browser environments without Worker.
    const debugLogs = new DebugLogRegistry()
    const transport = new USBTMCTransport(device, { debugLogRegistry: debugLogs })
    await transport.open()
    const driver = this.createDriver(transport)
    return { driver, transport, debugLogs }
  }

  /**
   * Record a device connection and emit the connect event.
   *
   * @param device - Connected WebUSB device.
   */
  public override async connectDevice(device: USBDevice): Promise<void> {
    await super.connectDevice(device)
    await this.driver?.handleConnect()
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
    const normalized = normalizeLoggingConfig(value.logging)
    // Migrate legacy persisted cap (50 rows) that causes early rollover and
    // makes the USB-PD table appear to stop updating after a short period.
    if (value.logging?.maxCapturedMessages === LEGACY_CAPTURE_LIMIT) {
      return {
        ...normalized,
        maxCapturedMessages: buildDefaultLoggingConfig().maxCapturedMessages,
      }
    }
    return normalized
  }

  protected driver?: DRPDDriverRuntime ///< Cached driver instance.
}

export * from './drpd/index'
