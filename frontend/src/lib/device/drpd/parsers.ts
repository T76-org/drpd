/**
 * @file parsers.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD SCPI response parsers.
 */

import {
  AnalogMonitorCCChannelStatus,
  CaptureDecodeResult,
  CCBusRole,
  CCBusRoleStatus,
  CcChannel,
  OnOffState,
  SinkPdoType,
  SinkState,
  TestCcRole,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  TriggerSenderFilter,
  TriggerStatus,
  TriggerSyncMode,
  VBusStatus,
} from './types'
import type {
  AccumulatedMeasurements,
  AnalogMonitorChannels,
  CapturedMessage,
  DeviceIdentity,
  DeviceStatusFlags,
  SinkInfo,
  SinkPdo,
  TriggerMessageTypeFilter,
  VBusInfo,
} from './types'

/**
 * Parse a decimal string into a finite number.
 *
 * @param value - Raw numeric string.
 * @param label - Value label for error messages.
 * @returns Parsed number.
 */
export const parseNumber = (value: string, label: string): number => {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

/**
 * Parse a decimal string into a finite integer.
 *
 * @param value - Raw integer string.
 * @param label - Value label for error messages.
 * @returns Parsed integer.
 */
export const parseIntValue = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

/**
 * Parse a decimal string into bigint.
 *
 * @param value - Raw integer string.
 * @param label - Value label for error messages.
 * @returns Parsed bigint.
 */
export const parseBigIntValue = (value: string, label: string): bigint => {
  try {
    return BigInt(value.trim())
  } catch {
    throw new Error(`Invalid ${label}: ${value}`)
  }
}

/**
 * Parse a response expected to contain a single numeric value.
 *
 * @param values - Parsed SCPI response values.
 * @param label - Value label for error messages.
 * @returns Parsed number.
 */
export const parseSingleNumber = (values: string[], label: string): number => {
  if (!values.length) {
    throw new Error(`Missing ${label} response`)
  }
  return parseNumber(values[0], label)
}

/**
 * Parse a response expected to contain a single integer value.
 *
 * @param values - Parsed SCPI response values.
 * @param label - Value label for error messages.
 * @returns Parsed integer.
 */
export const parseSingleInt = (values: string[], label: string): number => {
  if (!values.length) {
    throw new Error(`Missing ${label} response`)
  }
  return parseIntValue(values[0], label)
}

/**
 * Parse a response value that may be returned in base units (V/A) or milli-units.
 *
 * @param values - Parsed SCPI response values.
 * @param label - Value label for error messages.
 * @param baseUnitThreshold - Maximum value that is treated as base units.
 * @returns Integer value in milli-units.
 */
export const parseSingleScaledMilliInt = (
  values: string[],
  label: string,
  baseUnitThreshold: number,
): number => {
  if (!values.length) {
    throw new Error(`Missing ${label} response`)
  }
  const parsed = parseNumber(values[0], label)
  if (Math.abs(parsed) <= baseUnitThreshold) {
    return Math.round(parsed * 1000)
  }
  return Math.round(parsed)
}

/**
 * Parse a response expected to contain a single bigint value.
 *
 * @param values - Parsed SCPI response values.
 * @param label - Value label for error messages.
 * @returns Parsed bigint.
 */
export const parseSingleBigInt = (values: string[], label: string): bigint => {
  if (!values.length) {
    throw new Error(`Missing ${label} response`)
  }
  return parseBigIntValue(values[0], label)
}

/**
 * Parse a comma-separated SCPI response from tokenized values.
 *
 * @param values - Parsed SCPI response tokens.
 * @returns Comma-separated fields.
 */
export const parseCommaSeparated = (values: string[]): string[] => {
  const combined = values.join(' ').trim()
  if (!combined) {
    return []
  }
  return combined.split(',').map((part) => part.trim().replace(/^"|"$/g, ''))
}

/**
 * Parse an ON/OFF state token.
 *
 * @param value - Raw token.
 * @returns Parsed OnOffState.
 */
export const parseOnOff = (value: string): OnOffState => {
  const normalized = value.trim().toUpperCase()
  if (normalized === OnOffState.ON) {
    return OnOffState.ON
  }
  if (normalized === OnOffState.OFF) {
    return OnOffState.OFF
  }
  throw new Error(`Invalid ON/OFF value: ${value}`)
}

/**
 * Parse a CC bus role token.
 *
 * @param value - Raw token.
 * @returns Parsed CC bus role.
 */
export const parseCCBusRole = (value: string): CCBusRole => {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case CCBusRole.DISABLED:
      return CCBusRole.DISABLED
    case CCBusRole.OBSERVER:
      return CCBusRole.OBSERVER
    case CCBusRole.SOURCE:
      return CCBusRole.SOURCE
    case CCBusRole.SINK:
      return CCBusRole.SINK
    default:
      throw new Error(`Invalid CC bus role: ${value}`)
  }
}

