import { DRPDDeviceDefinition } from '../../lib/device'
import type { Device } from '../../lib/device'

/**
 * Build the list of supported device definitions.
 */
export const getSupportedDevices = (): Device[] => {
  return [new DRPDDeviceDefinition()]
}
