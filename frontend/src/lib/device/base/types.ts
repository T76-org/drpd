/**
 * @file types.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Device type definitions and identifier validation helpers.
 */

/**
 * Reverse-domain identifier for a device (for example, com.vendor.model).
 */
export type DeviceIdentifier = string

/**
 * USB search criteria used to identify compatible devices.
 */
export interface DeviceUSBSearch {
  ///< USB vendor ID.
  vendorId?: number
  ///< USB product ID.
  productId?: number
  ///< USB interface class code.
  classCode?: number
  ///< USB interface subclass code.
  subclassCode?: number
  ///< USB interface protocol code.
  protocolCode?: number
  ///< USB serial number to match.
  serialNumber?: string
  ///< Optional note for display/debugging.
  note?: string
}

/**
 * Initialization data for a Device base class.
 */
export interface DeviceInit {
  ///< Reverse-domain identifier for the device.
  identifier: DeviceIdentifier
  ///< Human-readable device name.
  displayName: string
  ///< One or more USB search entries used for matching and filters.
  usbSearch: DeviceUSBSearch[]
}

/**
 * Validate that a string is a reverse-domain identifier like com.vendor.model.
 *
 * @param value - Candidate identifier value.
 * @returns True when the value is a valid identifier.
 */
export const isDeviceIdentifier = (value: string): value is DeviceIdentifier => {
  const trimmed = value.trim()
  if (trimmed !== value) {
    return false
  }

  const pattern =
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
  return pattern.test(value)
}

/**
 * Base class for device drivers.
 *
 * Developers extend this class and keep device-specific behavior in the same file.
 */
export abstract class Device extends EventTarget {
  public static readonly CONNECT_EVENT = 'deviceconnect' ///< Device connect event name.
  public static readonly DISCONNECT_EVENT = 'devicedisconnect' ///< Device disconnect event name.

  public readonly identifier: DeviceIdentifier ///< Reverse-domain identifier.
  public readonly displayName: string ///< Human-readable device name.
  public readonly usbSearch: DeviceUSBSearch[] ///< USB search entries.
  protected connectedDevice?: USBDevice ///< Currently connected USB device, if any.
  protected storedConfig?: unknown ///< Last known config for reapply on connect.

  /**
   * Create a Device with the minimal fields required for matching and filtering.
   *
   * @param init - Device initialization data.
   */
  protected constructor(init: DeviceInit) {
    super()
    if (!isDeviceIdentifier(init.identifier)) {
      throw new Error(`Invalid device identifier: ${init.identifier}`)
    }
    this.identifier = init.identifier
    this.displayName = init.displayName
    this.usbSearch = init.usbSearch
  }

  /**
   * Load configuration into the device.
   *
   * @param config - Configuration payload to apply.
   */
  public abstract loadConfig(config: unknown): Promise<void> | void

  /**
   * Save configuration from the device.
   *
   * @returns Serialized configuration payload.
   */
  public abstract saveConfig(): Promise<unknown> | unknown

  /**
   * Store configuration for automatic reapply on reconnect.
   *
   * @param config - Configuration payload to remember.
   */
  public setStoredConfig(config: unknown): void {
    this.storedConfig = config
  }

  /**
   * Access the last stored configuration, if any.
   *
   * @returns Stored configuration or undefined.
   */
  public getStoredConfig(): unknown | undefined {
    return this.storedConfig
  }

  /**
   * Record a device connection and emit the connect event.
   *
   * @param device - Connected WebUSB device.
   */
  public async connectDevice(device: USBDevice): Promise<void> {
    this.connectedDevice = device
    this.dispatchEvent(new CustomEvent(Device.CONNECT_EVENT, { detail: device }))
    if (this.storedConfig !== undefined) {
      await this.loadConfig(this.storedConfig)
    }
  }

  /**
   * Record a device disconnection and emit the disconnect event.
   */
  public disconnectDevice(): void {
    this.connectedDevice = undefined
    this.dispatchEvent(new CustomEvent(Device.DISCONNECT_EVENT))
  }
}

/**
 * Constructor contract for Device subclasses with optional verification hook.
 */
export interface DeviceConstructor {
  new (): Device
  /**
   * Optional post-connect verification to confirm compatibility.
   *
   * @param device - Connected WebUSB device instance.
   * @returns True when the device is compatible.
   */
  verifyConnectedDevice?: (device: USBDevice) => Promise<boolean> | boolean
}
