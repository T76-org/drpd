import { describe, expect, it } from 'vitest'
import {
  buildUSBFilters,
  isDeviceIdentifier,
  matchUSBDevice,
  findMatchingDevices,
  verifyMatchingDevices,
  matchesUSBSearch,
  Device,
  type DeviceUSBSearch,
} from './base'

type MockUSBDeviceOptions = {
  vendorId?: number
  productId?: number
  serialNumber?: string | null
  deviceClass?: number
  deviceSubclass?: number
  deviceProtocol?: number
  configuration?: USBConfiguration | null
  configurations?: USBConfiguration[]
}

/**
 * Create a mock USBDevice with only the fields used by the device registry helpers.
 *
 * @param options - Mock device configuration overrides.
 * @returns Mock USBDevice instance.
 */
const createMockUSBDevice = (options: MockUSBDeviceOptions = {}): USBDevice => {
  const device = {
    vendorId: options.vendorId ?? 0,
    productId: options.productId ?? 0,
    serialNumber: options.serialNumber ?? null,
    deviceClass: options.deviceClass ?? 0,
    deviceSubclass: options.deviceSubclass ?? 0,
    deviceProtocol: options.deviceProtocol ?? 0,
    configuration: options.configuration ?? null,
    configurations: options.configurations ?? [],
  }

  return device as USBDevice
}

/**
 * Create a USB configuration with a single interface alternate for class matching.
 *
 * @param classCode - Interface class code.
 * @param subclassCode - Interface subclass code.
 * @param protocolCode - Interface protocol code.
 * @returns USBConfiguration with interface alternates.
 */
const createUSBConfiguration = (
  classCode: number,
  subclassCode: number,
  protocolCode: number,
): USBConfiguration => {
  return {
    configurationValue: 1,
    interfaces: [
      {
        interfaceNumber: 0,
        alternates: [
          {
            interfaceClass: classCode,
            interfaceSubclass: subclassCode,
            interfaceProtocol: protocolCode,
            endpoints: [],
          },
        ],
      },
    ],
  } as USBConfiguration
}

/**
 * Build a Device fixture with provided USB search entries.
 *
 * @param identifier - Device identifier.
 * @param usbSearch - USB search entries.
 * @returns Device fixture.
 */
const buildDefinition = (
  identifier: string,
  usbSearch: DeviceUSBSearch[],
): Device => {
  class TestDevice extends Device {
    public static verifyConnectedDevice?: (device: USBDevice) => Promise<boolean> | boolean

    public constructor() {
      super({
        identifier,
        displayName: identifier,
        usbSearch,
      })
    }
  }

  return new TestDevice()
}

describe('device registry helpers', () => {
  it('deduplicates WebUSB filters while keeping stable order', () => {
    const definitions = [
      buildDefinition('com.acme.alpha', [
        { vendorId: 10, productId: 1 },
        { vendorId: 10, productId: 2 },
      ]),
      buildDefinition('com.acme.beta', [
        { vendorId: 10, productId: 1 },
        { vendorId: 11 },
      ]),
    ]

    const filters = buildUSBFilters(definitions)

    expect(filters).toEqual([
      { vendorId: 10, productId: 1 },
      { vendorId: 10, productId: 2 },
      { vendorId: 11 },
    ])
  })

  it('matches a device by vendor/product identifiers', () => {
    const definitions = [
      buildDefinition('com.acme.scope', [{ vendorId: 5, productId: 6 }]),
      buildDefinition('com.acme.dmm', [{ vendorId: 5, productId: 7 }]),
    ]

    const device = createMockUSBDevice({ vendorId: 5, productId: 7 })
    const match = matchUSBDevice(definitions, device)

    expect(match?.identifier).toBe('com.acme.dmm')
  })

  it('finds all matching devices before verification', () => {
    const devices = [
      buildDefinition('com.acme.alpha', [{ vendorId: 9 }]),
      buildDefinition('com.acme.beta', [{ vendorId: 9 }]),
      buildDefinition('com.acme.gamma', [{ vendorId: 10 }]),
    ]

    const matches = findMatchingDevices(
      devices,
      createMockUSBDevice({ vendorId: 9 }),
    )

    expect(matches.map((match) => match.identifier)).toEqual([
      'com.acme.alpha',
      'com.acme.beta',
    ])
  })

  it('verifies matching devices using static verification hooks', async () => {
    class AcceptsDevice extends Device {
      public static verifyConnectedDevice = async () => true

      public constructor() {
        super({
          identifier: 'com.acme.accepts',
          displayName: 'Accepts',
          usbSearch: [{ vendorId: 5 }],
        })
      }
    }

    class RejectsDevice extends Device {
      public static verifyConnectedDevice = () => false

      public constructor() {
        super({
          identifier: 'com.acme.rejects',
          displayName: 'Rejects',
          usbSearch: [{ vendorId: 5 }],
        })
      }
    }

    const devices = [new AcceptsDevice(), new RejectsDevice()]
    const matches = findMatchingDevices(
      devices,
      createMockUSBDevice({ vendorId: 5 }),
    )
    const verified = await verifyMatchingDevices(
      matches,
      createMockUSBDevice({ vendorId: 5 }),
    )

    expect(verified.map((match) => match.identifier)).toEqual(['com.acme.accepts'])
  })

  it('matches class fields using interface alternates when available', () => {
    const configuration = createUSBConfiguration(0xfe, 0x03, 0x01)
    const device = createMockUSBDevice({
      configuration,
      configurations: [configuration],
      deviceClass: 0,
      deviceSubclass: 0,
      deviceProtocol: 0,
    })

    const search = { classCode: 0xfe, subclassCode: 0x03, protocolCode: 0x01 }

    expect(matchesUSBSearch(device, search)).toBe(true)
  })

  it('falls back to device-level class fields when interface data is missing', () => {
    const device = createMockUSBDevice({
      deviceClass: 0xaa,
      deviceSubclass: 0xbb,
      deviceProtocol: 0xcc,
    })

    const search = { classCode: 0xaa, subclassCode: 0xbb, protocolCode: 0xcc }

    expect(matchesUSBSearch(device, search)).toBe(true)
  })

  it('requires serial number matches when specified', () => {
    const definition = buildDefinition('com.acme.serial', [
      { vendorId: 12, productId: 34, serialNumber: 'ABC123' },
    ])

    const match = matchUSBDevice(
      [definition],
      createMockUSBDevice({ vendorId: 12, productId: 34, serialNumber: 'ABC123' }),
    )

    expect(match?.identifier).toBe('com.acme.serial')

    const mismatch = matchUSBDevice(
      [definition],
      createMockUSBDevice({ vendorId: 12, productId: 34, serialNumber: 'NOPE' }),
    )

    expect(mismatch).toBeNull()
  })

  it('validates reverse-domain identifiers', () => {
    expect(isDeviceIdentifier('com.acme.scope.model1000')).toBe(true)
    expect(isDeviceIdentifier('com')).toBe(false)
    expect(isDeviceIdentifier('Acme.scope')).toBe(false)
    expect(isDeviceIdentifier('com..scope')).toBe(false)
    expect(isDeviceIdentifier('com.scope ')).toBe(false)
  })
})