/**
 * Parse a CC bus role status token.
 *
 * @param value - Raw token.
 * @returns Parsed CC bus role status.
 */
export const parseCCBusRoleStatus = (value: string): CCBusRoleStatus => {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case CCBusRoleStatus.UNATTACHED:
      return CCBusRoleStatus.UNATTACHED
    case CCBusRoleStatus.SOURCE_FOUND:
      return CCBusRoleStatus.SOURCE_FOUND
    case CCBusRoleStatus.ATTACHED:
      return CCBusRoleStatus.ATTACHED
    default:
      throw new Error(`Invalid CC bus role status: ${value}`)
  }
}

/**
 * Parse a VBUS status token.
 *
 * @param value - Raw token.
 * @returns Parsed VBUS status.
 */
export const parseVBusStatus = (value: string): VBusStatus => {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case VBusStatus.ENABLED:
      return VBusStatus.ENABLED
    case VBusStatus.DISABLED:
      return VBusStatus.DISABLED
    case VBusStatus.OVP:
      return VBusStatus.OVP
    case VBusStatus.OCP:
      return VBusStatus.OCP
    default:
      throw new Error(`Invalid VBUS status: ${value}`)
  }
}

/**
 * Parse a trigger status token.
 *
 * @param value - Raw token.
 * @returns Parsed trigger status.
 */
export const parseTriggerStatus = (value: string): TriggerStatus => {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case TriggerStatus.IDLE:
      return TriggerStatus.IDLE
    case TriggerStatus.ARMED:
      return TriggerStatus.ARMED
    case TriggerStatus.TRIGGERED:
      return TriggerStatus.TRIGGERED
    default:
      throw new Error(`Invalid trigger status: ${value}`)
  }
}

/**
 * Parse a trigger event type token.
 *
 * @param value - Raw token.
 * @returns Parsed trigger event type.
 */
export const parseTriggerEventType = (value: string): TriggerEventType => {
  const normalized = value.trim().toUpperCase()
  const lookup: Record<string, TriggerEventType> = {
    [TriggerEventType.OFF]: TriggerEventType.OFF,
    [TriggerEventType.PREAMBLE_START]: TriggerEventType.PREAMBLE_START,
    [TriggerEventType.SOP_START]: TriggerEventType.SOP_START,
    [TriggerEventType.HEADER_START]: TriggerEventType.HEADER_START,
    [TriggerEventType.DATA_START]: TriggerEventType.DATA_START,
    [TriggerEventType.MESSAGE_COMPLETE]: TriggerEventType.MESSAGE_COMPLETE,
    [TriggerEventType.HARD_RESET_RECEIVED]: TriggerEventType.HARD_RESET_RECEIVED,
    [TriggerEventType.INVALID_KCODE]: TriggerEventType.INVALID_KCODE,
    [TriggerEventType.CRC_ERROR]: TriggerEventType.CRC_ERROR,
    [TriggerEventType.TIMEOUT_ERROR]: TriggerEventType.TIMEOUT_ERROR,
    [TriggerEventType.RUNT_PULSE_ERROR]: TriggerEventType.RUNT_PULSE_ERROR,
    [TriggerEventType.ANY_ERROR]: TriggerEventType.ANY_ERROR,
  }
  const parsed = lookup[normalized]
  if (!parsed) {
    throw new Error(`Invalid trigger event type: ${value}`)
  }
  return parsed
}

