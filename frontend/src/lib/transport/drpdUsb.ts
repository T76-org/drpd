/**
 * @file drpdUsb.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Preferred DRPD USB transport selection helpers.
 */

import type { DebugLogRegistry } from '../debugLogger'
import USBTMCTransport from './usbtmc'
import WinUSBTransport from './winusb'

export type DRPDUSBTransport = USBTMCTransport | WinUSBTransport

type CreateTransportOptions = {
  debugLogRegistry?: DebugLogRegistry
}

const describeDevice = (device: USBDevice): string => {
  const product = device.productName ?? 'unknown-product'
  const serial = device.serialNumber ?? 'unknown-serial'
  return `${product} serial=${serial}`
}

const logSelection = (
  transport: DRPDUSBTransport,
  device: USBDevice,
  interfaceNumber: number | undefined,
): void => {
  console.info(
    `[drpd] selected transport=${transport.kind} device="${describeDevice(device)}"${interfaceNumber != null ? ` interface=${interfaceNumber}` : ''}`,
  )
}

export const openPreferredDRPDTransport = async (
  device: USBDevice,
  options: CreateTransportOptions = {},
): Promise<DRPDUSBTransport> => {
  const winusb = new WinUSBTransport(device, options)
  try {
    await winusb.open()
    logSelection(winusb, device, winusb.claimedInterfaceNumber)
    return winusb
  } catch (winusbError) {
    try {
      await winusb.close()
    } catch {
      // Best-effort cleanup before fallback.
    }

    const usbtmc = new USBTMCTransport(device, options)
    try {
      await usbtmc.open()
      logSelection(usbtmc, device, usbtmc.claimedInterfaceNumber)
      return usbtmc
    } catch (usbtmcError) {
      throw new Error(
        `Failed to open DRPD transport (WinUSB: ${String(winusbError)}; USBTMC: ${String(usbtmcError)})`,
      )
    }
  }
}
