/**
 * @file drpd.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD device definition and exports.
 */

import { Device } from './base'
import { DebugLogRegistry } from '../debugLogger'
import { openPreferredDRPDTransport } from '../transport/drpdUsb'
import { DRPDDevice } from './drpd/device'
import type { DRPDTransport } from './drpd/transport'
import { buildDefaultLoggingConfig, normalizeLoggingConfig, SQLiteWasmStore } from './drpd/logging'
import type {
  CCBusRole,
  DRPDDeviceConfig,
  DRPDLoggingConfig,
  DRPDSinkRequestConfig,
  DRPDTriggerConfig,
  OnOffState,
  TriggerMessageTypeFilter,
} from './drpd/types'
import {
  CCBusRole as CCBusRoleValues,
  OnOffState as OnOffStateValues,
  TriggerEventType as TriggerEventTypeValues,
  TriggerMessageTypeFilterClass as TriggerMessageTypeFilterClassValues,
  TriggerSenderFilter as TriggerSenderFilterValues,
  TriggerSyncMode as TriggerSyncModeValues,
} from './drpd/types'
const DRPD_MANUFACTURER_NAME = 'MTA Inc.'
const DRPD_PRODUCT_NAME = 'Dr. PD'
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

const isEnumValue = <T extends string>(
  value: unknown,
  options: Record<string, T>,
): value is T => typeof value === 'string' && Object.values(options).includes(value as T)

const normalizeInteger = (value: unknown, minimum = 0): number | undefined => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    return undefined
  }
  return value
}

const normalizeMessageTypeFilters = (value: unknown): TriggerMessageTypeFilter[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }
    const filter = entry as Partial<TriggerMessageTypeFilter>
    if (
      !isEnumValue(filter.class, TriggerMessageTypeFilterClassValues) ||
      typeof filter.messageTypeNumber !== 'number' ||
      !Number.isInteger(filter.messageTypeNumber) ||
      filter.messageTypeNumber < 0
    ) {
      return []
    }
    return [{
      class: filter.class,
      messageTypeNumber: filter.messageTypeNumber,
    }]
  })
}

const normalizeRole = (value: unknown): CCBusRole | undefined =>
  isEnumValue(value, CCBusRoleValues) ? value : undefined

const normalizeCaptureEnabled = (value: unknown): OnOffState | undefined =>
  isEnumValue(value, OnOffStateValues) ? value : undefined

const normalizeSinkRequestConfig = (value: unknown): DRPDSinkRequestConfig | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const probe = value as Partial<DRPDSinkRequestConfig>
  const index = normalizeInteger(probe.index, 0)
  const voltageMv = normalizeInteger(probe.voltageMv, 0)
  const currentMa = normalizeInteger(probe.currentMa, 0)
  if (index == null || voltageMv == null || currentMa == null) {
    return undefined
  }
  return { index, voltageMv, currentMa }
}

const normalizeTriggerConfig = (value: unknown): DRPDTriggerConfig | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const probe = value as Partial<DRPDTriggerConfig>
  const eventThreshold = normalizeInteger(probe.eventThreshold, 1)
  const syncPulseWidthUs = normalizeInteger(probe.syncPulseWidthUs, 1)
  if (
    !isEnumValue(probe.type, TriggerEventTypeValues) ||
    !isEnumValue(probe.senderFilter, TriggerSenderFilterValues) ||
    !isEnumValue(probe.autorepeat, OnOffStateValues) ||
    !isEnumValue(probe.syncMode, TriggerSyncModeValues) ||
    eventThreshold == null ||
    syncPulseWidthUs == null
  ) {
    return undefined
  }
  return {
    type: probe.type,
    eventThreshold,
    senderFilter: probe.senderFilter,
    autorepeat: probe.autorepeat,
    syncMode: probe.syncMode,
    syncPulseWidthUs,
    messageTypeFilters: normalizeMessageTypeFilters(probe.messageTypeFilters),
  }
}

export const normalizeDRPDDeviceConfig = (config: unknown): DRPDDeviceConfig => {
  const logging = extractLoggingConfig(config)
  if (!config || typeof config !== 'object') {
    return { logging }
  }
  const value = config as {
    role?: unknown
    captureEnabled?: unknown
    sinkRequest?: unknown
    trigger?: unknown
  }
  const role = normalizeRole(value.role)
  const captureEnabled = normalizeCaptureEnabled(value.captureEnabled)
  const sinkRequest = normalizeSinkRequestConfig(value.sinkRequest)
  const trigger = normalizeTriggerConfig(value.trigger)
  return {
    logging,
    ...(role ? { role } : {}),
    ...(captureEnabled ? { captureEnabled } : {}),
    ...(sinkRequest ? { sinkRequest } : {}),
    ...(trigger ? { trigger } : {}),
  }
}

const extractLoggingConfig = (config: unknown): DRPDLoggingConfig => {
  if (!config || typeof config !== 'object') {
    return buildDefaultLoggingConfig()
  }
  const value = config as { logging?: Partial<DRPDLoggingConfig> }
  const normalized = normalizeLoggingConfig(value.logging)
  if (value.logging?.maxCapturedMessages === LEGACY_CAPTURE_LIMIT) {
    return {
      ...normalized,
      maxCapturedMessages: buildDefaultLoggingConfig().maxCapturedMessages,
    }
  }
  return normalized
}

/**
 * DRPD device definition.
 */
export class DRPDDeviceDefinition extends Device {
  /**
   * Optional post-connect verification to confirm compatibility.
   */
  public static verifyConnectedDevice = async (device: USBDevice): Promise<boolean> => {
    return (
      (device.manufacturerName ?? '').trim() === DRPD_MANUFACTURER_NAME &&
      (device.productName ?? '').trim() === DRPD_PRODUCT_NAME
    )
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
          classCode: 0xff,
          subclassCode: 0x01,
          protocolCode: 0x02,
          note: 'WinUSB transport interface',
        },
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
    const loggingConfig = extractLoggingConfig(config)
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
      const loggingConfig = extractLoggingConfig(config)
      await driver.configureLogging(loggingConfig)
      this.driver = driver
      return { driver, transport: driver, debugLogs }
    }

    // Capability fallback for test/non-browser environments without Worker.
    const debugLogs = new DebugLogRegistry()
    const transport = await openPreferredDRPDTransport(device, { debugLogRegistry: debugLogs })
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
    const stored = normalizeDRPDDeviceConfig(config)
    this.setStoredConfig(stored)
    if (this.driver) {
      await this.driver.configureLogging(stored.logging)
    }
  }

  /**
   * Save configuration from the device.
   *
   * @returns Serialized configuration payload.
   */
  public async saveConfig(): Promise<unknown> {
    return this.getStoredConfig() ?? normalizeDRPDDeviceConfig(undefined)
  }

  protected driver?: DRPDDriverRuntime ///< Cached driver instance.
}

export * from './drpd/index'
