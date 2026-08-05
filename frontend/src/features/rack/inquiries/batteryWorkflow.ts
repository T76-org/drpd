import { SinkInquiryType, type LoggedEventDataSection } from '../../../lib/device'
import {
  formatComplianceBits,
  formatPeakCurrentField,
  formatSourceInputs,
  formatTouchCurrent,
  formatTouchTempSource,
  formatVoltageRegulation,
  parseBatteryCapabilitiesDataBlock,
  parseBatteryStatusDataObject,
  parseSourceCapabilitiesExtendedDataBlock,
  readDataObjects,
  type ParsedSourceCapabilitiesExtendedDataBlock,
} from '../../../lib/device/drpd/usb-pd/DataObjects'
import { decodeInquiryResponse } from './decode'
import { formatSinkInquiryOutcome } from './presentation'
import { withSinkInquiryLease, type InquiryRunState, type SinkInquiryClient } from './runner'

export const BATTERY_CAPABILITIES_EVENT_TITLE = 'INQUIRY - Battery capabilities'
export const BATTERY_STATUS_EVENT_TITLE = 'INQUIRY - Battery status'

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')

export const hex8 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
export const hex16 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
export const hex32 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`
export const binary = (value: number, width: number): string => `0b${value.toString(2).padStart(width, '0')}`
export const rawHexValue = (bytes: Uint8Array): string => `\`${bytesToHex(bytes) || '(empty)'}\``

export const detailedValue = (value: string, explanation: string): string =>
  `${value}\n\n_${explanation}_`

const describeFailure = (result: InquiryRunState): string => {
  if (result.phase === 'terminal') return formatSinkInquiryOutcome(result.status.outcome)
  if (result.phase === 'transportError') return `Communication error: ${result.message}`
  if (result.phase === 'superseded') return `Superseded by request ${result.status.requestId}`
  if (result.phase === 'cancelled') return 'Cancelled'
  return `Incomplete (${result.phase})`
}

const formatCapacity = (raw: number): string => {
  if (raw === 0) return 'battery not present'
  if (raw === 0xffff) return 'unknown'
  return `${(raw / 10).toFixed(1)} Wh`
}

export const describeBatteryReference = (reference: number): string =>
  reference < 4 ? `fixed battery ${reference}` : `hot-swappable slot ${reference - 4}`

export const describeBatteryReferenceSummary = (reference: number): string =>
  reference < 4 ? 'fixed' : `hot-swappable slot ${reference - 4}`