/**
 * Parse a trigger sync mode token.
 *
 * @param value - Raw token.
 * @returns Parsed trigger sync mode.
 */
export const parseTriggerSyncMode = (value: string): TriggerSyncMode => {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case TriggerSyncMode.PULSE_HIGH:
      return TriggerSyncMode.PULSE_HIGH
    case TriggerSyncMode.PULSE_LOW:
      return TriggerSyncMode.PULSE_LOW
    case TriggerSyncMode.TOGGLE:
      return TriggerSyncMode.TOGGLE
    case TriggerSyncMode.PULL_DOWN:
      return TriggerSyncMode.PULL_DOWN
    default:
      throw new Error(`Invalid trigger sync mode: ${value}`)
  }
}

/**
 * Parse a trigger sender filter token.
 *
 * @param value - Raw token.
 * @returns Parsed sender filter.
 */
export const parseTriggerSenderFilter = (value: string): TriggerSenderFilter => {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case TriggerSenderFilter.ANY:
      return TriggerSenderFilter.ANY
    case TriggerSenderFilter.SOURCE:
      return TriggerSenderFilter.SOURCE
    case TriggerSenderFilter.SINK:
      return TriggerSenderFilter.SINK
    case TriggerSenderFilter.CABLE:
      return TriggerSenderFilter.CABLE
    default:
      throw new Error(`Invalid trigger sender filter: ${value}`)
  }
}

/**
 * Parse a trigger message-type filter token.
 *
 * @param value - Raw token.
 * @returns Parsed trigger filter.
 */
export const parseTriggerMessageTypeFilter = (value: string): TriggerMessageTypeFilter => {
  const normalized = value.trim().toUpperCase()
  const separatorIndex = normalized.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    throw new Error(`Invalid trigger message type filter: ${value}`)
  }

  const classToken = normalized.slice(0, separatorIndex)
  const numberToken = normalized.slice(separatorIndex + 1)
  const parsedNumber = parseIntValue(numberToken, 'trigger message type number')
  if (parsedNumber < 0 || parsedNumber > 0x1f) {
    throw new Error(`Invalid trigger message type number: ${value}`)
  }

  switch (classToken) {
    case TriggerMessageTypeFilterClass.CONTROL:
      return {
        class: TriggerMessageTypeFilterClass.CONTROL,
        messageTypeNumber: parsedNumber,
      }
    case TriggerMessageTypeFilterClass.DATA:
      return {
        class: TriggerMessageTypeFilterClass.DATA,
        messageTypeNumber: parsedNumber,
      }
    default:
      throw new Error(`Invalid trigger message type filter class: ${value}`)
  }
}

/**
 * Parse a sink state token.
 *
 * @param value - Raw token.
 * @returns Parsed sink state.
 */
