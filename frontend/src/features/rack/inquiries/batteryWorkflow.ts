import { SinkInquiryType } from '../../../lib/device'
import { parseSourceCapabilitiesExtendedDataBlock } from '../../../lib/device/drpd/usb-pd/DataObjects'
import type { SerialInquiryWorkflowStep } from './runner'

export const batteryReferencesFromScedb = (body: Uint8Array): number[] => {
  if (body.length !== 24 && body.length !== 25) throw new Error('SCEDB must contain exactly 24 or 25 bytes')
  const block = parseSourceCapabilitiesExtendedDataBlock(body)
  if (block.fixedBatteries > 4 || block.hotSwappableBatterySlots > 4) throw new Error('SCEDB battery counts exceed protocol bounds')
  return [
    ...Array.from({ length: block.fixedBatteries }, (_, index) => index),
    ...Array.from({ length: block.hotSwappableBatterySlots }, (_, index) => index + 4),
  ]
}

/** Build strict Cap→Status pairs for explicit references; invalid-reference results remain visible. */
export const buildBatterySurveySteps = (references: readonly number[]): SerialInquiryWorkflowStep[] => {
  if (references.length > 8 || new Set(references).size !== references.length || references.some((reference) => !Number.isInteger(reference) || reference < 0 || reference > 7)) {
    throw new Error('Battery survey references must be unique integers from 0 to 7')
  }
  return references.flatMap((batteryReference) => [
    { id: `battery-${batteryReference}-capabilities`, request: { type: SinkInquiryType.GET_BATTERY_CAP, batteryReference } },
    { id: `battery-${batteryReference}-status`, request: { type: SinkInquiryType.GET_BATTERY_STATUS, batteryReference } },
  ])
}

export const buildAllBatterySurveySteps = (): SerialInquiryWorkflowStep[] =>
  buildBatterySurveySteps([0, 1, 2, 3, 4, 5, 6, 7])
