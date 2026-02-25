/**
 * @file types.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD device response types and enums.
 */

import type {
  AnalogSampleQuery,
  CapturedMessageQuery,
  DRPDLogCounts,
  DRPDLoggingDiagnostics,
  DRPDLoggingConfig,
  LogClearResult,
  LogClearScope,
  LogExportRequest,
  LogExportResult,
  LoggedAnalogSample,
  LoggedCapturedMessage,
} from './logging/types'

/**
 * Generic ON/OFF state.
 */
export const OnOffState = {
  ON: 'ON',
  OFF: 'OFF',
} as const

/**
 * Generic ON/OFF state value.
 */
export type OnOffState = (typeof OnOffState)[keyof typeof OnOffState]

/**
 * CC bus controller role.
 */
export const CCBusRole = {
  DISABLED: 'DISABLED',
  OBSERVER: 'OBSERVER',
  SOURCE: 'SOURCE',
  SINK: 'SINK',
} as const

/**
 * CC bus controller role value.
 */
export type CCBusRole = (typeof CCBusRole)[keyof typeof CCBusRole]

/**
 * CC bus controller role status.
 */
export const CCBusRoleStatus = {
  UNATTACHED: 'UNATTACHED',
  SOURCE_FOUND: 'SOURCE_FOUND',
  ATTACHED: 'ATTACHED',
} as const

/**
 * CC bus controller role status value.
 */
export type CCBusRoleStatus = (typeof CCBusRoleStatus)[keyof typeof CCBusRoleStatus]

/**
 * Sink PDO type discriminator.
 */
export const SinkPdoType = {
  FIXED: 'FIXED',
  VARIABLE: 'VARIABLE',
  BATTERY: 'BATTERY',
  AUGMENTED: 'AUGMENTED',
  SPR_PPS: 'SPR_PPS',
  SPR_AVS: 'SPR_AVS',
  EPR_AVS: 'EPR_AVS',
} as const

/**
 * Sink PDO type discriminator value.
 */
export type SinkPdoType = (typeof SinkPdoType)[keyof typeof SinkPdoType]

/**
 * VBUS controller status.
 */
export const VBusStatus = {
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED',
  OVP: 'OVP',
  OCP: 'OCP',
} as const

/**
 * VBUS controller status value.
 */
export type VBusStatus = (typeof VBusStatus)[keyof typeof VBusStatus]

/**
 * Trigger controller status.
 */
export const TriggerStatus = {
  IDLE: 'IDLE',
  ARMED: 'ARMED',
  TRIGGERED: 'TRIGGERED',
} as const

/**
 * Trigger controller status value.
 */
export type TriggerStatus = (typeof TriggerStatus)[keyof typeof TriggerStatus]

/**
 * Trigger event type.
 */
export const TriggerEventType = {
  OFF: 'OFF',
  PREAMBLE_START: 'PREAMBLE_START',
  SOP_START: 'SOP_START',
  HEADER_START: 'HEADER_START',
  DATA_START: 'DATA_START',
  MESSAGE_COMPLETE: 'MESSAGE_COMPLETE',
  HARD_RESET_RECEIVED: 'HARD_RESET_RECEIVED',
  INVALID_KCODE: 'INVALID_KCODE',
  CRC_ERROR: 'CRC_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RUNT_PULSE_ERROR: 'RUNT_PULSE_ERROR',
  ANY_ERROR: 'ANY_ERROR',
} as const

/**
 * Trigger event type value.
 */
export type TriggerEventType = (typeof TriggerEventType)[keyof typeof TriggerEventType]

/**
 * Trigger sync output mode.
 */
export const TriggerSyncMode = {
  OFF: 'OFF',
  PULSE_HIGH: 'PULSE_HIGH',
  PULSE_LOW: 'PULSE_LOW',
  TOGGLE: 'TOGGLE',
} as const

/**
 * Trigger sync output mode value.
 */
export type TriggerSyncMode = (typeof TriggerSyncMode)[keyof typeof TriggerSyncMode]

/**
 * Capture decode result value.
 */
export const CaptureDecodeResult = {
  SUCCESS: 0,
  INVALID_KCODE: 1,
  CRC_ERROR: 2,
  TIMEOUT_ERROR: 3,
  INCOMPLETE: 4,
} as const

/**
 * Capture decode result value type.
 */
export type CaptureDecodeResult =
  (typeof CaptureDecodeResult)[keyof typeof CaptureDecodeResult]

/**
 * Sink state machine status.
 */