export const parseSinkState = (value: string): SinkState => {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case SinkState.DISCONNECTED:
      return SinkState.DISCONNECTED
    case SinkState.PE_SNK_STARTUP:
      return SinkState.PE_SNK_STARTUP
    case SinkState.PE_SNK_DISCOVERY:
      return SinkState.PE_SNK_DISCOVERY
    case SinkState.PE_SNK_WAIT_FOR_CAPABILITIES:
      return SinkState.PE_SNK_WAIT_FOR_CAPABILITIES
    case SinkState.PE_SNK_EVALUATE_CAPABILITY:
      return SinkState.PE_SNK_EVALUATE_CAPABILITY
    case SinkState.PE_SNK_SELECT_CAPABILITY:
      return SinkState.PE_SNK_SELECT_CAPABILITY
    case SinkState.PE_SNK_TRANSITION_SINK:
      return SinkState.PE_SNK_TRANSITION_SINK
    case SinkState.PE_SNK_READY:
      return SinkState.PE_SNK_READY
    case SinkState.PE_SNK_EPR_MODE_ENTRY:
      return SinkState.PE_SNK_EPR_MODE_ENTRY
    case SinkState.PE_SNK_GIVE_SINK_CAP:
      return SinkState.PE_SNK_GIVE_SINK_CAP
    case SinkState.PE_SNK_GET_SOURCE_CAP:
      return SinkState.PE_SNK_GET_SOURCE_CAP
    case SinkState.PE_SNK_EPR_KEEPALIVE:
      return SinkState.PE_SNK_EPR_KEEPALIVE
    case SinkState.PE_SNK_HARD_RESET:
      return SinkState.PE_SNK_HARD_RESET
    case SinkState.PE_SNK_TRANSITION_TO_DEFAULT:
      return SinkState.PE_SNK_TRANSITION_TO_DEFAULT
    case SinkState.ERROR:
      return SinkState.ERROR
    default:
      throw new Error(`Invalid sink state: ${value}`)
  }
}

/**
 * Parse a test CC role token.
 *
 * @param value - Raw token.
 * @returns Parsed test CC role.
 */
export const parseTestCcRole = (value: string): TestCcRole => {
  const normalized = value.trim().toUpperCase()
  const lookup: Record<string, TestCcRole> = {
    [TestCcRole.SOURCE_DEFAULT]: TestCcRole.SOURCE_DEFAULT,
    [TestCcRole.SOURCE_15]: TestCcRole.SOURCE_15,
    [TestCcRole.SOURCE_30]: TestCcRole.SOURCE_30,
    [TestCcRole.SINK]: TestCcRole.SINK,
    [TestCcRole.EMARKER]: TestCcRole.EMARKER,
    [TestCcRole.VCONN]: TestCcRole.VCONN,
    [TestCcRole.OFF]: TestCcRole.OFF,
  }
  const parsed = lookup[normalized]
  if (!parsed) {
    throw new Error(`Invalid test CC role: ${value}`)
  }
  return parsed
}

/**
 * Parse a CC channel token.
 *
 * @param value - Raw token.
 * @returns Parsed CC channel.
 */
export const parseCcChannel = (value: string): CcChannel => {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case CcChannel.CC1:
      return CcChannel.CC1
    case CcChannel.CC2:
      return CcChannel.CC2
    default:
      throw new Error(`Invalid CC channel: ${value}`)
  }
}

/**
 * Parse the device status register value.
 *
 * @param value - Raw register value.
 * @returns Parsed status flags.
 */