export const buildBatteryDiscoverySection = (
  block: ParsedSourceCapabilitiesExtendedDataBlock,
  raw: Uint8Array,
  references: number[],
): LoggedEventDataSection => {
  const batteryCounts = raw[22] ?? 0
  const sprPdp = raw[23] ?? 0
  const entries: LoggedEventDataSection['entries'] = [
    { key: 'Outcome', value: 'Response decoded successfully.' },
    { key: 'Data Block Length', value: detailedValue(`${raw.length} bytes`, raw.length === 24 ? 'Legacy 24-byte Source Capabilities Extended Data Block.' : '25-byte Source Capabilities Extended Data Block including EPR Source PDP.') },
    { key: 'Vendor ID (bytes 0–1)', value: detailedValue(`**${hex16(block.vid)}**`, `USB-IF Vendor ID. Raw little-endian bytes: ${rawHexValue(raw.subarray(0, 2))}.`) },
    { key: 'Product ID (bytes 2–3)', value: detailedValue(`**${hex16(block.pid)}**`, `Product ID. Raw little-endian bytes: ${rawHexValue(raw.subarray(2, 4))}.`) },
    { key: 'XID (bytes 4–7)', value: detailedValue(`**${hex32(block.xid)}**`, `USB-IF Extended ID. Raw little-endian bytes: ${rawHexValue(raw.subarray(4, 8))}.`) },
    { key: 'Firmware Version (byte 8)', value: detailedValue(`${block.fwVersion}`, `Raw: \`${hex8(raw[8] ?? 0)}\`.`) },
    { key: 'Hardware Version (byte 9)', value: detailedValue(`${block.hwVersion}`, `Raw: \`${hex8(raw[9] ?? 0)}\`.`) },
    { key: 'Voltage Regulation (byte 10)', value: detailedValue(formatVoltageRegulation(block.voltageRegulation), `Raw: \`${hex8(raw[10] ?? 0)}\`; includes load-step slew-rate and magnitude fields.`) },
    { key: 'Holdup Time (byte 11)', value: detailedValue(`${block.holdupTimeMs} ms`, `Raw: \`${hex8(raw[11] ?? 0)}\`.`) },
    { key: 'Compliance (byte 12)', value: detailedValue(formatComplianceBits(block.compliance), `Raw: \`${hex8(raw[12] ?? 0)}\`; reports LPS, PS1, and PS2 compliance bits.`) },
    { key: 'Touch Current (byte 13)', value: detailedValue(formatTouchCurrent(block.touchCurrent), `Raw: \`${hex8(raw[13] ?? 0)}\`; reports touch-current and protective-earth capabilities.`) },
    { key: 'Peak Current 1 (bytes 14–15)', value: detailedValue(formatPeakCurrentField(block.peakCurrent1), `Raw little-endian bytes: ${rawHexValue(raw.subarray(14, 16))}.`) },
    { key: 'Peak Current 2 (bytes 16–17)', value: detailedValue(formatPeakCurrentField(block.peakCurrent2), `Raw little-endian bytes: ${rawHexValue(raw.subarray(16, 18))}.`) },
    { key: 'Peak Current 3 (bytes 18–19)', value: detailedValue(formatPeakCurrentField(block.peakCurrent3), `Raw little-endian bytes: ${rawHexValue(raw.subarray(18, 20))}.`) },
    { key: 'Touch Temperature (byte 20)', value: detailedValue(formatTouchTempSource(block.touchTemp), `Raw: \`${hex8(raw[20] ?? 0)}\`.`) },
    { key: 'Source Inputs (byte 21)', value: detailedValue(formatSourceInputs(block.sourceInputs), `Raw: \`${hex8(raw[21] ?? 0)}\`; reports external-supply and internal-battery input capabilities.`) },
    { key: 'Battery Counts (byte 22)', value: detailedValue(`**${block.fixedBatteries} fixed; ${block.hotSwappableBatterySlots} hot-swappable**`, `Raw: \`${hex8(batteryCounts)}\` (${binary(batteryCounts, 8)}). Bits 3:0 = fixed battery count (${binary(block.fixedBatteries, 4)}); bits 7:4 = hot-swappable slot count (${binary(block.hotSwappableBatterySlots, 4)}).`) },
    { key: 'Battery References', value: references.length > 0 ? references.map((reference) => `\`${reference}\` (${describeBatteryReference(reference)})`).join(', ') : 'None advertised.' },
    { key: 'SPR Source PDP (byte 23)', value: detailedValue(`${block.sprSourcePdpRating} W`, `Raw: \`${hex8(sprPdp)}\` (${binary(sprPdp, 8)}). Bits 6:0 encode the SPR PDP rating; bit 7 is reserved.`) },
  ]
  entries.push(block.eprSourcePdpRating === null
    ? { key: 'EPR Source PDP (byte 24)', value: 'Not present in this legacy 24-byte data block.' }
    : { key: 'EPR Source PDP (byte 24)', value: detailedValue(`${block.eprSourcePdpRating} W`, `Raw: \`${hex8(raw[24] ?? 0)}\`.`) })
  entries.push({ key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Complete Source Capabilities Extended response payload. The outer USB-PD packet header and CRC are not included.') })
  return { title: 'Source Capabilities Extended', entries }
}

const buildFailedDiscoverySection = (
  outcome: string,
  raw?: Uint8Array,
  decodeError?: string,
): LoggedEventDataSection => ({
  title: 'Source Capabilities Extended',
  entries: [
    { key: 'Outcome', value: outcome },
    ...(decodeError ? [{ key: 'Decode Error', value: decodeError }] : []),
    ...(raw ? [{ key: 'Raw Logical Response', value: rawHexValue(raw) }] : []),
  ],
})

const buildBatterySectionTitle = (reference: number): string =>
  `Battery ${reference} — ${reference < 4 ? `Fixed battery ${reference}` : `Hot-swappable slot ${reference - 4}`}`

const buildFailedBatterySection = (
  reference: number,
  outcome: string,
  raw?: Uint8Array,
  decodeError?: string,
): LoggedEventDataSection => ({
  title: buildBatterySectionTitle(reference),
  entries: [
    { key: 'Battery Reference', value: detailedValue(`\`${reference}\``, describeBatteryReference(reference)) },
    { key: 'Outcome', value: outcome },
    ...(decodeError ? [{ key: 'Decode Error', value: decodeError }] : []),
    ...(raw ? [{ key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Complete logical Battery_Capabilities response body.') }] : []),
  ],
})

const buildBatteryCapabilitiesSection = (
  reference: number,
  raw: Uint8Array,
): LoggedEventDataSection => {
  const block = parseBatteryCapabilitiesDataBlock(raw)
  const invalidReference = (block.batteryType & 0x01) !== 0
  const reserved = block.batteryType >> 1
  return {
    title: buildBatterySectionTitle(reference),
    entries: [
      { key: 'Battery Reference', value: detailedValue(`\`${reference}\``, describeBatteryReference(reference)) },
      { key: 'Outcome', value: 'Response decoded successfully.' },
      { key: 'Vendor ID (bytes 0–1)', value: detailedValue(`**${hex16(block.vid)}**`, `USB-IF Vendor ID. Raw little-endian bytes: ${rawHexValue(raw.subarray(0, 2))}.`) },
      { key: 'Product ID (bytes 2–3)', value: detailedValue(`**${hex16(block.pid)}**`, `Product ID. Raw little-endian bytes: ${rawHexValue(raw.subarray(2, 4))}.`) },
      { key: 'Design Capacity (bytes 4–5)', value: detailedValue(`**${formatCapacity(block.batteryDesignCapacity)}**`, `Raw little-endian value: \`${hex16(block.batteryDesignCapacity)}\`. Units are tenths of Wh; 0x0000 means battery not present and 0xFFFF means unknown.`) },
      { key: 'Last Full-Charge Capacity (bytes 6–7)', value: detailedValue(`**${formatCapacity(block.batteryLastFullChargeCapacity)}**`, `Raw little-endian value: \`${hex16(block.batteryLastFullChargeCapacity)}\`. Units are tenths of Wh; 0x0000 means battery not present and 0xFFFF means unknown.`) },
      { key: 'Battery Type (byte 8)', value: detailedValue(`\`${hex8(block.batteryType)}\` (${binary(block.batteryType, 8)})`, 'Battery Type bitfield returned by the source.') },
      { key: 'Invalid Battery Reference (bit 0)', value: `${binary(block.batteryType & 0x01, 1)} — **${invalidReference ? 'invalid' : 'valid'} battery reference**.` },
      { key: 'Reserved (bits 7:1)', value: `${binary(reserved, 7)} — must be zero.` },
      { key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Complete 9-byte Battery_Capabilities response payload. The outer USB-PD packet header and CRC are not included.') },
    ],
  }
}

export interface BatteryCapabilitiesSurveyResult {
  references: number[]
  summary: string
  eventData?: LoggedEventDataSection[]
}

/** Discover advertised batteries and query Battery_Capabilities for each reference serially. */
export const surveyBatteryCapabilities = async (
  client: SinkInquiryClient,
): Promise<BatteryCapabilitiesSurveyResult> => withSinkInquiryLease(client, async (run) => {
  const discovery = await run({ type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED })
  if (discovery.phase !== 'response') {
    const failure = describeFailure(discovery)
    return {
      references: [],
      summary: `- **Battery discovery:** ${failure}. No Battery_Capabilities requests were sent.`,
      eventData: [buildFailedDiscoverySection(failure)],
    }
  }

  let references: number[]
  let fixedBatteries: number
  let hotSwappableBatterySlots: number
  let extendedCapabilities: ParsedSourceCapabilitiesExtendedDataBlock
  try {
    decodeInquiryResponse(discovery.status, discovery.rawResponse, discovery.request)
    extendedCapabilities = parseSourceCapabilitiesExtendedDataBlock(discovery.rawResponse)
    fixedBatteries = extendedCapabilities.fixedBatteries
    hotSwappableBatterySlots = extendedCapabilities.hotSwappableBatterySlots
    references = batteryReferencesFromScedb(discovery.rawResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      references: [],
      summary: `- **Battery discovery:** malformed response (${message}). No Battery_Capabilities requests were sent.`,
      eventData: [buildFailedDiscoverySection('Malformed response.', discovery.rawResponse, message)],
    }
  }

  const lines = [
    `- **Advertised batteries:** ${references.length} total — ${fixedBatteries} fixed, ${hotSwappableBatterySlots} hot-swappable.`,
  ]
  const eventData: LoggedEventDataSection[] = [
    buildBatteryDiscoverySection(extendedCapabilities, discovery.rawResponse, references),
  ]
  for (const batteryReference of references) {
    const request = { type: SinkInquiryType.GET_BATTERY_CAP, batteryReference } as const
    const result = await run(request)
    if (result.phase !== 'response') {
      const failure = describeFailure(result)
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **Outcome:** ${failure}.`,
      )
      eventData.push(buildFailedBatterySection(batteryReference, failure))
      continue
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const capabilities = parseBatteryCapabilitiesDataBlock(result.rawResponse)
      const invalidReference = (capabilities.batteryType & 0x01) !== 0
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **VID:** ${hex16(capabilities.vid)}`,
        `  - **PID:** ${hex16(capabilities.pid)}`,
        `  - **Design capacity:** ${formatCapacity(capabilities.batteryDesignCapacity)}`,
        `  - **Last full-charge capacity:** ${formatCapacity(capabilities.batteryLastFullChargeCapacity)}`,
        `  - **Battery reference:** ${invalidReference ? 'Invalid' : 'Valid'}`,
      )
      eventData.push(buildBatteryCapabilitiesSection(batteryReference, result.rawResponse))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **Outcome:** Malformed response (${message}).`,
      )
      eventData.push(buildFailedBatterySection(batteryReference, 'Malformed response.', result.rawResponse, message))
    }
  }
  return { references, summary: lines.join('\n'), eventData }
})

/** Discover advertised batteries and query Battery_Status for each reference serially. */
export const surveyBatteryStatus = async (
  client: SinkInquiryClient,
): Promise<BatteryCapabilitiesSurveyResult> => withSinkInquiryLease(client, async (run) => {
  const discovery = await run({ type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED })
  if (discovery.phase !== 'response') {
    const failure = describeFailure(discovery)
    return {
      references: [],
      summary: `- **Battery discovery:** ${failure}. No Battery_Status requests were sent.`,
      eventData: [buildFailedDiscoverySection(failure)],
    }
  }

  let references: number[]
  let fixedBatteries: number
  let hotSwappableBatterySlots: number
  let extendedCapabilities: ParsedSourceCapabilitiesExtendedDataBlock
  try {
    decodeInquiryResponse(discovery.status, discovery.rawResponse, discovery.request)
    extendedCapabilities = parseSourceCapabilitiesExtendedDataBlock(discovery.rawResponse)
    fixedBatteries = extendedCapabilities.fixedBatteries
    hotSwappableBatterySlots = extendedCapabilities.hotSwappableBatterySlots
    references = batteryReferencesFromScedb(discovery.rawResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      references: [],
      summary: `- **Battery discovery:** malformed response (${message}). No Battery_Status requests were sent.`,
      eventData: [buildFailedDiscoverySection('Malformed response.', discovery.rawResponse, message)],
    }
  }

  const lines = [
    `- **Advertised batteries:** ${references.length} total — ${fixedBatteries} fixed, ${hotSwappableBatterySlots} hot-swappable.`,
  ]
  const eventData: LoggedEventDataSection[] = [
    buildBatteryDiscoverySection(extendedCapabilities, discovery.rawResponse, references),
  ]
  for (const batteryReference of references) {
    const request = { type: SinkInquiryType.GET_BATTERY_STATUS, batteryReference } as const
    const result = await run(request)
    if (result.phase !== 'response') {
      const failure = describeFailure(result)
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **Outcome:** ${failure}.`,
      )
      eventData.push(buildFailedBatteryStatusSection(batteryReference, failure))
      continue
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const status = parseBatteryStatusDataObject(readDataObjects(result.rawResponse, 0, 1)[0])
      const capacity = status.batteryPresentCapacity === 0xffff
        ? 'unknown'
        : status.batteryPresent
          ? `${(status.batteryPresentCapacity / 10).toFixed(1)} Wh`
          : 'battery not present'
      const chargeState = ['charging', 'discharging', 'idle', 'reserved'][status.batteryChargingStatus]
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **Present:** ${status.batteryPresent ? 'Yes' : 'No'}`,
        `  - **Present capacity:** ${capacity}`,
        `  - **Charge state:** ${chargeState}`,
        `  - **Battery reference:** ${status.invalidBatteryReference ? 'Invalid' : 'Valid'}`,
      )
      eventData.push(buildBatteryStatusSection(batteryReference, result.rawResponse))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **Outcome:** Malformed response (${message}).`,
      )
      eventData.push(buildFailedBatteryStatusSection(batteryReference, 'Malformed response.', result.rawResponse, message))
    }
  }
  return { references, summary: lines.join('\n'), eventData }
})

const buildFailedBatteryStatusSection = (
  reference: number,
  outcome: string,
  raw?: Uint8Array,
  decodeError?: string,
): LoggedEventDataSection => ({
  title: buildBatterySectionTitle(reference),
  entries: [
    { key: 'Battery Reference', value: detailedValue(`\`${reference}\``, describeBatteryReference(reference)) },
    { key: 'Outcome', value: outcome },
    ...(decodeError ? [{ key: 'Decode Error', value: decodeError }] : []),
    ...(raw ? [{ key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Complete logical Battery_Status response body.') }] : []),
  ],
})

const buildBatteryStatusSection = (
  reference: number,
  raw: Uint8Array,
): LoggedEventDataSection => {
  const rawObject = readDataObjects(raw, 0, 1)[0]
  const status = parseBatteryStatusDataObject(rawObject)
  const capacity = status.batteryPresentCapacity === 0xffff
    ? 'unknown'
    : status.batteryPresent
      ? `${(status.batteryPresentCapacity / 10).toFixed(1)} Wh`
      : 'battery not present'
  const chargeState = ['charging', 'discharging', 'idle', 'reserved'][status.batteryChargingStatus]
  return {
    title: buildBatterySectionTitle(reference),
    entries: [
      { key: 'Battery Reference', value: detailedValue(`\`${reference}\``, describeBatteryReference(reference)) },
      { key: 'Outcome', value: 'Response decoded successfully.' },
      { key: 'Present Capacity (bits 31:16)', value: detailedValue(`**${capacity}**`, `Raw: \`${hex16(status.batteryPresentCapacity)}\`. Units are tenths of Wh; 0xFFFF means unknown. Value is reported as battery not present when bit 9 is clear.`) },
      { key: 'Reserved (bits 15:12)', value: `${binary((rawObject >>> 12) & 0x0f, 4)} — must be zero.` },
      { key: 'Charging Status (bits 11:10)', value: `${binary(status.batteryChargingStatus, 2)} — **${chargeState}**.` },
      { key: 'Battery Present (bit 9)', value: `${binary(status.batteryPresent ? 1 : 0, 1)} — **${status.batteryPresent ? 'present' : 'not present'}**.` },
      { key: 'Invalid Battery Reference (bit 8)', value: `${binary(status.invalidBatteryReference ? 1 : 0, 1)} — **${status.invalidBatteryReference ? 'invalid' : 'valid'} battery reference**.` },
      { key: 'Reserved (bits 7:0)', value: `${binary(rawObject & 0xff, 8)} — must be zero.` },
      { key: 'Raw Data Object', value: detailedValue(`\`${hex32(rawObject)}\``, 'Battery Status Data Object interpreted in host numeric order.') },
      { key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Complete 4-byte Battery_Status response payload. The outer USB-PD packet header and CRC are not included.') },
    ],
  }
}

export const batteryReferencesFromScedb = (body: Uint8Array): number[] => {
  if (body.length !== 24 && body.length !== 25) throw new Error('SCEDB must contain exactly 24 or 25 bytes')
  const block = parseSourceCapabilitiesExtendedDataBlock(body)
  if (block.fixedBatteries > 4 || block.hotSwappableBatterySlots > 4) throw new Error('SCEDB battery counts exceed protocol bounds')
  return [
    ...Array.from({ length: block.fixedBatteries }, (_, index) => index),
    ...Array.from({ length: block.hotSwappableBatterySlots }, (_, index) => index + 4),
  ]
}