export const SinkState = {
  DISCONNECTED: 'DISCONNECTED',
  PE_SNK_STARTUP: 'PE_SNK_STARTUP',
  PE_SNK_DISCOVERY: 'PE_SNK_DISCOVERY',
  PE_SNK_WAIT_FOR_CAPABILITIES: 'PE_SNK_WAIT_FOR_CAPABILITIES',
  PE_SNK_EVALUATE_CAPABILITY: 'PE_SNK_EVALUATE_CAPABILITY',
  PE_SNK_SELECT_CAPABILITY: 'PE_SNK_SELECT_CAPABILITY',
  PE_SNK_TRANSITION_SINK: 'PE_SNK_TRANSITION_SINK',
  PE_SNK_READY: 'PE_SNK_READY',
  PE_SNK_EPR_MODE_ENTRY: 'PE_SNK_EPR_MODE_ENTRY',
  PE_SNK_GIVE_SINK_CAP: 'PE_SNK_GIVE_SINK_CAP',
  PE_SNK_GET_SOURCE_CAP: 'PE_SNK_GET_SOURCE_CAP',
  PE_SNK_EPR_KEEPALIVE: 'PE_SNK_EPR_KEEPALIVE',
  PE_SNK_HARD_RESET: 'PE_SNK_HARD_RESET',
  PE_SNK_TRANSITION_TO_DEFAULT: 'PE_SNK_TRANSITION_TO_DEFAULT',
  ERROR: 'ERROR',
} as const

/**
 * Sink state machine status value.
 */
export type SinkState = (typeof SinkState)[keyof typeof SinkState]

/**
 * Test CC role options.
 */
export const TestCcRole = {
  SOURCE_DEFAULT: 'SOURCE_DEFAULT',
  SOURCE_15: 'SOURCE_15',
  SOURCE_30: 'SOURCE_30',
  SINK: 'SINK',
  EMARKER: 'EMARKER',
  VCONN: 'VCONN',
  OFF: 'OFF',
} as const

/**
 * Test CC role option value.
 */
export type TestCcRole = (typeof TestCcRole)[keyof typeof TestCcRole]

/**
 * CC channel selection.
 */
export const CcChannel = {
  CC1: 'CC1',
  CC2: 'CC2',
} as const

/**
 * CC channel selection value.
 */
export type CcChannel = (typeof CcChannel)[keyof typeof CcChannel]

/**
 * Device status register flags.
 */
export interface DeviceStatusFlags {
  ///< VBUS status changed.
  vbusStatusChanged: boolean
  ///< CC role changed.
  roleChanged: boolean
  ///< Capture status changed.
  captureStatusChanged: boolean
  ///< CC bus status changed.
  ccBusStatusChanged: boolean
  ///< Trigger status changed.
  triggerStatusChanged: boolean
  ///< Sink PDO list changed.
  sinkPdoListChanged: boolean
  ///< Sink status changed.
  sinkStatusChanged: boolean
  ///< Message received flag.
  messageReceived: boolean
  ///< Raw register value.
  rawValue: number
}

/**
 * Device identification fields from *IDN?.
 */
export interface DeviceIdentity {
  ///< Manufacturer name.
  manufacturer: string
  ///< Model name.
  model: string
  ///< Serial number.
  serialNumber: string
  ///< Firmware version.
  firmwareVersion: string
}

/**
 * Device memory usage information.
 */
export interface MemoryUsage {
  ///< Free bytes on device heap.
  freeBytes: number
  ///< Optional total bytes on device heap.
  totalBytes?: number
}

/**
 * Analog monitor channel measurements.
 */
export interface AnalogMonitorChannels {
  ///< VBUS capture timestamp in microseconds.
  captureTimestampUs: bigint
  ///< VBUS voltage.
  vbus: number
  ///< VBUS current.
  ibus: number
  ///< DUT CC1 voltage.
  dutCc1: number
  ///< DUT CC2 voltage.
  dutCc2: number
  ///< USDS CC1 voltage.
  usdsCc1: number
  ///< USDS CC2 voltage.
  usdsCc2: number
  ///< ADC reference voltage.
  adcVref: number
  ///< Ground reference voltage.
  groundRef: number
  ///< Current reference voltage.
  currentVref: number
}

/**
 * Analog monitor CC channel status.
 */
export const AnalogMonitorCCChannelStatus = {
  UNKNOWN: 'Unknown',
  SINK_TX_NG: 'SinkTxNG',
  SINK_TX_OK: 'SinkTxOK',
  V_CONN: 'VConn',
  DISCONNECTED: 'Disconnected',
} as const

/**
 * Analog monitor CC channel status value.
 */
export type AnalogMonitorCCChannelStatus =
  (typeof AnalogMonitorCCChannelStatus)[keyof typeof AnalogMonitorCCChannelStatus]

/**
 * VBUS controller information.
 */
export interface VBusInfo {
  ///< VBUS state.
  status: VBusStatus
  ///< OVP threshold in millivolts.
  ovpThresholdMv: number
  ///< OCP threshold in milliamps.
  ocpThresholdMa: number
}

/**
 * Trigger system information.
 */
export interface TriggerInfo {
  ///< Trigger status.
  status: TriggerStatus
  ///< Trigger event type.
  type: TriggerEventType
  ///< Event threshold count.
  eventThreshold: number
  ///< Auto-repeat enabled state.
  autorepeat: OnOffState
  ///< Count of trigger events.
  eventCount: number
  ///< Sync output mode.
  syncMode: TriggerSyncMode
  ///< Sync pulse width in microseconds.
  syncPulseWidthUs: number
}

/**
 * Fixed supply sink PDO.
 */