export const parseDeviceStatus = (value: string | number): DeviceStatusFlags => {
  const numeric = typeof value === 'number' ? value : Number.parseInt(value, 10)
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid device status value: ${value}`)
  }

  return {
    vbusStatusChanged: (numeric & 0x00000001) !== 0,
    roleChanged: (numeric & 0x00000002) !== 0,
    captureStatusChanged: (numeric & 0x00000004) !== 0,
    ccBusStatusChanged: (numeric & 0x00000008) !== 0,
    triggerStatusChanged: (numeric & 0x00000010) !== 0,
    sinkPdoListChanged: (numeric & 0x00000020) !== 0,
    sinkStatusChanged: (numeric & 0x00000040) !== 0,
    messageReceived: (numeric & 0x00000080) !== 0,
    rawValue: numeric,
  }
}

/**
 * Parse *IDN? response values.
 *
 * @param values - Parsed response tokens.
 * @returns Device identity fields.
 */
export const parseDeviceIdentity = (values: string[]): DeviceIdentity => {
  const parts = parseCommaSeparated(values)
  if (parts.length !== 4) {
    throw new Error(`Invalid *IDN? response: ${values.join(' ')}`)
  }
  return {
    manufacturer: parts[0],
    model: parts[1],
    serialNumber: parts[2],
    firmwareVersion: parts[3],
  }
}

/**
 * Parse SYST:ERR? response values.
 *
 * @param values - Parsed response tokens.
 * @returns Error code and message.
 */
export const parseErrorResponse = (values: string[]): { code: number; message: string } => {
  const combined = values.join(' ').trim()
  if (!combined) {
    throw new Error('Empty error response')
  }
  const [codePart, ...messageParts] = combined.split(',')
  const code = parseIntValue(codePart, 'error code')
  const message = messageParts.join(',').trim().replace(/^"|"$/g, '')
  return { code, message }
}

/**
 * Parse analog monitor response values.
 *
 * @param values - Parsed response tokens.
 * @returns Analog monitor channel values.
 */
export const parseAnalogMonitorChannels = (values: string[]): AnalogMonitorChannels => {
  if (values.length !== 13) {
    throw new Error(`Expected 13 analog values, got ${values.length}`)
  }
  return {
    captureTimestampUs: parseBigIntValue(values[0], 'VBUS capture timestamp'),
    vbus: parseNumber(values[1], 'VBUS voltage'),
    ibus: parseNumber(values[2], 'VBUS current'),
    dutCc1: parseNumber(values[3], 'DUT CC1 voltage'),
    dutCc2: parseNumber(values[4], 'DUT CC2 voltage'),
    usdsCc1: parseNumber(values[5], 'USDS CC1 voltage'),
    usdsCc2: parseNumber(values[6], 'USDS CC2 voltage'),
    adcVref: parseNumber(values[7], 'ADC VREF voltage'),
    groundRef: parseNumber(values[8], 'Ground reference voltage'),
    currentVref: parseNumber(values[9], 'Current reference voltage'),
    accumulationElapsedTimeUs: parseBigIntValue(values[10], 'Accumulation elapsed time'),
    accumulatedChargeMah: parseIntValue(values[11], 'Accumulated charge'),
    accumulatedEnergyMwh: parseIntValue(values[12], 'Accumulated energy'),
  }
}

/**
 * Parse accumulated measurement response values.
 *
 * @param values - Parsed response tokens.
 * @returns Accumulated charge and energy counters.
 */
export const parseAccumulatedMeasurements = (
  values: string[],
): AccumulatedMeasurements => {
  if (values.length !== 3) {
    throw new Error(`Expected 3 accumulated values, got ${values.length}`)
  }
  return {
    accumulationElapsedTimeUs: parseBigIntValue(values[0], 'Accumulation elapsed time'),
    accumulatedChargeMah: parseIntValue(values[1], 'Accumulated charge'),
    accumulatedEnergyMwh: parseIntValue(values[2], 'Accumulated energy'),
  }
}

/**
 * Derive the CC channel status from a voltage level.
 *
 * @param voltage - Voltage level in volts.
 * @returns Derived CC channel status.
 */
export const analogMonitorCCStatusFromVoltage = (
  voltage: number,
): AnalogMonitorCCChannelStatus => {
  if (voltage < 0.2) {
    return AnalogMonitorCCChannelStatus.DISCONNECTED
  }

  if (voltage < 1.3) {
    return AnalogMonitorCCChannelStatus.SINK_TX_NG
  }

  if (voltage < 2.2) {
    return AnalogMonitorCCChannelStatus.SINK_TX_OK
  }

  if (voltage >= 2.7) {
    return AnalogMonitorCCChannelStatus.V_CONN
  }

  return AnalogMonitorCCChannelStatus.UNKNOWN
}

/**
 * Parse a sink PDO response.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed sink PDO structure.
 */
export const parseSinkPdo = (values: string[]): SinkPdo => {
  const commaParts = parseCommaSeparated(values)
  const parts =
    commaParts.length === 1 && /\s/.test(commaParts[0])
      ? commaParts[0].trim().split(/\s+/)
      : commaParts
  if (!parts.length) {
    return null
  }
  const type = parts[0].toUpperCase()
  if (type === 'NONE') {
    return null
  }
  if (type === SinkPdoType.FIXED) {
    if (parts.length !== 3) {
      throw new Error(`Invalid FIXED PDO response: ${parts.join(',')}`)
    }
    return {
      type: SinkPdoType.FIXED,
      voltageV: parseNumber(parts[1], 'PDO voltage'),
      maxCurrentA: parseNumber(parts[2], 'PDO max current'),
    }
  }
  if (type === SinkPdoType.VARIABLE) {
    if (parts.length !== 4) {
      throw new Error(`Invalid VARIABLE PDO response: ${parts.join(',')}`)
    }
    return {
      type: SinkPdoType.VARIABLE,
      minVoltageV: parseNumber(parts[1], 'PDO min voltage'),
      maxVoltageV: parseNumber(parts[2], 'PDO max voltage'),
      maxCurrentA: parseNumber(parts[3], 'PDO max current'),
    }
  }
  if (type === SinkPdoType.BATTERY) {
    if (parts.length !== 4) {
      throw new Error(`Invalid BATTERY PDO response: ${parts.join(',')}`)
    }
    return {
      type: SinkPdoType.BATTERY,
      minVoltageV: parseNumber(parts[1], 'PDO min voltage'),
      maxVoltageV: parseNumber(parts[2], 'PDO max voltage'),
      maxPowerW: parseNumber(parts[3], 'PDO max power'),
    }
  }
  if (type === SinkPdoType.AUGMENTED) {
    if (parts.length !== 4) {
      throw new Error(`Invalid AUGMENTED PDO response: ${parts.join(',')}`)
    }
    // Older firmware reported PPS APDOs as "AUGMENTED". Normalize to the
    // current firmware token so downstream UI logic matches documented values.
    return {
      type: SinkPdoType.SPR_PPS,
      minVoltageV: parseNumber(parts[1], 'PDO min voltage'),
      maxVoltageV: parseNumber(parts[2], 'PDO max voltage'),
      maxCurrentA: parseNumber(parts[3], 'PDO max current'),
    }
  }
  if (type === SinkPdoType.SPR_PPS) {
    if (parts.length !== 4) {
      throw new Error(`Invalid SPR_PPS PDO response: ${parts.join(',')}`)
    }
    return {
      type: SinkPdoType.SPR_PPS,
      minVoltageV: parseNumber(parts[1], 'PDO min voltage'),
      maxVoltageV: parseNumber(parts[2], 'PDO max voltage'),
      maxCurrentA: parseNumber(parts[3], 'PDO max current'),
    }
  }
  if (type === SinkPdoType.SPR_AVS || type === SinkPdoType.EPR_AVS) {
    if (parts.length !== 4) {
      throw new Error(`Invalid ${type} PDO response: ${parts.join(',')}`)
    }
    return {
      type,
      minVoltageV: parseNumber(parts[1], 'PDO min voltage'),
      maxVoltageV: parseNumber(parts[2], 'PDO max voltage'),
      maxPowerW: parseNumber(parts[3], 'PDO max power'),
    }
  }
  throw new Error(`Unknown PDO type: ${parts[0]}`)
}

/**
 * Parse sink system summary from component fields.
 *
 * @param status - Sink status.
 * @param negotiatedPdo - Negotiated PDO.
 * @param negotiatedVoltageMv - Negotiated voltage in millivolts.
 * @param negotiatedCurrentMa - Negotiated current in milliamps.
 * @param error - Error flag.
 * @returns Sink info structure.
 */
export const buildSinkInfo = (
  status: SinkState,
  negotiatedPdo: SinkPdo,
  negotiatedVoltageMv: number,
  negotiatedCurrentMa: number,
  error: boolean,
): SinkInfo => ({
  status,
  negotiatedPdo,
  negotiatedVoltageMv,
  negotiatedCurrentMa,
  error,
})

/**
 * Parse VBUS info from component fields.
 *
 * @param status - VBUS status.
 * @param ovpThresholdMv - OVP threshold in millivolts.
 * @param ocpThresholdMa - OCP threshold in milliamps.
 * @returns VBUS info structure.
 */
export const buildVBusInfo = (
  status: VBusStatus,
  ovpThresholdMv: number,
  ocpThresholdMa: number,
  ovpEventTimestampUs: bigint | null = null,
  ocpEventTimestampUs: bigint | null = null,
): VBusInfo => ({
  status,
  ovpThresholdMv,
  ocpThresholdMa,
  ovpEventTimestampUs,
  ocpEventTimestampUs,
})

/**
 * Parse capture decode result byte.
 *
 * @param value - Raw decode result value.
 * @returns Parsed decode result enum.
 */
export const parseCaptureDecodeResult = (value: number): CaptureDecodeResult => {
  switch (value) {
    case CaptureDecodeResult.SUCCESS:
      return CaptureDecodeResult.SUCCESS
    case CaptureDecodeResult.INVALID_KCODE:
      return CaptureDecodeResult.INVALID_KCODE
    case CaptureDecodeResult.CRC_ERROR:
      return CaptureDecodeResult.CRC_ERROR
    case CaptureDecodeResult.TIMEOUT_ERROR:
      return CaptureDecodeResult.TIMEOUT_ERROR
    case CaptureDecodeResult.INCOMPLETE:
      return CaptureDecodeResult.INCOMPLETE
    default:
      throw new Error(`Invalid capture decode result: ${value}`)
  }
}

/**
 * Parse capture message binary payload.
 *
 * @param data - Raw capture payload.
 * @returns Parsed capture message.
 */
export const parseCapturedMessage = (data: Uint8Array): CapturedMessage => {
  if (data.byteLength < 28) {
    throw new Error('Capture payload is too short')
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const startTimestampUs = view.getBigUint64(0, true)
  const endTimestampUs = view.getBigUint64(8, true)
  const decodeResultValue = view.getUint32(16, true)
  const decodeResult = parseCaptureDecodeResult(decodeResultValue)
  const sop = data.subarray(20, 24)
  const pulseCount = view.getUint32(24, true)
  let offset = 28
  const pulseByteLength = pulseCount * 2
  if (offset + pulseByteLength + 4 > data.byteLength) {
    throw new Error('Capture payload missing pulse widths or data length')
  }

  const pulseWidths = new Uint16Array(pulseCount)
  for (let index = 0; index < pulseCount; index += 1) {
    pulseWidths[index] = view.getUint16(offset + index * 2, true)
  }

  offset += pulseByteLength
  if (offset + 4 > data.byteLength) {
    throw new Error('Capture payload missing data length')
  }
  const dataLength = view.getUint32(offset, true)
  offset += 4
  const decodedData = data.subarray(offset, offset + dataLength)
  if (decodedData.byteLength !== dataLength) {
    throw new Error('Capture payload data length mismatch')
  }
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
  const startTimestampSeconds =
    startTimestampUs <= maxSafe ? Number(startTimestampUs) / 1_000_000 : Number.NaN
  const endTimestampSeconds =
    endTimestampUs <= maxSafe ? Number(endTimestampUs) / 1_000_000 : Number.NaN

  return {
    startTimestampUs,
    endTimestampUs,
    startTimestampSeconds,
    endTimestampSeconds,
    decodeResult,
    sop,
    pulseCount,
    pulseWidths,
    dataLength,
    decodedData,
  }
}

/**
 * Parse a VBUS info response with numeric values.
 *
 * @param status - VBUS status.
 * @param ovpThresholdMv - OVP threshold.
 * @param ocpThresholdMa - OCP threshold.
 * @returns VBUS info structure.
 */
export const parseVBusInfo = (
  status: VBusStatus,
  ovpThresholdMv: number,
  ocpThresholdMa: number,
  ovpEventTimestampUs: bigint | null = null,
  ocpEventTimestampUs: bigint | null = null,
): VBusInfo => buildVBusInfo(
  status,
  ovpThresholdMv,
  ocpThresholdMa,
  ovpEventTimestampUs,
  ocpEventTimestampUs,
)

/**
 * Parse CC channel response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed channel.
 */
export const parseCcChannelResponse = (values: string[]): CcChannel => {
  if (!values.length) {
    throw new Error('Missing CC channel response')
  }
  return parseCcChannel(values[0])
}

/**
 * Parse test CC role response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed test CC role.
 */
export const parseTestCcRoleResponse = (values: string[]): TestCcRole => {
  if (!values.length) {
    throw new Error('Missing test CC role response')
  }
  return parseTestCcRole(values[0])
}

/**
 * Parse ON/OFF response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed OnOffState.
 */
export const parseOnOffResponse = (values: string[]): OnOffState => {
  if (!values.length) {
    throw new Error('Missing ON/OFF response')
  }
  return parseOnOff(values[0])
}

/**
 * Parse CC role response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed CC bus role.
 */
export const parseCCBusRoleResponse = (values: string[]): CCBusRole => {
  if (!values.length) {
    throw new Error('Missing CC bus role response')
  }
  return parseCCBusRole(values[0])
}

/**
 * Parse CC role status response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed CC bus role status.
 */
export const parseCCBusRoleStatusResponse = (values: string[]): CCBusRoleStatus => {
  if (!values.length) {
    throw new Error('Missing CC bus role status response')
  }
  return parseCCBusRoleStatus(values[0])
}

/**
 * Parse VBUS status response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed VBUS status.
 */
export const parseVBusStatusResponse = (values: string[]): VBusStatus => {
  if (!values.length) {
    throw new Error('Missing VBUS status response')
  }
  return parseVBusStatus(values[0])
}

export const parseOptionalVBusEventTimestamp = (
  value: string,
  label: string,
): bigint | null => {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'NONE') {
    return null
  }
  return parseBigIntValue(value, label)
}

export const parseVBusStatusFields = (values: string[]): {
  status: VBusStatus
  ovpEventTimestampUs: bigint | null
  ocpEventTimestampUs: bigint | null
} => {
  if (values.length < 3) {
    throw new Error(`Invalid VBUS status response: expected 3 fields, got ${values.length}`)
  }
  return {
    status: parseVBusStatus(values[0]),
    ovpEventTimestampUs: parseOptionalVBusEventTimestamp(values[1], 'OVP event timestamp'),
    ocpEventTimestampUs: parseOptionalVBusEventTimestamp(values[2], 'OCP event timestamp'),
  }
}

/**
 * Parse trigger status response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed trigger status.
 */
export const parseTriggerStatusResponse = (values: string[]): TriggerStatus => {
  if (!values.length) {
    throw new Error('Missing trigger status response')
  }
  return parseTriggerStatus(values[0])
}

/**
 * Parse trigger event type response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed trigger event type.
 */
export const parseTriggerEventTypeResponse = (values: string[]): TriggerEventType => {
  if (!values.length) {
    throw new Error('Missing trigger event type response')
  }
  return parseTriggerEventType(values[0])
}

/**
 * Parse trigger sender filter response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed trigger sender filter.
 */
export const parseTriggerSenderFilterResponse = (values: string[]): TriggerSenderFilter => {
  if (!values.length) {
    throw new Error('Missing trigger sender filter response')
  }
  return parseTriggerSenderFilter(values[0])
}

/**
 * Parse trigger sync mode response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed trigger sync mode.
 */
export const parseTriggerSyncModeResponse = (values: string[]): TriggerSyncMode => {
  if (!values.length) {
    throw new Error('Missing trigger sync mode response')
  }
  return parseTriggerSyncMode(values[0])
}

/**
 * Parse trigger message-type filter response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed trigger message-type filters.
 */
export const parseTriggerMessageTypeFiltersResponse = (
  values: string[],
): TriggerMessageTypeFilter[] => {
  const combined = values.join(' ').trim()
  if (!combined) {
    return []
  }

  return combined
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => parseTriggerMessageTypeFilter(token))
}

/**
 * Parse sink state response values.
 *
 * @param values - Parsed response tokens.
 * @returns Parsed sink state.
 */
export const parseSinkStateResponse = (values: string[]): SinkState => {
  if (!values.length) {
    throw new Error('Missing sink state response')
  }
  return parseSinkState(values[0])
}
