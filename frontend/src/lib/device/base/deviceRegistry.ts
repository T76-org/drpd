/**
 * @file deviceRegistry.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Helpers for matching USB devices to device definitions and building WebUSB filters.
 */

import type { Device, DeviceConstructor, DeviceUSBSearch } from './types'

/**
 * Build a stable, de-duplicated WebUSB filter list from Devices.
 *
 * @param definitions - Device definitions to convert into filters.
 * @returns List of WebUSB device filters.
 */
export const buildUSBFilters = (devices: Device[]): USBDeviceFilter[] => {
  const filters: USBDeviceFilter[] = []
  const seen = new Set<string>()

  for (const device of devices) {
    for (const search of device.usbSearch) {
      const filter = toUSBFilter(search)
      if (filter == null) {
        continue
      }
      const key = buildFilterKey(filter)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      filters.push(filter)
    }
  }

  return filters
}

/**
 * Match a selected USBDevice to the first compatible Device.
 *
 * @param definitions - Device definitions to check.
 * @param device - Selected WebUSB device.
 * @returns Matching Device or null when no match is found.
 */
export const matchUSBDevice = (
  devices: Device[],
  device: USBDevice,
): Device | null => {
  return findMatchingDevices(devices, device)[0] ?? null
}

/**
 * Return all Device instances whose USB search entries match the device.
 *
 * @param devices - Devices to evaluate.
 * @param device - Selected WebUSB device.
 * @returns Matching Device instances, in the same order as provided.
 */
export const findMatchingDevices = (
  devices: Device[],
  device: USBDevice,
): Device[] => {
  const matches: Device[] = []
  for (const candidate of devices) {
    if (candidate.usbSearch.some((search) => matchesUSBSearch(device, search))) {
      matches.push(candidate)
    }
  }

  return matches
}

/**
 * Verify compatible Device instances using their static verification hooks.
 *
 * @param devices - Devices to verify.
 * @param device - Connected WebUSB device.
 * @returns Devices that pass verification (or do not implement it).
 */
export const verifyMatchingDevices = async (
  devices: Device[],
  device: USBDevice,
): Promise<Device[]> => {
  const verified: Device[] = []

  for (const candidate of devices) {
    const constructor = candidate.constructor as DeviceConstructor
    const verifier = constructor.verifyConnectedDevice
    if (!verifier) {
      verified.push(candidate)
      continue
    }

    const result = await verifier(device)
    if (result) {
      verified.push(candidate)
    }
  }

  return verified
}

/**
 * Check whether a USBDevice satisfies a DeviceUSBSearch entry.
 *
 * @param device - WebUSB device to evaluate.
 * @param search - Search criteria to match against.
 * @returns True when the device satisfies the search criteria.
 */
export const matchesUSBSearch = (
  device: USBDevice,
  search: DeviceUSBSearch,
): boolean => {
  if (search.vendorId != null && device.vendorId !== search.vendorId) {
    return false
  }

  if (search.productId != null && device.productId !== search.productId) {
    return false
  }

  if (search.serialNumber != null) {
    if (device.serialNumber == null || device.serialNumber !== search.serialNumber) {
      return false
    }
  }

  const needsClassMatch =
    search.classCode != null ||
    search.subclassCode != null ||
    search.protocolCode != null
  if (!needsClassMatch) {
    return true
  }

  const interfaceMatch = matchesInterfaceAlternates(device, search)
  if (interfaceMatch != null) {
    return interfaceMatch
  }

  return matchesDeviceClassFields(device, search)
}

/**
 * Convert a search entry into a WebUSB filter, omitting non-filter fields.
 *
 * @param search - Search entry to convert.
 * @returns WebUSB filter or null when no filter fields are present.
 */
const toUSBFilter = (search: DeviceUSBSearch): USBDeviceFilter | null => {
  const filter: USBDeviceFilter = {}

  if (search.vendorId != null) {
    filter.vendorId = search.vendorId
  }
  if (search.productId != null) {
    filter.productId = search.productId
  }
  if (search.classCode != null) {
    filter.classCode = search.classCode
  }
  if (search.subclassCode != null) {
    filter.subclassCode = search.subclassCode
  }
  if (search.protocolCode != null) {
    filter.protocolCode = search.protocolCode
  }
  if (search.serialNumber != null) {
    filter.serialNumber = search.serialNumber
  }

  if (Object.keys(filter).length === 0) {
    return null
  }

  return filter
}

/**
 * Build a stable key for comparing WebUSB filters.
 *
 * @param filter - WebUSB filter to convert.
 * @returns Stable key string.
 */
const buildFilterKey = (filter: USBDeviceFilter): string => {
  const parts = [
    filter.vendorId ?? '',
    filter.productId ?? '',
    filter.classCode ?? '',
    filter.subclassCode ?? '',
    filter.protocolCode ?? '',
    filter.serialNumber ?? '',
  ]

  return parts.join('|')
}

/**
 * Check interface alternates for a class/subclass/protocol match.
 *
 * @param device - WebUSB device to inspect.
 * @param search - Search criteria to match.
 * @returns True/false when interfaces are present, or null when no interface data.
 */
const matchesInterfaceAlternates = (
  device: USBDevice,
  search: DeviceUSBSearch,
): boolean | null => {
  const configurations = device.configuration
    ? [device.configuration]
    : device.configurations ?? []

  if (configurations.length === 0) {
    return null
  }

  let sawAlternate = false
  for (const configuration of configurations) {
    for (const usbInterface of configuration.interfaces) {
      for (const alternate of usbInterface.alternates) {
        sawAlternate = true
        if (matchesAlternate(alternate, search)) {
          return true
        }
      }
    }
  }

  return sawAlternate ? false : null
}

/**
 * Match a USB alternate interface against class search fields.
 *
 * @param alternate - USB alternate interface.
 * @param search - Search criteria with class fields.
 * @returns True when the alternate satisfies the class criteria.
 */
const matchesAlternate = (
  alternate: USBAlternateInterface,
  search: DeviceUSBSearch,
): boolean => {
  if (search.classCode != null && alternate.interfaceClass !== search.classCode) {
    return false
  }
  if (
    search.subclassCode != null &&
    alternate.interfaceSubclass !== search.subclassCode
  ) {
    return false
  }
  if (
    search.protocolCode != null &&
    alternate.interfaceProtocol !== search.protocolCode
  ) {
    return false
  }

  return true
}

/**
 * Match device-level class fields against class search fields.
 *
 * @param device - WebUSB device to inspect.
 * @param search - Search criteria with class fields.
 * @returns True when the device fields satisfy the class criteria.
 */
const matchesDeviceClassFields = (
  device: USBDevice,
  search: DeviceUSBSearch,
): boolean => {
  if (search.classCode != null && device.deviceClass !== search.classCode) {
    return false
  }
  if (
    search.subclassCode != null &&
    device.deviceSubclass !== search.subclassCode
  ) {
    return false
  }
  if (
    search.protocolCode != null &&
    device.deviceProtocol !== search.protocolCode
  ) {
    return false
  }

  return true
}