export interface FixedSinkPdo {
  ///< PDO type tag.
  type: typeof SinkPdoType.FIXED
  ///< Voltage in volts.
  voltageV: number
  ///< Maximum current in amps.
  maxCurrentA: number
}

/**
 * Variable supply sink PDO.
 */
export interface VariableSinkPdo {
  ///< PDO type tag.
  type: typeof SinkPdoType.VARIABLE
  ///< Minimum voltage in volts.
  minVoltageV: number
  ///< Maximum voltage in volts.
  maxVoltageV: number
  ///< Maximum current in amps.
  maxCurrentA: number
}

/**
 * Battery supply sink PDO.
 */
export interface BatterySinkPdo {
  ///< PDO type tag.
  type: typeof SinkPdoType.BATTERY
  ///< Minimum voltage in volts.
  minVoltageV: number
  ///< Maximum voltage in volts.
  maxVoltageV: number
  ///< Maximum power in watts.
  maxPowerW: number
}

/**
 * Augmented sink PDO.
 */
export interface AugmentedSinkPdo {
  ///< PDO type tag.
  type: typeof SinkPdoType.AUGMENTED
  ///< Minimum voltage in volts.
  minVoltageV: number
  ///< Maximum voltage in volts.
  maxVoltageV: number
  ///< Maximum current in amps.
  maxCurrentA: number
}

/**
 * SPR PPS augmented sink PDO.
 */
export interface SprPpsSinkPdo {
  ///< PDO type tag.
  type: typeof SinkPdoType.SPR_PPS
  ///< Minimum voltage in volts.
  minVoltageV: number
  ///< Maximum voltage in volts.
  maxVoltageV: number
  ///< Maximum current in amps.
  maxCurrentA: number
}

/**
 * SPR AVS or EPR AVS sink PDO.
 */
export interface AvsSinkPdo {
  ///< PDO type tag.
  type: typeof SinkPdoType.SPR_AVS | typeof SinkPdoType.EPR_AVS
  ///< Minimum voltage in volts.
  minVoltageV: number
  ///< Maximum voltage in volts.
  maxVoltageV: number
  ///< Maximum power in watts.
  maxPowerW: number
}

/**
 * Sink PDO union type.
 */
export type SinkPdo =
  | FixedSinkPdo
  | VariableSinkPdo
  | BatterySinkPdo
  | AugmentedSinkPdo
  | SprPpsSinkPdo
  | AvsSinkPdo
  | null

/**
 * Sink system information.
 */
export interface SinkInfo {
  ///< Sink state.
  status: SinkState
  ///< Negotiated PDO.
  negotiatedPdo: SinkPdo
  ///< Negotiated voltage in millivolts.
  negotiatedVoltageMv: number
  ///< Negotiated current in milliamps.
  negotiatedCurrentMa: number
  ///< Error state flag.
  error: boolean
}

/**
 * Captured CC bus message.
 */
export interface CapturedMessage {
  ///< Capture start timestamp in microseconds.
  startTimestampUs: bigint
  ///< Capture end timestamp in microseconds.
  endTimestampUs: bigint
  ///< Capture start timestamp in seconds (NaN if not safely representable).
  startTimestampSeconds: number
  ///< Capture end timestamp in seconds (NaN if not safely representable).
  endTimestampSeconds: number
  ///< Decode result status.
  decodeResult: CaptureDecodeResult
  ///< SOP identifier bytes.
  sop: Uint8Array
  ///< Pulse count.
  pulseCount: number
  ///< Pulse widths array (uint16 values).
  pulseWidths: Uint16Array
  ///< Decoded data length.
  dataLength: number
  ///< Decoded message payload.
  decodedData: Uint8Array
}

/**
 * DRPD device state snapshot.
 */
export interface DRPDDeviceState {
  ///< Current CC bus role, or null if unknown.
  role: CCBusRole | null
  ///< CC bus role status, or null if unknown.
  ccBusRoleStatus: CCBusRoleStatus | null
  ///< Latest analog monitor channels, or null if unknown.
  analogMonitor: AnalogMonitorChannels | null
  ///< VBUS info snapshot, or null if unknown.
  vbusInfo: VBusInfo | null
  ///< Capture enable state, or null if unknown.
  captureEnabled: OnOffState | null
  ///< Trigger info snapshot, or null if unknown.
  triggerInfo: TriggerInfo | null
  ///< Sink info snapshot, or null if unknown.
  sinkInfo: SinkInfo | null
  ///< Sink PDO list snapshot, or null if unknown.
  sinkPdoList: SinkPdo[] | null
}

/**
 * Persisted DRPD device configuration payload.
 */
export interface DRPDDeviceConfig {
  ///< DRPD logging configuration block.
  logging: DRPDLoggingConfig
}

export type {
  AnalogSampleQuery,
  CapturedMessageQuery,
  DRPDLogCounts,
  DRPDLoggingDiagnostics,
  DRPDLoggingConfig,
  LogClearResult,
  LogClearScope,
  LogExportRequest,
  LogExportResult,
  LoggedAnalogSample,
  LoggedCapturedMessage,
}
