import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Device } from '../../lib/device'
import type { DeviceIdentity } from '../../lib/device'
import type { Instrument } from '../../lib/instrument'
import {
  CCBusRole,
  CCBusRoleStatus,
  DRPDDevice,
  DRPDDeviceDefinition,
  OnOffState,
  SinkPdoType,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  TriggerSenderFilter,
  TriggerStatus,
  TriggerSyncMode,
  VBusStatus,
  buildCapturedLogSelectionKey,
  buildDefaultLoggingConfig,
  decodeLoggedCapturedMessage,
  normalizeLoggingConfig,
  uploadDRPDFirmwareUF2,
  type DRPDLoggingConfig,
  type DRPDDriverRuntime,
  type LoggedCapturedMessage,
  buildUSBFilters,
  findMatchingDevices,
  verifyMatchingDevices
} from '../../lib/device'
import type {
  AnalogMonitorChannels,
  SinkInfo,
  SinkPdo,
  TriggerInfo,
  TriggerMessageTypeFilter,
  VBusInfo,
} from '../../lib/device'
import {
  checkForFirmwareUpdate,
  fetchGitHubReleases,
  isFirmwareUpdatePromptSuppressed,
  loadFirmwareUpdateChannel,
  normalizeGitHubFirmwareReleases,
  selectReleaseForChannel,
  parseFirmwareVersion,
  saveFirmwareUpdateChannel,
  suppressFirmwareUpdatePrompt,
  type FirmwareRelease,
  type FirmwareUpdateChannel,
} from '../../lib/firmware'
import { loadRackDocument, saveRackDocument } from '../../lib/rack/loadRack'
import { openPreferredDRPDTransport } from '../../lib/transport/drpdUsb'
import WinUSBTransport from '../../lib/transport/winusb'
import { DRPDWorkerServiceClient } from '../../lib/device/drpd/worker'
import drpdLogoDark from '../../assets/drpd-logo-dark.svg'
import drpdLogoLight from '../../assets/drpd-logo-light.svg'
import type {
  RackDefinition,
  RackDeviceRecord,
  RackDocument,
  RackInstrument,
} from '../../lib/rack/types'
import {
  RackRenderer,
  type RackDeviceState,
  type RackInstrumentDragPayload,
} from './RackRenderer'
import { getRackCanvasSize } from './rackCanvasSize'
import {
  canInsertInstrumentIntoRow,
  insertInstrumentIntoRowAtIndex,
} from './layout'
import { getSupportedDevices } from './deviceCatalog'
import { getSupportedInstruments } from './instrumentCatalog'
import { useRackSizingConfig } from './rackSizing'
import { matchRackShortcut } from './shortcuts'
import { applyRecordConfigToRuntime } from './applyRecordConfigToRuntime'
import { Menu, type MenuItem } from '../../ui/overlays'
import { FirmwareUpdateDialog } from './overlays/firmware/FirmwareUpdateDialog'
import { VbusConfigurePopover } from './overlays/vbus/VbusConfigurePopover'
import { prepareVbusConfigureDialog } from './overlays/vbus/vbusConfigureDialogState'
import { TriggerConfigurePopover } from './overlays/trigger/TriggerConfigurePopover'
import { SinkRequestPopover } from './overlays/sink/SinkRequestPopover'
import {
  MessageLogClearPopover,
  MessageLogConfigurePopover,
} from './overlays/usbPdLog/LogActionPopovers'
import { MessageLogFilterPopover } from './overlays/usbPdLog/MessageLogFilterPopover'
import {
  toggleFilterValue,
  type FilterOption,
  type MessageLogFilters,
} from './overlays/usbPdLog/usbPdLogFilters'
import styles from './RackView.module.css'

type ThemeMode = 'system' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'drpd:theme'
const FIRMWARE_RELEASE_OWNER = 'T76-org'
const FIRMWARE_RELEASE_REPO = 'drpd'
const UPDATER_RECONNECT_TIMEOUT_MS = 10_000
const UPDATER_RECONNECT_POLL_MS = 250
const UPDATER_READ_TIMEOUT_MS = 15_000
const UPDATER_WRITE_TIMEOUT_MS = 5_000
const WINUSB_INTERFACE_CLASS = 0xff
const WINUSB_INTERFACE_SUBCLASS = 0x01
const WINUSB_INTERFACE_PROTOCOL = 0x02
const CONSOLE_LOG_END_TS_US = (2n ** 63n) - 1n
const EMPTY_PAIRED_DEVICES: RackDeviceRecord[] = []
const HEADER_VBUS_DISPLAY_UPDATE_RATE_HZ = 3
const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
const MIN_CAPTURED_MESSAGE_BUFFER = 100
const MAX_CAPTURED_MESSAGE_BUFFER = 1_000_000
const GOODCRC_MESSAGE_TYPE_LABEL = 'GoodCRC'
const EMPTY_MESSAGE_LOG_FILTERS: MessageLogFilters = {
  messageTypes: { include: [], exclude: [] },
  senders: { include: [], exclude: [] },
  receivers: { include: [], exclude: [] },
  sopTypes: { include: [], exclude: [] },
  crcValid: { include: [], exclude: [] },
}

interface DRPDLogsConsoleHelper {
  devices(): Array<{ id: string; name: string; status: string }>
  driver(deviceId?: string): DRPDDriverRuntime
  diagnostics(deviceId?: string): Promise<unknown>
  loggingConfig(deviceId?: string): DRPDLoggingConfig
  setStorageBackend(mode: 'auto' | 'memory', deviceId?: string): Promise<DRPDLoggingConfig>
  count(kind?: 'analog' | 'messages' | 'all', deviceId?: string): Promise<unknown>
  queryAnalog(
    query?: { last?: number; startTimestampUs?: bigint; endTimestampUs?: bigint },
    deviceId?: string,
  ): Promise<unknown>
  queryMessage(
    query?: { last?: number; startTimestampUs?: bigint; endTimestampUs?: bigint },
    deviceId?: string,
  ): Promise<unknown>
  queryMessages(
    query?: { last?: number; startTimestampUs?: bigint; endTimestampUs?: bigint },
    deviceId?: string,
  ): Promise<unknown>
  selection(deviceId?: string): Promise<unknown>
  selectedMessages(deviceId?: string): Promise<unknown>
  decodeMessage(entry: unknown, deviceId?: string): Promise<unknown>
  decodeSelectedMessages(deviceId?: string): Promise<unknown>
  export(request: unknown, deviceId?: string): Promise<unknown>
  clear(scope: unknown, deviceId?: string): Promise<unknown>
  help(): string
}

type RackConsoleWindow = Window &
  typeof globalThis & {
    __drpdLogs?: DRPDLogsConsoleHelper
  }

/**
 * Runtime details for a connected device.
 */
interface DeviceRuntime {
  ///< Active DRPD driver instance, if available.
  drpdDriver?: DRPDDriverRuntime
  ///< Active transport-like runtime, if available.
  transport?: { close(): Promise<void> }
  ///< Underlying WebUSB device.
  usbDevice?: USBDevice
}

type FirmwareUploadPhase =
  | 'prompt'
  | 'downloading'
  | 'rebooting'
  | 'waiting'
  | 'uploading'
  | 'success'
  | 'failure'

interface FirmwareUpdatePromptState {
  deviceRecordId: string
  currentVersion: string
  targetRelease: FirmwareRelease
  phase: FirmwareUploadPhase
  suppressVersion: boolean
  progress: number
  statusMessage: string
  errorMessage?: string
  selectedDeviceInfo?: SelectedDeviceInfo
  firmwareImage?: Uint8Array
}

type SelectedDeviceInfo = {
  vendorId: number
  productId: number
  serialNumber: string | null
  productName: string | null
}

interface HeaderVbusDisplayMeasurements {
  vbusVoltage: number | null
  vbusCurrent: number | null
}

interface HeaderVbusPendingAverage {
  voltageSum: number
  currentSum: number
  sampleCount: number
}

const identifyRackDeviceRuntime = async (
  runtime: DeviceRuntime | null | undefined,
): Promise<DeviceIdentity | null> => {
  const driver = runtime?.drpdDriver
  if (!driver) {
    return null
  }
  if ('system' in driver && driver.system && typeof driver.system.identify === 'function') {
    return await driver.system.identify()
  }
  return null
}

const identifyRackDeviceRuntimeForFirmwareUpdate = async (
  runtime: DeviceRuntime | null | undefined,
): Promise<DeviceIdentity | null> => {
  try {
    const identity = await identifyRackDeviceRuntime(runtime)
    console.info(
      `[firmware-update] identity firmware=${identity?.firmwareVersion ?? 'unknown'} serial=${identity?.serialNumber || 'unknown'}`,
    )
    return identity
  } catch (error) {
    console.warn(
      `[firmware-update] failed to read device identity: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

const mergeRackDeviceIdentity = (
  record: RackDeviceRecord,
  identity: DeviceIdentity | null,
): RackDeviceRecord => {
  if (!identity) {
    return record
  }
  return {
    ...record,
    deviceSerialNumber: identity.serialNumber || record.deviceSerialNumber,
    firmwareVersion: identity.firmwareVersion || record.firmwareVersion,
  }
}

const resolveDeviceLoggingConfig = (record: RackDeviceRecord): DRPDLoggingConfig => {
  const source = record.config
  if (!source || typeof source !== 'object') {
    return buildDefaultLoggingConfig()
  }
  const probe = source as { logging?: Partial<DRPDLoggingConfig> }
  return normalizeLoggingConfig(probe.logging)
}

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

const truncateHeaderMetric = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) {
    return null
  }
  return Math.trunc(value * 100) / 100
}

const formatHeaderMetric = (value: number | null | undefined): string => {
  const truncatedValue = truncateHeaderMetric(value)
  if (truncatedValue == null) {
    return '--'
  }
  return truncatedValue.toFixed(2)
}

const formatHeaderAccumulatorMetric = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(2)
}

const formatHeaderProtectionThreshold = (
  value: number | null | undefined,
  divisor: number,
  unit: string,
): { text: { ghost: string; value: string }; unit: string } => {
  if (value == null || !Number.isFinite(value)) {
    return { text: { ghost: '', value: '--' }, unit }
  }
  const formattedValue = (value / divisor).toFixed(2)
  const paddedValue = formattedValue.padStart(5, '0')
  return {
    text: {
      ghost: paddedValue.slice(0, paddedValue.length - formattedValue.length),
      value: formattedValue,
    },
    unit,
  }
}

const formatHeaderAccumulatorMetricWithGhostZeros = (
  value: number | null | undefined,
): { ghost: string; value: string } => {
  const formattedValue = formatHeaderAccumulatorMetric(value)
  if (formattedValue === '--') {
    return { ghost: '', value: formattedValue }
  }
  const paddedValue = formattedValue.padStart(6, '0')
  return {
    ghost: paddedValue.slice(0, paddedValue.length - formattedValue.length),
    value: formattedValue,
  }
}

const HeaderGhostValue = ({
  text,
}: {
  text: { ghost: string; value: string }
}) => (
  <>
    <span className={styles.headerVbusGhostZeros}>{text.ghost}</span>
    {text.value}
  </>
)

const HeaderAccumulatorValue = ({
  text,
  unit,
}: {
  text: { ghost: string; value: string }
  unit: string
}) => (
  <span className={styles.headerVbusAccumulatorValue}>
    <span className={styles.headerVbusAccumulatorNumber}>
      <HeaderGhostValue text={text} />
    </span>
    <span className={styles.headerVbusAccumulatorUnit}>{unit}</span>
  </span>
)

const HeaderProtectionValue = ({
  value,
}: {
  value: { text: { ghost: string; value: string }; unit: string }
}) => (
  <span className={styles.headerVbusProtectionValue}>
    <span className={styles.headerVbusProtectionNumber}>
      <HeaderGhostValue text={value.text} />
    </span>
    <span className={styles.headerVbusProtectionUnit}>{value.unit}</span>
  </span>
)

const formatHeaderMetricWithGhostZeros = (
  value: number | null | undefined,
  width: number,
): { ghost: string; value: string } => {
  const formattedValue = formatHeaderMetric(value)
  if (formattedValue === '--') {
    return { ghost: '', value: formattedValue }
  }
  const paddedValue = formattedValue.padStart(width, '0')
  return {
    ghost: paddedValue.slice(0, paddedValue.length - formattedValue.length),
    value: formattedValue,
  }
}

const resolveHeaderCurrentFlow = (
  role: CCBusRole | null,
  current: number | null,
): {
  kind: 'flow'
  from: string
  to: string
  direction: 'right' | 'left'
  toPort: boolean
  toBananaPort: boolean
} | { kind: 'text'; text: string } => {
  if (role !== CCBusRole.OBSERVER && role !== CCBusRole.SINK) {
    return { kind: 'text', text: '—' }
  }
  if (role === CCBusRole.OBSERVER && current === 0) {
    return { kind: 'text', text: 'IDLE' }
  }
  if (current == null || current === 0) {
    return { kind: 'text', text: '—' }
  }
  if (role === CCBusRole.OBSERVER) {
    return {
      kind: 'flow',
      from: '1',
      to: '2',
      direction: current > 0 ? 'right' : 'left',
      toPort: true,
      toBananaPort: false,
    }
  }
  if (current < 0) {
    return { kind: 'text', text: '—' }
  }
  return {
    kind: 'flow',
    from: '1',
    to: 'B',
    direction: 'right',
    toPort: false,
    toBananaPort: true,
  }
}

const formatHeaderRoleLabel = (role: CCBusRole | null): string => {
  if (!role) {
    return '--'
  }
  switch (role) {
    case CCBusRole.DISABLED:
      return 'Disabled'
    case CCBusRole.OBSERVER:
      return 'Observer'
    case CCBusRole.SINK:
      return 'Sink'
    default:
      return '--'
  }
}

const formatHeaderRoleStatusLabel = (status: CCBusRoleStatus | null): string => {
  if (!status) {
    return '--'
  }
  switch (status) {
    case CCBusRoleStatus.UNATTACHED:
      return 'Unattached'
    case CCBusRoleStatus.SOURCE_FOUND:
      return 'Source Found'
    case CCBusRoleStatus.ATTACHED:
      return 'Attached'
    default:
      return '--'
  }
}

const formatHeaderSinkPdoType = (pdo: SinkPdo | null | undefined): string => {
  if (!pdo) {
    return '—'
  }
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return 'Fixed'
    case SinkPdoType.SPR_PPS:
      return 'PPS'
    case SinkPdoType.SPR_AVS:
    case SinkPdoType.EPR_AVS:
      return 'AVS'
    case SinkPdoType.VARIABLE:
      return 'Variable'
    case SinkPdoType.BATTERY:
      return 'Battery'
    case SinkPdoType.AUGMENTED:
      return 'Augmented'
    default:
      return '—'
  }
}

const formatHeaderCompactNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '--'
  }
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)
}

const formatHeaderElapsed = (elapsedUs: bigint | null | undefined): string => {
  if (elapsedUs == null) {
    return '--:--:--'
  }
  const totalSeconds = Number(elapsedUs / 1_000_000n)
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--:--:--'
  }
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':')
}

const formatHeaderSinkContract = (sinkInfo: SinkInfo | null): string => {
  if (
    !sinkInfo ||
    !Number.isFinite(sinkInfo.negotiatedVoltageMv) ||
    !Number.isFinite(sinkInfo.negotiatedCurrentMa)
  ) {
    return '—'
  }
  const voltageV = sinkInfo.negotiatedVoltageMv / 1000
  const currentA = sinkInfo.negotiatedCurrentMa / 1000
  return `${formatHeaderCompactNumber(voltageV)}V @ ${formatHeaderCompactNumber(currentA)}A`
}

const formatHeaderTriggerStatus = (value: TriggerInfo['status'] | null | undefined): string => {
  switch (value) {
    case TriggerStatus.IDLE:
      return 'Idle'
    case TriggerStatus.ARMED:
      return 'Armed'
    case TriggerStatus.TRIGGERED:
      return 'Triggered'
    default:
      return '--'
  }
}

const formatHeaderTriggerCount = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return Math.trunc(value).toString()
}

const buildHeaderVbusDisplayMeasurements = (
  analogMonitor: AnalogMonitorChannels | null | undefined,
): HeaderVbusDisplayMeasurements => ({
  vbusVoltage:
    analogMonitor && Number.isFinite(analogMonitor.vbus) ? analogMonitor.vbus : null,
  vbusCurrent:
    analogMonitor && Number.isFinite(analogMonitor.ibus) ? analogMonitor.ibus : null,
})

const isLoggedCapturedMessageLike = (value: unknown): value is LoggedCapturedMessage => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const probe = value as Partial<LoggedCapturedMessage>
  return (
    (probe.entryKind === 'message' || probe.entryKind === 'event') &&
    typeof probe.startTimestampUs === 'bigint' &&
    typeof probe.endTimestampUs === 'bigint' &&
    typeof probe.createdAtMs === 'number' &&
    probe.rawSop instanceof Uint8Array &&
    probe.rawDecodedData instanceof Uint8Array
  )
}

const countMessageLogFilters = (filters: MessageLogFilters): number =>
  Object.values(filters).reduce(
    (count, rule) => count + rule.include.length + rule.exclude.length,
    0,
  )

const uniqueLogOptions = (values: string[]): FilterOption[] =>
  Array.from(new Set(values.filter((value) => value.length > 0 && value !== '--')))
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }))

const getLogMessageTypeLabel = (row: LoggedCapturedMessage): string => {
  if (row.entryKind === 'event') {
    return 'Event'
  }
  if (row.messageType == null) {
    return 'Unknown'
  }
  return String(row.messageType)
}

const getLogSenderLabel = (row: LoggedCapturedMessage): string =>
  row.entryKind === 'message' && row.senderPowerRole ? row.senderPowerRole : 'Unknown'

const getLogReceiverLabel = (row: LoggedCapturedMessage): string =>
  row.entryKind === 'message' && row.senderPowerRole
    ? row.senderPowerRole === 'SOURCE'
      ? 'Sink'
      : 'Source'
    : 'Unknown'

const getLogSopLabel = (row: LoggedCapturedMessage): string =>
  row.entryKind === 'message' && typeof row.sopKind === 'string' ? row.sopKind : 'Unknown'

const getLogCrcLabel = (row: LoggedCapturedMessage): string => {
  if (row.entryKind !== 'message') {
    return 'Unknown'
  }
  return String(row.decodeResult) === 'crc_mismatch' ? 'Invalid' : 'Valid'
}

const buildMessageLogFilterOptions = (
  rows: LoggedCapturedMessage[],
  filters: MessageLogFilters,
): {
  messageTypes: FilterOption[]
  senders: FilterOption[]
  receivers: FilterOption[]
  sopTypes: FilterOption[]
  crcValid: FilterOption[]
} => {
  const messageRows = rows.filter((row) => row.entryKind === 'message')
  return {
    messageTypes: uniqueLogOptions([
      ...messageRows.map(getLogMessageTypeLabel),
      ...filters.messageTypes.include,
      ...filters.messageTypes.exclude,
    ]),
    senders: uniqueLogOptions([
      ...messageRows.map(getLogSenderLabel),
      ...filters.senders.include,
      ...filters.senders.exclude,
    ]),
    receivers: uniqueLogOptions([
      ...messageRows.map(getLogReceiverLabel),
      ...filters.receivers.include,
      ...filters.receivers.exclude,
    ]),
    sopTypes: uniqueLogOptions([
      ...messageRows.map(getLogSopLabel),
      ...filters.sopTypes.include,
      ...filters.sopTypes.exclude,
    ]),
    crcValid: uniqueLogOptions([
      ...messageRows.map(getLogCrcLabel),
      ...filters.crcValid.include,
      ...filters.crcValid.exclude,
    ]),
  }
}

const downloadMessageLogPayload = (payload: string, mimeType: string, filename: string): void => {
  const blob = new Blob([payload], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const toCsvField = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value

const buildSelectedMessageLogJson = (
  rows: LoggedCapturedMessage[],
  selectionKeys: string[],
): string => {
  const selected = new Set(selectionKeys)
  return JSON.stringify(
    rows.filter((row) => selected.has(buildCapturedLogSelectionKey(row))),
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  )
}

const buildSelectedMessageLogCsv = (
  rows: LoggedCapturedMessage[],
  selectionKeys: string[],
): string => {
  const selected = new Set(selectionKeys)
  const lines = [['Type', 'Message Type', 'Sender', 'Receiver', 'SOP', 'CRC'].join(',')]
  for (const row of rows) {
    if (!selected.has(buildCapturedLogSelectionKey(row))) {
      continue
    }
    lines.push(
      [
        row.entryKind,
        getLogMessageTypeLabel(row),
        getLogSenderLabel(row),
        getLogReceiverLabel(row),
        getLogSopLabel(row),
        getLogCrcLabel(row),
      ].map(toCsvField).join(','),
    )
  }
  return `${lines.join('\n')}\n`
}

const notifyMessageLogFiltersChanged = (filters: MessageLogFilters): void => {
  window.dispatchEvent(
    new CustomEvent('drpd-message-log-filters-changed', {
      detail: { filters },
    }),
  )
}

const parseSinkField = (value: string): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const isPowerLimitedSinkPdo = (pdo: SinkPdo | null | undefined): boolean => (
  pdo?.type === SinkPdoType.BATTERY ||
  pdo?.type === SinkPdoType.SPR_AVS ||
  pdo?.type === SinkPdoType.EPR_AVS
)

const buildDefaultSinkForm = (
  pdo: SinkPdo | null | undefined,
): { voltageV: string; currentA: string } => {
  if (!pdo) {
    return { voltageV: '', currentA: '' }
  }
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return { voltageV: pdo.voltageV.toFixed(2), currentA: pdo.maxCurrentA.toFixed(2) }
    case SinkPdoType.VARIABLE:
    case SinkPdoType.AUGMENTED:
    case SinkPdoType.SPR_PPS:
      return { voltageV: pdo.minVoltageV.toFixed(2), currentA: pdo.maxCurrentA.toFixed(2) }
    case SinkPdoType.BATTERY:
    case SinkPdoType.SPR_AVS:
    case SinkPdoType.EPR_AVS:
      return { voltageV: pdo.minVoltageV.toFixed(2), currentA: (pdo.maxPowerW / pdo.minVoltageV).toFixed(2) }
    default:
      return { voltageV: '', currentA: '' }
  }
}

const getSinkCurrentConstraints = (
  pdo: SinkPdo | null | undefined,
  requestedVoltageV: number | null,
): { minA: number; maxA?: number; error?: string } => {
  if (!pdo) {
    return { minA: 0, error: 'Select a PDO before requesting power.' }
  }
  if (pdo.type === SinkPdoType.FIXED) {
    return { minA: 0, maxA: pdo.maxCurrentA }
  }
  if (
    pdo.type === SinkPdoType.VARIABLE ||
    pdo.type === SinkPdoType.AUGMENTED ||
    pdo.type === SinkPdoType.SPR_PPS
  ) {
    return { minA: 0, maxA: pdo.maxCurrentA }
  }
  if (isPowerLimitedSinkPdo(pdo)) {
    if (requestedVoltageV == null || !Number.isFinite(requestedVoltageV)) {
      return { minA: 0, error: 'Enter a valid voltage to compute the current range.' }
    }
    if (requestedVoltageV <= 0) {
      return { minA: 0, error: 'Voltage must be greater than 0 V.' }
    }
    if ('maxPowerW' in pdo) {
      return { minA: 0, maxA: pdo.maxPowerW / requestedVoltageV }
    }
  }
  return { minA: 0, error: 'Unsupported PDO type.' }
}

const getSinkVoltageHint = (pdo: SinkPdo | null | undefined): string => {
  if (!pdo) {
    return '--'
  }
  if (pdo.type === SinkPdoType.FIXED) {
    return ''
  }
  return `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`
}

const buildSinkRequestArgs = ({
  pdo,
  voltageV,
  currentA,
}: {
  pdo: Exclude<SinkPdo, null>
  voltageV: string
  currentA: string
}): { voltageMv?: number; currentMa?: number; error?: string } => {
  const parsedCurrent = parseSinkField(currentA)
  if (parsedCurrent == null) {
    return { error: 'Enter a valid current.' }
  }
  if (pdo.type === SinkPdoType.FIXED) {
    if (parsedCurrent < 0 || parsedCurrent > pdo.maxCurrentA) {
      return { error: `Current must be between 0 and ${pdo.maxCurrentA.toFixed(2)} A.` }
    }
    return { voltageMv: Math.round(pdo.voltageV * 1000), currentMa: Math.round(parsedCurrent * 1000) }
  }

  const parsedVoltage = parseSinkField(voltageV)
  if (parsedVoltage == null) {
    return { error: 'Enter valid voltage and current values.' }
  }
  if (parsedVoltage < pdo.minVoltageV || parsedVoltage > pdo.maxVoltageV) {
    return { error: `Voltage must be between ${pdo.minVoltageV.toFixed(2)} and ${pdo.maxVoltageV.toFixed(2)} V.` }
  }
  const constraints = getSinkCurrentConstraints(pdo, parsedVoltage)
  if (constraints.error || constraints.maxA == null) {
    return { error: constraints.error ?? 'Current range is unavailable.' }
  }
  if (parsedCurrent < constraints.minA || parsedCurrent > constraints.maxA) {
    return {
      error: `Current must be between ${constraints.minA.toFixed(2)} and ${constraints.maxA.toFixed(2)} A.`,
    }
  }
  return { voltageMv: Math.round(parsedVoltage * 1000), currentMa: Math.round(parsedCurrent * 1000) }
}


/**
 * Render the rack view with rack selection and layout rendering.
 */
export const RackView = () => {
  const [rackDocument, setRackDocument] = useState<RackDocument | null>(null)
  const [activeRack, setActiveRack] = useState<RackDefinition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())
  const [firmwareUpdateChannel, setFirmwareUpdateChannel] = useState<FirmwareUpdateChannel>(() =>
    loadFirmwareUpdateChannel(),
  )
  const firmwareUpdateChannelRef = useRef<FirmwareUpdateChannel>(firmwareUpdateChannel)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    getResolvedTheme(getStoredTheme()),
  )
  const [deviceStates, setDeviceStates] = useState<RackDeviceState[]>([])
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [isRackEditMode, setIsRackEditMode] = useState(false)
  const [draggedRackInstrumentId, setDraggedRackInstrumentId] = useState<string | null>(null)
  const [firmwareUpdatePrompt, setFirmwareUpdatePrompt] = useState<FirmwareUpdatePromptState | null>(null)
  const [isGlobalVbusDialogOpen, setIsGlobalVbusDialogOpen] = useState(false)
  const [globalOvpThresholdInput, setGlobalOvpThresholdInput] = useState('')
  const [globalOcpThresholdInput, setGlobalOcpThresholdInput] = useState('')
  const [globalDisplayUpdateRateInput, setGlobalDisplayUpdateRateInput] = useState(HEADER_VBUS_DISPLAY_UPDATE_RATE_HZ.toString())
  const [globalVbusConfigureError, setGlobalVbusConfigureError] = useState<string | null>(null)
  const [isGlobalVbusApplying, setIsGlobalVbusApplying] = useState(false)
  const [isGlobalSinkDialogOpen, setIsGlobalSinkDialogOpen] = useState(false)
  const [globalSinkPdoList, setGlobalSinkPdoList] = useState<SinkPdo[]>([])
  const [globalSinkSelectedIndex, setGlobalSinkSelectedIndex] = useState(0)
  const [globalSinkVoltageV, setGlobalSinkVoltageV] = useState('')
  const [globalSinkCurrentA, setGlobalSinkCurrentA] = useState('')
  const [globalSinkRequestStatus, setGlobalSinkRequestStatus] =
    useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [globalSinkRequestError, setGlobalSinkRequestError] = useState<string | null>(null)
  const [isGlobalTriggerDialogOpen, setIsGlobalTriggerDialogOpen] = useState(false)
  const [globalTriggerEventTypeInput, setGlobalTriggerEventTypeInput] =
    useState<TriggerEventType>(TriggerEventType.OFF)
  const [globalTriggerThresholdInput, setGlobalTriggerThresholdInput] = useState('1')
  const [globalTriggerSenderInput, setGlobalTriggerSenderInput] =
    useState<TriggerSenderFilter>(TriggerSenderFilter.ANY)
  const [globalTriggerAutoRepeatInput, setGlobalTriggerAutoRepeatInput] =
    useState<OnOffState>(OnOffState.OFF)
  const [globalTriggerSyncModeInput, setGlobalTriggerSyncModeInput] =
    useState<TriggerSyncMode>(TriggerSyncMode.PULSE_HIGH)
  const [globalTriggerSyncPulseWidthUsInput, setGlobalTriggerSyncPulseWidthUsInput] = useState('1')
  const [globalTriggerMessageTypeFiltersInput, setGlobalTriggerMessageTypeFiltersInput] =
    useState<TriggerMessageTypeFilter[]>([])
  const [globalTriggerMessageTypeFilterClassInput, setGlobalTriggerMessageTypeFilterClassInput] =
    useState<TriggerMessageTypeFilter['class']>(TriggerMessageTypeFilterClass.CONTROL)
  const [globalTriggerMessageTypeFilterTypeInput, setGlobalTriggerMessageTypeFilterTypeInput] = useState('0')
  const [globalTriggerConfigureError, setGlobalTriggerConfigureError] = useState<string | null>(null)
  const [isGlobalTriggerApplying, setIsGlobalTriggerApplying] = useState(false)
  const [messageLogSelectionKeys, setMessageLogSelectionKeys] = useState<string[]>([])
  const [messageLogFilters, setMessageLogFilters] =
    useState<MessageLogFilters>(EMPTY_MESSAGE_LOG_FILTERS)
  const [messageLogFilterRows, setMessageLogFilterRows] = useState<LoggedCapturedMessage[]>([])
  const [isMessageLogFilterDialogOpen, setIsMessageLogFilterDialogOpen] = useState(false)
  const [isMessageLogClearDialogOpen, setIsMessageLogClearDialogOpen] = useState(false)
  const [isMessageLogConfigureDialogOpen, setIsMessageLogConfigureDialogOpen] = useState(false)
  const [isMessageLogMarking, setIsMessageLogMarking] = useState(false)
  const [isMessageLogClearing, setIsMessageLogClearing] = useState(false)
  const [isMessageLogExporting, setIsMessageLogExporting] = useState(false)
  const [isMessageLogConfiguring, setIsMessageLogConfiguring] = useState(false)
  const [messageLogError, setMessageLogError] = useState<string | null>(null)
  const [messageLogBufferInput, setMessageLogBufferInput] = useState(
    buildDefaultLoggingConfig().maxCapturedMessages.toString(),
  )
  const [messageLogBufferError, setMessageLogBufferError] = useState<string | null>(null)
  const rackDocumentRef = useRef<RackDocument | null>(null)
  const deviceStatesRef = useRef<RackDeviceState[]>([])
  const pairedDevicesRef = useRef<RackDeviceRecord[]>(EMPTY_PAIRED_DEVICES)
  const firmwareUpdateActiveRef = useRef(false)
  const rackSizing = useRackSizingConfig()

  const deviceDefinitions = useMemo<Device[]>(() => getSupportedDevices(), [])
  const instrumentDefinitions = useMemo(() => getSupportedInstruments(), [])
  const pairedDevices = rackDocument?.pairedDevices ?? EMPTY_PAIRED_DEVICES
  const activeConnectedDeviceState = useMemo(
    () => deviceStates.find((state) => state.status === 'connected'),
    [deviceStates],
  )
  const activeDeviceRecord = activeConnectedDeviceState?.record

  useEffect(() => {
    let isMounted = true

    /**
     * Load the rack JSON and update state when ready.
     */
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const document = await loadRackDocument()
        if (!isMounted) {
          return
        }
        setRackDocument(document)
        setActiveRack(document.racks[0] ?? null)
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        const message =
          loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    /** Apply the current theme to the document. */
    const root = document.documentElement
    if (theme !== 'system') {
      root.setAttribute('data-theme', theme)
      setResolvedTheme(theme)
    } else {
      const mediaQuery = getSystemThemeMediaQuery()
      if (!mediaQuery) {
        root.removeAttribute('data-theme')
        setResolvedTheme('light')
      } else {
        const applySystemTheme = () => {
          const nextTheme = mediaQuery.matches ? 'dark' : 'light'
          root.setAttribute('data-theme', nextTheme)
          setResolvedTheme(nextTheme)
        }
        applySystemTheme()
        const cleanup = listenToMediaQueryChange(mediaQuery, applySystemTheme)
        const storage = getThemeStorage()
        if (storage) {
          storage.setItem(THEME_STORAGE_KEY, theme)
        }
        return cleanup
      }
    }
    const storage = getThemeStorage()
    if (storage) {
      storage.setItem(THEME_STORAGE_KEY, theme)
    }
  }, [theme])

  useEffect(() => {
    saveFirmwareUpdateChannel(firmwareUpdateChannel)
    firmwareUpdateChannelRef.current = firmwareUpdateChannel
  }, [firmwareUpdateChannel])

  useEffect(() => {
    rackDocumentRef.current = rackDocument
  }, [rackDocument])

  useEffect(() => {
    deviceStatesRef.current = deviceStates
  }, [deviceStates])

  useEffect(() => {
    pairedDevicesRef.current = pairedDevices
  }, [pairedDevices])

  useEffect(() => {
    const consoleWindow = window as RackConsoleWindow
    const normalizeWindowQuery = (query?: {
      last?: number
      startTimestampUs?: bigint
      endTimestampUs?: bigint
    }) => {
      const last = Math.max(1, Math.floor(query?.last ?? 20))
      return {
        last,
        startTimestampUs: query?.startTimestampUs ?? 0n,
        endTimestampUs: query?.endTimestampUs ?? CONSOLE_LOG_END_TS_US,
      }
    }
    const resolveDriver = (deviceId?: string): DRPDDriverRuntime => {
      const connected = deviceStatesRef.current.filter(
        (state) => state.status === 'connected' && state.drpdDriver,
      )
      if (connected.length === 0) {
        throw new Error('No connected DRPD devices.')
      }
      if (deviceId) {
        const match = connected.find((state) => state.record.id === deviceId)
        if (!match?.drpdDriver) {
          throw new Error(`Connected DRPD device not found: ${deviceId}`)
        }
        return match.drpdDriver
      }
      if (connected.length > 1) {
        const ids = connected.map((state) => state.record.id).join(', ')
        throw new Error(`Multiple connected DRPD devices. Pass a deviceId. Available: ${ids}`)
      }
      return connected[0].drpdDriver as DRPDDriverRuntime
    }
    const resolveConnectedState = (deviceId?: string): RackDeviceState => {
      const connected = deviceStatesRef.current.filter(
        (state) => state.status === 'connected' && state.drpdDriver,
      )
      if (connected.length === 0) {
        throw new Error('No connected DRPD devices.')
      }
      if (deviceId) {
        const match = connected.find((state) => state.record.id === deviceId)
        if (!match?.drpdDriver) {
          throw new Error(`Connected DRPD device not found: ${deviceId}`)
        }
        return match
      }
      if (connected.length > 1) {
        const ids = connected.map((state) => state.record.id).join(', ')
        throw new Error(`Multiple connected DRPD devices. Pass a deviceId. Available: ${ids}`)
      }
      return connected[0]
    }

    const helper: DRPDLogsConsoleHelper = {
      devices: () =>
        deviceStatesRef.current
          .filter((state) => state.drpdDriver)
          .map((state) => ({
            id: state.record.id,
            name: state.record.displayName,
            status: state.status,
          })),
      driver: (deviceId) => resolveDriver(deviceId),
      diagnostics: async (deviceId) => {
        const driver = resolveDriver(deviceId)
        if (!('getLoggingDiagnostics' in driver) || typeof driver.getLoggingDiagnostics !== 'function') {
          return {
            backend: 'unknown',
            persistent: false,
            sqlite: false,
            opfs: false,
            loggingStarted: false,
            loggingConfigured: false,
          }
        }
        return await driver.getLoggingDiagnostics()
      },
      loggingConfig: (deviceId) => {
        const state = resolveConnectedState(deviceId)
        return resolveDeviceLoggingConfig(state.record)
      },
      setStorageBackend: async (mode, deviceId) => {
        const state = resolveConnectedState(deviceId)
        const currentDocument = rackDocumentRef.current
        if (!currentDocument) {
          throw new Error('Rack document not loaded.')
        }
        let updatedRecord: RackDeviceRecord | null = null
        const nextDevices = pairedDevicesRef.current.map((device) => {
          if (device.id !== state.record.id) {
            return device
          }
          const source =
            device.config && typeof device.config === 'object'
              ? (device.config as { logging?: Partial<DRPDLoggingConfig> })
              : {}
          updatedRecord = {
            ...device,
            config: {
              ...source,
              logging: normalizeLoggingConfig({
                ...source.logging,
                storageBackend: mode,
              }),
            },
          }
          return updatedRecord
        })
        if (!updatedRecord) {
          throw new Error(`Rack device not found: ${state.record.id}`)
        }
        const driver = state.drpdDriver
        if (!driver) {
          throw new Error(`DRPD driver not available: ${state.record.id}`)
        }
        const nextDocument = replacePairedDevices(currentDocument, nextDevices)
        setRackDocument(nextDocument)
        saveRackDocument(nextDocument)
        pairedDevicesRef.current = nextDevices
        rackDocumentRef.current = nextDocument
        setDeviceStates((states) =>
          states.map((entry) =>
            entry.record.id === state.record.id
              ? { ...entry, record: updatedRecord as RackDeviceRecord }
              : entry,
          ),
        )
        await driver.configureLogging(resolveDeviceLoggingConfig(updatedRecord))
        return resolveDeviceLoggingConfig(
          deviceStatesRef.current.find((entry) => entry.record.id === state.record.id)?.record ??
            updatedRecord,
        )
      },
      count: async (kind = 'all', deviceId) => {
        const driver = resolveDriver(deviceId)
        if (!('getLogCounts' in driver) || typeof driver.getLogCounts !== 'function') {
          return { analog: 0, messages: 0 }
        }
        const counts = await driver.getLogCounts()
        if (kind === 'analog') {
          return counts.analog
        }
        if (kind === 'messages') {
          return counts.messages
        }
        return counts
      },
      queryAnalog: async (query, deviceId) => {
        const driver = resolveDriver(deviceId)
        const normalized = normalizeWindowQuery(query)
        const rows = await driver.queryAnalogSamples({
          startTimestampUs: normalized.startTimestampUs,
          endTimestampUs: normalized.endTimestampUs,
        })
        return rows.slice(-normalized.last)
      },
      queryMessage: async (query, deviceId) => {
        const driver = resolveDriver(deviceId)
        const normalized = normalizeWindowQuery(query)
        const rows = await driver.queryCapturedMessages({
          startTimestampUs: normalized.startTimestampUs,
          endTimestampUs: normalized.endTimestampUs,
        })
        return rows.slice(-normalized.last)
      },
      queryMessages: async (query, deviceId) => helper.queryMessage(query, deviceId),
      selection: async (deviceId) => {
        const driver = resolveDriver(deviceId)
        if (
          'getLogSelectionState' in driver &&
          typeof driver.getLogSelectionState === 'function'
        ) {
          return await Promise.resolve(driver.getLogSelectionState())
        }
        const state = driver.getState()
        return state.logSelection ?? {
          selectedKeys: [],
          anchorIndex: null,
          activeIndex: null,
        }
      },
      selectedMessages: async (deviceId) => {
        const driver = resolveDriver(deviceId)
        const selection = await helper.selection(deviceId)
        const selectedKeys = Array.isArray((selection as { selectedKeys?: unknown[] }).selectedKeys)
          ? ((selection as { selectedKeys: unknown[] }).selectedKeys.filter(
              (value): value is string => typeof value === 'string',
            ))
          : []
        if (selectedKeys.length === 0) {
          return []
        }
        const rows = await driver.queryCapturedMessages({
          startTimestampUs: 0n,
          endTimestampUs: CONSOLE_LOG_END_TS_US,
          sortOrder: 'asc',
        })
        const selected = new Set(selectedKeys)
        return rows.filter((row) => selected.has(buildCapturedLogSelectionKey(row)))
      },
      decodeMessage: async (entry, deviceId) => {
        const driver = resolveDriver(deviceId)
        let row: LoggedCapturedMessage | undefined
        if (typeof entry === 'string') {
          const rows = await driver.queryCapturedMessages({
            startTimestampUs: 0n,
            endTimestampUs: CONSOLE_LOG_END_TS_US,
            sortOrder: 'asc',
          })
          row = rows.find((candidate) => buildCapturedLogSelectionKey(candidate) === entry)
          if (!row) {
            throw new Error(`Log entry key not found: ${entry}`)
          }
        } else if (isLoggedCapturedMessageLike(entry)) {
          row = entry
        } else {
          throw new Error('decodeMessage(entry): entry must be a row key string or a LoggedCapturedMessage object')
        }
        return decodeLoggedCapturedMessage(row)
      },
      decodeSelectedMessages: async (deviceId) => {
        const rows = await helper.selectedMessages(deviceId)
        if (!Array.isArray(rows)) {
          return []
        }
        return rows
          .filter((row): row is LoggedCapturedMessage => isLoggedCapturedMessageLike(row))
          .map((row) => decodeLoggedCapturedMessage(row))
      },
      export: async (request, deviceId) => {
        const driver = resolveDriver(deviceId)
        return await driver.exportLogs(request as never)
      },
      clear: async (scope, deviceId) => {
        const driver = resolveDriver(deviceId)
        return await driver.clearLogs(scope as never)
      },
      help: () =>
        [
          'window.__drpdLogs.devices()',
          'window.__drpdLogs.driver(deviceId?)',
          'await window.__drpdLogs.diagnostics(deviceId?)',
          'window.__drpdLogs.loggingConfig(deviceId?)',
          'await window.__drpdLogs.setStorageBackend("memory", deviceId?)',
          'await window.__drpdLogs.setStorageBackend("auto", deviceId?)',
          'await window.__drpdLogs.count(kind?, deviceId?) // kind: "analog" | "messages" | "all" (default)',
          'await window.__drpdLogs.queryAnalog({ last: 20, startTimestampUs: 0n, endTimestampUs: 999999n }, deviceId?)',
          'await window.__drpdLogs.queryMessage({ last: 20, startTimestampUs: 0n, endTimestampUs: 999999n }, deviceId?)',
          'await window.__drpdLogs.queryMessages({ last: 20, startTimestampUs: 0n, endTimestampUs: 999999n }, deviceId?) // alias',
          'await window.__drpdLogs.selection(deviceId?)',
          'await window.__drpdLogs.selectedMessages(deviceId?)',
          'await window.__drpdLogs.decodeMessage(entryOrKey, deviceId?)',
          'await window.__drpdLogs.decodeSelectedMessages(deviceId?)',
          'await window.__drpdLogs.export(request, deviceId?)',
          'await window.__drpdLogs.clear(scope, deviceId?)',
        ].join('\n'),
    }

    consoleWindow.__drpdLogs = helper
    return () => {
      if (consoleWindow.__drpdLogs === helper) {
        delete consoleWindow.__drpdLogs
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      void cleanupDeviceRuntimes(deviceStatesRef.current, deviceDefinitions)
    }
  }, [deviceDefinitions])

  const checkConnectedDeviceFirmwareUpdate = useCallback(async (
    record: RackDeviceRecord,
    identity: DeviceIdentity | null,
  ): Promise<void> => {
    const installedFirmwareVersion = identity?.firmwareVersion || record.firmwareVersion
    if (!installedFirmwareVersion) {
      console.info('[firmware-update] decision=no-upgrade installed=unknown candidate=none reason=missing-installed-version')
      return
    }

    let normalizedInstalledFirmwareVersion: string
    try {
      normalizedInstalledFirmwareVersion = parseFirmwareVersion(installedFirmwareVersion).text
    } catch {
      console.info(
        `[firmware-update] decision=no-upgrade installed=${installedFirmwareVersion} candidate=none reason=invalid-installed-version`,
      )
      return
    }

    console.info(`[firmware-update] installed=${normalizedInstalledFirmwareVersion}`)
    try {
      const rawReleases = await fetchGitHubReleases(FIRMWARE_RELEASE_OWNER, FIRMWARE_RELEASE_REPO)
      const releases = normalizeGitHubFirmwareReleases(rawReleases, {
        log: (message) => console.info(`[firmware-update] ${message}`),
      })
      const channel = firmwareUpdateChannelRef.current
      const candidate = selectReleaseForChannel(releases, channel)
      console.info(
        `[firmware-update] channel=${channel} discovered=${releases.length} candidate=${candidate?.versionText ?? 'none'}`,
      )
      const decision = checkForFirmwareUpdate({
        installedFirmwareVersion: normalizedInstalledFirmwareVersion,
        channel,
        releases,
        isPromptSuppressed: isFirmwareUpdatePromptSuppressed,
      })
      if (decision.kind !== 'update-available') {
        console.info(
          `[firmware-update] decision=no-upgrade installed=${normalizedInstalledFirmwareVersion} candidate=${candidate?.versionText ?? 'none'} reason=${decision.reason}`,
        )
        return
      }
      console.info(
        `[firmware-update] decision=upgrade installed=${decision.installedVersionText} target=${decision.release.versionText} channel=${channel}`,
      )
      setFirmwareUpdatePrompt({
        deviceRecordId: record.id,
        currentVersion: decision.installedVersionText,
        targetRelease: decision.release,
        phase: 'prompt',
        suppressVersion: false,
        progress: 0,
        statusMessage: 'A newer firmware version is available for the connected device.',
      })
    } catch (error) {
      console.warn(
        `[firmware-update] Firmware update check failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }, [])

  useEffect(() => {
    const usb = typeof navigator === 'undefined' ? undefined : navigator.usb
    if (
      !usb ||
      typeof usb.addEventListener !== 'function' ||
      typeof usb.removeEventListener !== 'function'
    ) {
      return
    }

    const handleUsbDisconnect = (event: Event) => {
      const usbEvent = event as USBConnectionEvent
      const disconnectedDevice = usbEvent.device
      if (!disconnectedDevice) {
        return
      }

      const connectedState = deviceStatesRef.current.find(
        (state) =>
          state.status === 'connected' &&
          doesRackDeviceRecordMatchUsbDevice(state.record, disconnectedDevice),
      )
      if (!connectedState) {
        return
      }

      void disconnectDeviceRuntime(connectedState, deviceDefinitions)
      setDeviceStates((states) =>
        states.map((state) =>
          state.record.id === connectedState.record.id
            ? buildDisconnectedDeviceState(state.record)
            : state,
        ),
      )
    }

    const handleUsbConnect = (event: Event) => {
      const usbEvent = event as USBConnectionEvent
      const connectedDevice = usbEvent.device
      if (!connectedDevice) {
        return
      }
      if (firmwareUpdateActiveRef.current) {
        console.info(`[firmware-update] ignoring USB connect during updater handoff device=${describeUsbDevice(connectedDevice)}`)
        return
      }
      if (deviceStatesRef.current.some((state) => state.status === 'connected')) {
        return
      }

      const matchedState = deviceStatesRef.current.find(
        (state) =>
          state.status !== 'connected' &&
          doesRackDeviceRecordMatchUsbDevice(state.record, connectedDevice),
      )
      if (!matchedState) {
        return
      }
      const definition = deviceDefinitions.find(
        (candidate) => candidate.identifier === matchedState.record.identifier,
      )
      if (!definition) {
        return
      }
      void reconnectRackDeviceRecord({
        record: matchedState.record,
        definition,
        device: connectedDevice,
        onUpdate: setDeviceStates,
        onPersistRecord: (nextRecord) => {
          setRackDocument((current) => {
            if (!current) {
              return current
            }
            const nextDocument = upsertPairedDeviceDocument(current, nextRecord)
            saveRackDocument(nextDocument)
            return nextDocument
          })
        },
        onError: setDeviceError,
        onFirmwareUpdateCheck: checkConnectedDeviceFirmwareUpdate,
      })
    }

    usb.addEventListener('connect', handleUsbConnect)
    usb.addEventListener('disconnect', handleUsbDisconnect)
    return () => {
      usb.removeEventListener('connect', handleUsbConnect)
      usb.removeEventListener('disconnect', handleUsbDisconnect)
    }
  }, [deviceDefinitions, checkConnectedDeviceFirmwareUpdate])

  useEffect(() => {
    void autoConnectDevices({
      devices: pairedDevices,
      definitions: deviceDefinitions,
      existingStates: deviceStatesRef.current,
      onUpdate: setDeviceStates,
      onPersistDevices: (nextDevices) => {
        setRackDocument((current) => {
          if (!current) {
            return current
          }
          const nextDocument = replacePairedDevices(current, nextDevices)
          saveRackDocument(nextDocument)
          return nextDocument
        })
      },
      onError: setDeviceError,
      onFirmwareUpdateCheck: checkConnectedDeviceFirmwareUpdate,
    })
  }, [pairedDevices, deviceDefinitions, checkConnectedDeviceFirmwareUpdate])

  const currentRack = activeRack
  const activeDriver = activeConnectedDeviceState?.drpdDriver
  const activeDriverState = activeDriver?.getState()
  const rackInstrumentMap = useMemo(() => {
    const map = new Map(
      instrumentDefinitions.map((instrument) => [instrument.identifier, instrument]),
    )
    const drpdVbusInstrument = map.get('com.mta.drpd.vbus')
    if (drpdVbusInstrument && !map.has('com.mta.drpd.device-status')) {
      map.set('com.mta.drpd.device-status', drpdVbusInstrument)
    }
    return map
  }, [instrumentDefinitions])
  const hasSelectedMessages = messageLogSelectionKeys.length > 0
  const isCaptureEnabled = activeDriverState?.captureEnabled === OnOffState.ON
  const isGoodCrcShown = !messageLogFilters.messageTypes.exclude.includes(GOODCRC_MESSAGE_TYPE_LABEL)
  const isGoodCrcHidden = !isGoodCrcShown
  const messageLogFilterOptions = useMemo(
    () => buildMessageLogFilterOptions(messageLogFilterRows, messageLogFilters),
    [messageLogFilterRows, messageLogFilters],
  )
  const isFirmwareUploadBusy =
    firmwareUpdatePrompt != null &&
    !['prompt', 'success', 'failure'].includes(firmwareUpdatePrompt.phase)

  const updateRackDocument = useCallback((updater: (document: RackDocument) => RackDocument) => {
    setRackDocument((current) => {
      if (!current) {
        return current
      }
      const nextDocument = updater(current)
      saveRackDocument(nextDocument)
      const nextActiveRack =
        nextDocument.racks.find((rack) => rack.id === activeRack?.id) ??
        nextDocument.racks[0] ??
        null
      setActiveRack(nextActiveRack)
      return nextDocument
    })
  }, [activeRack?.id])

  const handleExportRack = useCallback(() => {
    const document = rackDocumentRef.current ?? rackDocument
    if (!document) {
      return
    }
    downloadMessageLogPayload(
      JSON.stringify(document, null, 2),
      'application/json',
      'drpd-rack.json',
    )
  }, [rackDocument])

  const handleRemoveRackInstrument = useCallback((instrumentId: string) => {
    updateRackDocument((document) => ({
      ...document,
      racks: document.racks.map((rack) => {
        if (rack.id !== activeRack?.id) {
          return rack
        }
        return {
          ...rack,
          rows: rack.rows
            .map((row) => ({
              ...row,
              instruments: row.instruments.filter((instrument) => instrument.id !== instrumentId),
            }))
            .filter((row) => row.instruments.length > 0),
        }
      }),
    }))
  }, [activeRack?.id, updateRackDocument])

  const handleRackInstrumentDrop = useCallback((payload: RackInstrumentDragPayload) => {
    if (!draggedRackInstrumentId) {
      return
    }
    updateRackDocument((document) => ({
      ...document,
      racks: document.racks.map((rack) => {
        if (rack.id !== activeRack?.id) {
          return rack
        }
        return moveRackInstrument(rack, draggedRackInstrumentId, payload, rackInstrumentMap)
      }),
    }))
  }, [activeRack?.id, draggedRackInstrumentId, rackInstrumentMap, updateRackDocument])

  const exportSelectedMessageLog = useCallback((format: 'json' | 'csv') => {
    if (!activeDriver || !hasSelectedMessages) {
      return
    }
    setIsMessageLogExporting(true)
    setMessageLogError(null)
    void activeDriver
      .queryCapturedMessages({
        startTimestampUs: 0n,
        endTimestampUs: LOG_END_TIMESTAMP_US,
        sortOrder: 'asc',
      })
      .then((rows) => {
        if (format === 'json') {
          downloadMessageLogPayload(
            buildSelectedMessageLogJson(rows, messageLogSelectionKeys),
            'application/json',
            'message-log-export.json',
          )
          return
        }
        downloadMessageLogPayload(
          buildSelectedMessageLogCsv(rows, messageLogSelectionKeys),
          'text/csv',
          'message-log-export.csv',
        )
      })
      .catch((error) => {
        setMessageLogError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        setIsMessageLogExporting(false)
      })
  }, [activeDriver, hasSelectedMessages, messageLogSelectionKeys])

  const toggleGoodCrcMessages = useCallback(() => {
    const next = isGoodCrcShown
      ? toggleFilterValue(
          messageLogFilters,
          'messageTypes',
          'exclude',
          GOODCRC_MESSAGE_TYPE_LABEL,
        )
      : {
          ...messageLogFilters,
          messageTypes: {
            include: messageLogFilters.messageTypes.include,
            exclude: messageLogFilters.messageTypes.exclude.filter(
              (entry) => entry !== GOODCRC_MESSAGE_TYPE_LABEL,
            ),
          },
        }
    setMessageLogFilters(next)
    notifyMessageLogFiltersChanged(next)
  }, [isGoodCrcShown, messageLogFilters])

  const addMessageLogMarker = useCallback(() => {
    if (!activeDriver || isMessageLogMarking) {
      return
    }
    setIsMessageLogMarking(true)
    setMessageLogError(null)
    void activeDriver
      .markLog()
      .catch((error) => {
        setMessageLogError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        setIsMessageLogMarking(false)
      })
  }, [activeDriver, isMessageLogMarking])

  const updateFirmwarePromptState = useCallback((patch: Partial<FirmwareUpdatePromptState>) => {
    setFirmwareUpdatePrompt((current) => current ? { ...current, ...patch } : current)
  }, [])

  useEffect(() => {
    if (!activeDriver) {
      setMessageLogSelectionKeys([])
      setMessageLogFilterRows([])
      return
    }

    const readSelection = () => {
      void Promise.resolve(activeDriver.getLogSelectionState()).then((selection) => {
        setMessageLogSelectionKeys(
          Array.isArray(selection.selectedKeys) ? selection.selectedKeys : [],
        )
      })
    }

    readSelection()
    void activeDriver
      .queryCapturedMessages({
        startTimestampUs: 0n,
        endTimestampUs: LOG_END_TIMESTAMP_US,
        sortOrder: 'asc',
      })
      .then(setMessageLogFilterRows)
      .catch(() => setMessageLogFilterRows([]))

    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const changed = Array.isArray(detail?.changed) ? detail.changed : []
      if (changed.includes('logSelection')) {
        readSelection()
      }
    }

    activeDriver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    return () => {
      activeDriver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [activeDriver])

  const handleDeclineFirmwareUpdate = useCallback(() => {
    const prompt = firmwareUpdatePrompt
    if (!prompt || isFirmwareUploadBusy) {
      return
    }
    if (prompt.suppressVersion) {
      suppressFirmwareUpdatePrompt(prompt.targetRelease.versionText)
      console.info(`[firmware-update] suppressed target=${prompt.targetRelease.versionText}`)
    }
    setFirmwareUpdatePrompt(null)
  }, [firmwareUpdatePrompt, isFirmwareUploadBusy])

  const handleAcceptFirmwareUpdate = useCallback(async () => {
    const prompt = firmwareUpdatePrompt
    if (!prompt || isFirmwareUploadBusy) {
      return
    }

    let updaterTransport: WinUSBTransport | null = null
    firmwareUpdateActiveRef.current = true
    try {
      console.info(`[firmware-update] upload start target=${prompt.targetRelease.versionText}`)
      let selectedInfo = prompt.selectedDeviceInfo
      let image = prompt.firmwareImage
      if (!selectedInfo) {
        const connectedState = deviceStatesRef.current.find(
          (state) => state.record.id === prompt.deviceRecordId && state.status === 'connected',
        )
        if (!connectedState?.drpdDriver || !connectedState.usbDevice) {
          throw new Error('Connected device is no longer available.')
        }

        selectedInfo = {
          vendorId: connectedState.usbDevice.vendorId,
          productId: connectedState.usbDevice.productId,
          serialNumber: connectedState.usbDevice.serialNumber ?? null,
          productName: connectedState.usbDevice.productName ?? null,
        }
        updateFirmwarePromptState({ selectedDeviceInfo: selectedInfo })

        updateFirmwarePromptState({
          phase: 'downloading',
          progress: 0,
          errorMessage: undefined,
          statusMessage: 'Downloading firmware...',
        })
        image = await downloadFirmwareAsset(prompt.targetRelease.asset)
        updateFirmwarePromptState({ firmwareImage: image })

        await disconnectDeviceRuntime(connectedState, deviceDefinitions)
        DRPDWorkerServiceClient.resetShared('firmware update handoff')
        console.info('[firmware-update] worker reset before updater handoff')
        setDeviceStates((states) =>
          states.map((state) =>
            state.record.id === connectedState.record.id
              ? buildDisconnectedDeviceState(state.record)
              : state,
          ),
        )
        updateFirmwarePromptState({
          phase: 'rebooting',
          statusMessage: 'Requesting firmware updater...',
        })
        await requestFirmwareUpdater(connectedState.usbDevice)
      } else if (!image) {
        updateFirmwarePromptState({
          phase: 'downloading',
          progress: 0,
          errorMessage: undefined,
          statusMessage: 'Downloading firmware...',
        })
        image = await downloadFirmwareAsset(prompt.targetRelease.asset)
        updateFirmwarePromptState({ firmwareImage: image })
      } else {
        updateFirmwarePromptState({
          progress: 0,
          errorMessage: undefined,
        })
      }

      updateFirmwarePromptState({
        phase: 'waiting',
        statusMessage: 'Waiting for firmware updater...',
      })
      DRPDWorkerServiceClient.resetShared('firmware update updater open')
      await sleep(100)
      const updater = await waitForUpdaterTransport(selectedInfo)
      updaterTransport = updater.transport

      updateFirmwarePromptState({
        phase: 'uploading',
        progress: 0,
        statusMessage: 'Uploading firmware...',
      })
      await uploadDRPDFirmwareUF2(updaterTransport, image, {
        onProgress: ({ bytesWritten, totalLength }) => {
          updateFirmwarePromptState({
            progress: totalLength > 0 ? bytesWritten / totalLength : 0,
            statusMessage: `Uploading firmware (${Math.round(totalLength > 0 ? (bytesWritten / totalLength) * 100 : 0)}%)...`,
          })
          console.info(`[firmware-update] upload progress ${bytesWritten}/${totalLength}`)
        },
      })
      console.info(`[firmware-update] upload success target=${prompt.targetRelease.versionText}`)
      updateFirmwarePromptState({
        phase: 'success',
        progress: 1,
        statusMessage: 'Firmware upload complete. The device should reboot into the updated application.',
      })
    } catch (error) {
      console.warn(`[firmware-update] upload failed: ${error instanceof Error ? error.message : String(error)}`)
      updateFirmwarePromptState({
        phase: 'failure',
        errorMessage: error instanceof Error ? error.message : String(error),
        statusMessage: 'Firmware update failed.',
      })
    } finally {
      await updaterTransport?.close().catch(() => undefined)
      firmwareUpdateActiveRef.current = false
    }
  }, [deviceDefinitions, firmwareUpdatePrompt, isFirmwareUploadBusy, updateFirmwarePromptState])

  /** Open DRPD documentation in a new tab. */
  const handleOpenDocumentation = () => {
    window.open('https://t76.org/drpd/help', '_blank', 'noopener,noreferrer')
  }

  /** Connect a new device using the WebUSB picker. */
  const handleConnectDevice = async () => {
    setDeviceError(null)
    if (typeof navigator === 'undefined' || !navigator.usb) {
      setDeviceError('WebUSB is not available in this browser.')
      return
    }
    try {
      const filters = buildUSBFilters(deviceDefinitions)
      const selected = await navigator.usb.requestDevice({ filters })
      const matches = findMatchingDevices(deviceDefinitions, selected)
      const verified = await verifyMatchingDevices(matches, selected)
      const deviceDefinition = verified[0] ?? matches[0]
      if (!deviceDefinition) {
        setDeviceError('No matching device definition found.')
        return
      }

      const baseRecord = buildRackDeviceRecord(deviceDefinition, selected)
      const shouldConnectNow = !deviceStatesRef.current.some((state) => state.status === 'connected')

      if (shouldConnectNow) {
        const runtime = await connectDeviceRuntime(deviceDefinition, selected)
        const identity = await identifyRackDeviceRuntimeForFirmwareUpdate(runtime)
        const record = stampDeviceConnection(mergeRackDeviceIdentity(baseRecord, identity))
        await applyRecordConfigToRuntime(record, runtime)
        void checkConnectedDeviceFirmwareUpdate(record, identity)
        setDeviceStates((states) =>
          upsertDeviceState(states, buildRackDeviceState(record, runtime)),
        )
        setRackDocument((current) => {
          if (!current) {
            return current
          }
          const nextDocument = upsertPairedDeviceDocument(current, record)
          saveRackDocument(nextDocument)
          return nextDocument
        })
        return
      }

      setDeviceStates((states) => upsertDeviceState(states, buildDisconnectedDeviceState(baseRecord)))
      setRackDocument((current) => {
        if (!current) {
          return current
        }
        const nextDocument = upsertPairedDeviceDocument(current, baseRecord)
        saveRackDocument(nextDocument)
        return nextDocument
      })
    } catch (connectError) {
      if (isUserCancelError(connectError)) {
        return
      }
      const message =
        connectError instanceof Error ? connectError.message : String(connectError)
      setDeviceError(message)
    }
  }

  /** Connect a paired device without opening the WebUSB picker. */
  const handleConnectPairedDevice = async (recordId: string) => {
    const record = pairedDevices.find((device) => device.id === recordId)
    if (!record) {
      return
    }
    const definition = deviceDefinitions.find(
      (candidate) => candidate.identifier === record.identifier,
    )
    if (!definition) {
      setDeviceError('No matching device definition found.')
      return
    }
    await reconnectRackDeviceRecord({
      record,
      definition,
      onUpdate: setDeviceStates,
      onPersistRecord: (nextRecord) => {
        setRackDocument((current) => {
          if (!current) {
            return current
          }
          const nextDocument = upsertPairedDeviceDocument(current, nextRecord)
          saveRackDocument(nextDocument)
          return nextDocument
        })
      },
      onError: setDeviceError,
      onFirmwareUpdateCheck: checkConnectedDeviceFirmwareUpdate,
    })
  }

  /** Disconnect a device without removing it from the rack. */
  const handleDisconnectDevice = async (recordId: string) => {
    setDeviceError(null)
    const existingState = deviceStates.find((state) => state.record.id === recordId)
    if (!existingState || existingState.status !== 'connected') {
      return
    }
    await disconnectDeviceRuntime(existingState, deviceDefinitions)
    setDeviceStates((states) =>
      upsertDeviceState(states, buildDisconnectedDeviceState(existingState.record)),
    )
  }

  /** Remove a device record from the rack. */
  const handleRemoveDevice = async (recordId: string) => {
    if (!rackDocument) {
      return
    }
    const record = pairedDevices.find((device) => device.id === recordId)
    if (!record) {
      return
    }
    const shouldRemove = window.confirm(
      `Remove ${record.displayName} from the rack?`,
    )
    if (!shouldRemove) {
      return
    }
    const existingState = deviceStates.find((state) => state.record.id === recordId)
    if (
      existingState &&
      (existingState.status === 'connected' ||
        existingState.transport ||
        existingState.drpdDriver)
    ) {
      await disconnectDeviceRuntime(existingState, deviceDefinitions)
    }
    const nextDevices = pairedDevices.filter((device) => device.id !== recordId)
    const nextDocument = replacePairedDevices(rackDocument, nextDevices)
    setRackDocument(nextDocument)
    saveRackDocument(nextDocument)
    setDeviceStates((states) =>
      states.filter((state) => state.record.id !== recordId),
    )
  }

  const handleSetProtectionThresholds = useCallback(async () => {
    const driver = deviceStatesRef.current.find((state) => state.status === 'connected' && state.drpdDriver)?.drpdDriver
    if (!driver) {
      return
    }
    prepareVbusConfigureDialog({
      vbusInfo: driver.getState().vbusInfo ?? null,
      displayUpdateRateHz: HEADER_VBUS_DISPLAY_UPDATE_RATE_HZ,
      setConfigureError: setGlobalVbusConfigureError,
      setOvpThresholdInput: setGlobalOvpThresholdInput,
      setOcpThresholdInput: setGlobalOcpThresholdInput,
      setDisplayUpdateRateInput: setGlobalDisplayUpdateRateInput,
    })
    setIsGlobalVbusDialogOpen(true)
  }, [])

  const handleResetProtection = useCallback(async () => {
    const driver = deviceStatesRef.current.find((state) => state.status === 'connected' && state.drpdDriver)?.drpdDriver
    if (!driver) {
      return
    }
    try {
      await driver.vbus.resetFault()
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const handleResetPowerChargeMeter = useCallback(async () => {
    const driver = deviceStatesRef.current.find((state) => state.status === 'connected' && state.drpdDriver)?.drpdDriver
    if (!driver) {
      return
    }
    try {
      await driver.analogMonitor.resetAccumulatedMeasurements()
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const handleResetTrigger = useCallback(async () => {
    const driver = deviceStatesRef.current.find((state) => state.status === 'connected' && state.drpdDriver)?.drpdDriver
    if (!driver) {
      return
    }
    try {
      await driver.trigger.reset()
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const openGlobalSinkRequestDialog = useCallback(async () => {
    const driver = deviceStatesRef.current.find((state) => state.status === 'connected' && state.drpdDriver)?.drpdDriver
    if (!driver) {
      return
    }
    const snapshot = driver.getState()
    let pdoList = snapshot.sinkPdoList ?? []
    try {
      if (pdoList.length === 0) {
        const pdoCount = await driver.sink.getAvailablePdoCount()
        pdoList = await Promise.all(
          Array.from({ length: pdoCount }, (_, index) => driver.sink.getPdoAtIndex(index)),
        )
      }
    } catch (error) {
      setGlobalSinkRequestError(error instanceof Error ? error.message : String(error))
    }
    const selectedIndex = 0
    const selectedPdo = pdoList[selectedIndex] ?? null
    const defaults = buildDefaultSinkForm(selectedPdo)
    setGlobalSinkPdoList(pdoList)
    setGlobalSinkSelectedIndex(selectedIndex)
    setGlobalSinkVoltageV(defaults.voltageV)
    setGlobalSinkCurrentA(defaults.currentA)
    setGlobalSinkRequestStatus('idle')
    setGlobalSinkRequestError(null)
    setIsGlobalSinkDialogOpen(true)
  }, [])

  const openGlobalTriggerConfigureDialog = useCallback(async () => {
    const driver = deviceStatesRef.current.find((state) => state.status === 'connected' && state.drpdDriver)?.drpdDriver
    if (!driver) {
      return
    }
    const populate = (info: TriggerInfo | null | undefined) => {
      setGlobalTriggerEventTypeInput(info?.type ?? TriggerEventType.OFF)
      setGlobalTriggerThresholdInput(String(info?.eventThreshold ?? 1))
      setGlobalTriggerSenderInput(info?.senderFilter ?? TriggerSenderFilter.ANY)
      setGlobalTriggerAutoRepeatInput(info?.autorepeat ?? OnOffState.OFF)
      setGlobalTriggerSyncModeInput(info?.syncMode ?? TriggerSyncMode.PULSE_HIGH)
      setGlobalTriggerSyncPulseWidthUsInput(String(info?.syncPulseWidthUs ?? 1))
      setGlobalTriggerMessageTypeFiltersInput(info?.messageTypeFilters ?? [])
      setGlobalTriggerMessageTypeFilterClassInput(TriggerMessageTypeFilterClass.CONTROL)
      setGlobalTriggerMessageTypeFilterTypeInput('0')
    }
    setGlobalTriggerConfigureError(null)
    populate(driver.getState().triggerInfo)
    setIsGlobalTriggerDialogOpen(true)
    try {
      populate(await driver.trigger.getInfo())
    } catch (error) {
      setGlobalTriggerConfigureError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    if (!isGlobalSinkDialogOpen) {
      return
    }
    const defaults = buildDefaultSinkForm(globalSinkPdoList[globalSinkSelectedIndex] ?? null)
    setGlobalSinkVoltageV(defaults.voltageV)
    setGlobalSinkCurrentA(defaults.currentA)
    setGlobalSinkRequestStatus('idle')
    setGlobalSinkRequestError(null)
  }, [globalSinkPdoList, globalSinkSelectedIndex, isGlobalSinkDialogOpen])

  const handleUpdateDeviceConfig = useCallback(async (
    deviceRecordId: string,
    updater: (current: Record<string, unknown> | undefined) => Record<string, unknown>,
  ) => {
    if (!rackDocument) {
      return
    }

    let updatedRecord: RackDeviceRecord | null = null
    const nextDevices = pairedDevices.map((device) => {
      if (device.id !== deviceRecordId) {
        return device
      }
      updatedRecord = {
        ...device,
        config: updater(device.config),
      }
      return updatedRecord
    })
    if (!updatedRecord) {
      return
    }

    const nextDocument = replacePairedDevices(rackDocument, nextDevices)
    setRackDocument(nextDocument)
    saveRackDocument(nextDocument)

    setDeviceStates((states) =>
      states.map((state) =>
        state.record.id === deviceRecordId
          ? { ...state, record: updatedRecord as RackDeviceRecord }
          : state,
      ),
    )

    const connectedState = deviceStatesRef.current.find(
      (state) => state.record.id === deviceRecordId && state.status === 'connected' && state.drpdDriver,
    )
    if (!connectedState?.drpdDriver) {
      return
    }

    try {
      await connectedState.drpdDriver.configureLogging(resolveDeviceLoggingConfig(updatedRecord))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDeviceError(message)
    }
  }, [pairedDevices, rackDocument])

  const handleSetActiveDeviceRole = useCallback(async (
    nextRole: CCBusRole,
    options?: { persist?: boolean },
  ) => {
    const persist = options?.persist ?? true
    const state = deviceStatesRef.current.find(
      (entry) => entry.status === 'connected' && entry.drpdDriver,
    )
    if (!state?.drpdDriver) {
      return
    }

    try {
      await state.drpdDriver.ccBus.setRole(nextRole)
      if (persist) {
        await handleUpdateDeviceConfig(state.record.id, (current) => {
          const source = current && typeof current === 'object' ? current : {}
          return {
            ...source,
            role: nextRole,
            ...(nextRole === CCBusRole.SINK ? {} : { sinkRequest: undefined }),
          }
        })
      }
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    }
  }, [handleUpdateDeviceConfig])

  const handleToggleActiveDeviceCapture = useCallback(async () => {
    const state = deviceStatesRef.current.find(
      (entry) => entry.status === 'connected' && entry.drpdDriver,
    )
    if (!state?.drpdDriver) {
      return
    }

    const currentCaptureState = state.drpdDriver.getState().captureEnabled
    const nextCaptureState =
      currentCaptureState === OnOffState.ON ? OnOffState.OFF : OnOffState.ON

    try {
      await state.drpdDriver.setCaptureEnabled(nextCaptureState)
      await handleUpdateDeviceConfig(state.record.id, (current) => {
        const source = current && typeof current === 'object' ? current : {}
        return {
          ...source,
          captureEnabled: nextCaptureState,
        }
      })
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    }
  }, [handleUpdateDeviceConfig])

  const handlePulseUsbConnection = useCallback(async () => {
    const state = deviceStatesRef.current.find(
      (entry) => entry.status === 'connected' && entry.drpdDriver,
    )
    const driver = state?.drpdDriver
    const previousRole = driver?.getState().role ?? null
    if (!driver || !previousRole || previousRole === CCBusRole.DISABLED) {
      return
    }

    try {
      await driver.ccBus.setRole(CCBusRole.DISABLED)
      await sleep(1000)
      await driver.ccBus.setRole(previousRole)
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const shortcutId = matchRackShortcut(event)
      if (!shortcutId) {
        return
      }

      event.preventDefault()
      switch (shortcutId) {
        case 'toggle-usb-connection':
          void handlePulseUsbConnection()
          break
        case 'switch-sink':
          void handleSetActiveDeviceRole(CCBusRole.SINK)
          break
        case 'switch-observer':
          void handleSetActiveDeviceRole(CCBusRole.OBSERVER)
          break
        case 'switch-disabled':
          void handleSetActiveDeviceRole(CCBusRole.DISABLED)
          break
        case 'choose-power-contract':
          if (activeDriverState?.role === CCBusRole.SINK) {
            void openGlobalSinkRequestDialog()
          }
          break
        case 'toggle-capture':
          void handleToggleActiveDeviceCapture()
          break
        case 'reset-accumulator':
          void handleResetPowerChargeMeter()
          break
        case 'clear-log':
          setIsMessageLogClearDialogOpen(true)
          break
        case 'add-marker':
          addMessageLogMarker()
          break
        case 'toggle-goodcrc':
          toggleGoodCrcMessages()
          break
        case 'filter-log':
          setIsMessageLogFilterDialogOpen(true)
          break
        case 'reset-trigger':
          void handleResetTrigger()
          break
        case 'open-user-manual':
          handleOpenDocumentation()
          break
        default:
          break
      }
    }

    document.addEventListener('keydown', handleGlobalShortcut)
    return () => {
      document.removeEventListener('keydown', handleGlobalShortcut)
    }
  }, [
    addMessageLogMarker,
    handleOpenDocumentation,
    handlePulseUsbConnection,
    handleResetPowerChargeMeter,
    handleResetTrigger,
    handleSetActiveDeviceRole,
    handleToggleActiveDeviceCapture,
    activeDriverState?.role,
    openGlobalSinkRequestDialog,
    toggleGoodCrcMessages,
  ])

  const rackCanvasWidthPx = currentRack
    ? getRackCanvasSize(currentRack, instrumentDefinitions, rackSizing).rackWidthPx
    : null
  const headerLogoSrc = resolvedTheme === 'light' ? drpdLogoLight : drpdLogoDark
  const activeVbusInfo = activeDriverState?.vbusInfo ?? null
  const activeTriggerInfo = activeDriverState?.triggerInfo ?? null
  const globalSelectedSinkPdo = globalSinkPdoList[globalSinkSelectedIndex] ?? null
  const globalSinkParsedVoltage = parseSinkField(
    globalSelectedSinkPdo?.type === SinkPdoType.FIXED
      ? globalSelectedSinkPdo.voltageV.toFixed(2)
      : globalSinkVoltageV,
  )
  const globalSinkCurrentConstraints =
    getSinkCurrentConstraints(globalSelectedSinkPdo, globalSinkParsedVoltage)
  const globalSinkRequestPreview = globalSelectedSinkPdo
    ? buildSinkRequestArgs({
        pdo: globalSelectedSinkPdo,
        voltageV: globalSinkVoltageV,
        currentA: globalSinkCurrentA,
      })
    : { error: 'Select a PDO before requesting power.' }
  const globalSinkCanSubmit =
    !!activeDriver &&
    globalSelectedSinkPdo != null &&
    activeDriverState?.role === CCBusRole.SINK &&
    globalSinkRequestStatus !== 'sending' &&
    !globalSinkRequestPreview.error
  const globalSinkCurrentRangeLabel = globalSinkCurrentConstraints.maxA == null
    ? '--'
    : `0.00-${globalSinkCurrentConstraints.maxA.toFixed(2)} A`
  const isProtectionTriggered =
    activeVbusInfo?.status === VBusStatus.OVP || activeVbusInfo?.status === VBusStatus.OCP
  const isTriggerActivated = activeTriggerInfo?.status === TriggerStatus.TRIGGERED
  const isSinkMode = activeDriverState?.role === CCBusRole.SINK
  const timeSinceMeterReset = formatHeaderElapsed(activeDriverState?.analogMonitor?.accumulationElapsedTimeUs)
  const menuBarMenus = useMemo<Array<{ id: string; label: string; items: MenuItem[] }>>(() => {
    const deviceItems: MenuItem[] = [
      {
        id: 'pair-new-device',
        label: 'Pair new device...',
        onSelect: () => {
          void handleConnectDevice()
        },
      },
      {
        id: 'device-separator',
        type: 'separator',
      },
      ...(pairedDevices.length > 0
        ? pairedDevices.map((record) => {
            const state = deviceStates.find((entry) => entry.record.id === record.id)
            const isConnected = state?.status === 'connected'
            return {
              id: `paired-device-${record.id}`,
              type: 'submenu' as const,
              label: record.displayName,
              items: [
                {
                  id: `paired-device-${record.id}-firmware`,
                  label: `Firmware version: ${record.firmwareVersion ?? 'Unknown'}`,
                  disabled: true,
                  onSelect: () => undefined,
                },
                {
                  id: `paired-device-${record.id}-separator`,
                  type: 'separator' as const,
                },
                {
                  id: `paired-device-${record.id}-connection`,
                  label: isConnected ? 'Disconnect' : 'Connect',
                  onSelect: () => {
                    if (isConnected) {
                      void handleDisconnectDevice(record.id)
                      return
                    }
                    void handleConnectPairedDevice(record.id)
                  },
                },
                {
                  id: `paired-device-${record.id}-unpair`,
                  label: 'Unpair',
                  destructive: true,
                  onSelect: () => {
                    void handleRemoveDevice(record.id)
                  },
                },
              ],
            } satisfies MenuItem
          })
        : [
            {
              id: 'no-paired-devices',
              label: 'No paired devices',
              disabled: true,
              onSelect: () => undefined,
            } satisfies MenuItem,
          ]),
    ]

    return [
      {
        id: 'rack',
        label: 'Rack',
        items: [
          {
            id: 'rack-edit',
            type: 'checkbox',
            label: 'Edit',
            checked: isRackEditMode,
            disabled: !currentRack,
            onCheckedChange: () => setIsRackEditMode((current) => !current),
          },
          {
            id: 'rack-export',
            label: 'Export',
            disabled: !rackDocument,
            onSelect: handleExportRack,
          },
        ],
      },
      {
        id: 'device',
        label: 'Device',
        items: deviceItems,
      },
      {
        id: 'protection',
        label: 'Protection',
        items: [
          {
            id: 'set-protection-thresholds',
            label: 'Set thresholds...',
            disabled: !activeDriver,
            onSelect: () => {
              void handleSetProtectionThresholds()
            },
          },
          {
            id: 'reset-protection',
            label: 'Reset',
            disabled: !activeDriver || !isProtectionTriggered,
            onSelect: () => {
              void handleResetProtection()
            },
          },
        ],
      },
      {
        id: 'power-charge-meter',
        label: 'Power/Charge Meter',
        items: [
          {
            id: 'reset-power-charge-meter',
            label: 'Reset',
            meta: 'Z',
            disabled: !activeDriver,
            onSelect: () => {
              void handleResetPowerChargeMeter()
            },
          },
          {
            id: 'time-since-reset',
            label: `Time since reset  ${timeSinceMeterReset}`,
            disabled: true,
            onSelect: () => undefined,
          },
        ],
      },
      {
        id: 'mode',
        label: 'Mode',
        items: [
          {
            id: 'set-mode',
            type: 'submenu',
            label: 'Set mode',
            items: [
              {
                id: 'mode-disabled',
                type: 'checkbox',
                label: 'Disabled',
                meta: 'D',
                checked: activeDriverState?.role === CCBusRole.DISABLED,
                disabled: !activeDriver,
                onCheckedChange: () => {
                  void handleSetActiveDeviceRole(CCBusRole.DISABLED)
                },
              },
              {
                id: 'mode-observer',
                type: 'checkbox',
                label: 'Observer',
                meta: 'O',
                checked: activeDriverState?.role === CCBusRole.OBSERVER,
                disabled: !activeDriver,
                onCheckedChange: () => {
                  void handleSetActiveDeviceRole(CCBusRole.OBSERVER)
                },
              },
              {
                id: 'mode-sink',
                type: 'checkbox',
                label: 'Sink',
                meta: 'S',
                checked: activeDriverState?.role === CCBusRole.SINK,
                disabled: !activeDriver,
                onCheckedChange: () => {
                  void handleSetActiveDeviceRole(CCBusRole.SINK)
                },
              },
            ],
          },
          {
            id: 'choose-power-contract',
            label: 'Choose power contract...',
            meta: 'P',
            disabled: !activeDriver || !isSinkMode,
            onSelect: () => {
              void openGlobalSinkRequestDialog()
            },
          },
          {
            id: 'mode-separator-usb-cycle',
            type: 'separator',
          },
          {
            id: 'cycle-usb-connection',
            label: 'Cycle USB Connection',
            meta: 'T',
            disabled: !activeDriver || activeDriverState?.role === CCBusRole.DISABLED,
            onSelect: () => {
              void handlePulseUsbConnection()
            },
          },
        ],
      },
      {
        id: 'logging',
        label: 'Logging',
        items: [
          {
            id: 'logging-toggle-capture',
            label: isCaptureEnabled ? 'Disable Capture' : 'Enable Capture',
            meta: 'C',
            disabled: !activeDriver,
            onSelect: () => {
              void handleToggleActiveDeviceCapture()
            },
          },
          {
            id: 'logging-separator-capture',
            type: 'separator',
          },
          {
            id: 'logging-clear-log',
            label: 'Clear Log',
            meta: 'X',
            disabled: !activeDriver || isMessageLogClearing,
            onSelect: () => setIsMessageLogClearDialogOpen(true),
          },
          {
            id: 'logging-add-marker',
            label: isMessageLogMarking ? 'Adding marker...' : 'Add marker',
            meta: 'M',
            disabled: !activeDriver || isMessageLogMarking,
            onSelect: addMessageLogMarker,
          },
          {
            id: 'logging-export-selected',
            type: 'submenu',
            label: 'Export Selected',
            disabled: !activeDriver || !hasSelectedMessages || isMessageLogExporting,
            items: [
              {
                id: 'logging-export-selected-json',
                label: 'JSON...',
                disabled: !activeDriver || !hasSelectedMessages || isMessageLogExporting,
                onSelect: () => exportSelectedMessageLog('json'),
              },
              {
                id: 'logging-export-selected-csv',
                label: 'CSV...',
                disabled: !activeDriver || !hasSelectedMessages || isMessageLogExporting,
                onSelect: () => exportSelectedMessageLog('csv'),
              },
            ],
          },
          {
            id: 'logging-separator-filters',
            type: 'separator',
          },
          {
            id: 'logging-show-goodcrc',
            type: 'checkbox',
            label: 'Hide GoodCRC Messages',
            meta: 'G',
            checked: isGoodCrcHidden,
            disabled: !activeDriver,
            onCheckedChange: toggleGoodCrcMessages,
          },
          {
            id: 'logging-filter',
            label: countMessageLogFilters(messageLogFilters) > 0
              ? `Filter... (${countMessageLogFilters(messageLogFilters)})`
              : 'Filter...',
            meta: 'F',
            disabled: !activeDriver,
            onSelect: () => setIsMessageLogFilterDialogOpen(true),
          },
          {
            id: 'logging-separator-configure',
            type: 'separator',
          },
          {
            id: 'logging-configure',
            label: 'Configure...',
            disabled: !activeDriver || !activeDeviceRecord || isMessageLogConfiguring,
            onSelect: () => {
              const configured = activeDeviceRecord?.config &&
                typeof activeDeviceRecord.config === 'object'
                ? normalizeLoggingConfig(
                    (activeDeviceRecord.config as { logging?: Partial<DRPDLoggingConfig> }).logging,
                  )
                : buildDefaultLoggingConfig()
              setMessageLogBufferInput(configured.maxCapturedMessages.toString())
              setMessageLogBufferError(null)
              setIsMessageLogConfigureDialogOpen(true)
            },
          },
        ],
      },
      {
        id: 'trigger',
        label: 'Trigger',
        items: [
          {
            id: 'configure-trigger',
            label: 'Configure...',
            disabled: !activeDriver,
            onSelect: () => {
              void openGlobalTriggerConfigureDialog()
            },
          },
          {
            id: 'reset-trigger',
            label: 'Reset',
            meta: 'R',
            disabled: !activeDriver || !isTriggerActivated,
            onSelect: () => {
              void handleResetTrigger()
            },
          },
        ],
      },
      {
        id: 'firmware',
        label: 'Firmware',
        items: [
          {
            id: 'update-firmware',
            label: 'Update firmware...',
            disabled: !firmwareUpdatePrompt || isFirmwareUploadBusy,
            onSelect: () => undefined,
          },
          {
            id: 'firmware-channel',
            type: 'submenu',
            label: 'Update channel',
            items: [
              {
                id: 'firmware-channel-production',
                type: 'checkbox',
                label: 'Production',
                checked: firmwareUpdateChannel === 'production',
                onCheckedChange: () => setFirmwareUpdateChannel('production'),
              },
              {
                id: 'firmware-channel-beta',
                type: 'checkbox',
                label: 'Beta',
                checked: firmwareUpdateChannel === 'beta',
                onCheckedChange: () => setFirmwareUpdateChannel('beta'),
              },
            ],
          },
        ],
      },
      {
        id: 'theme',
        label: 'Theme',
        items: [
          {
            id: 'theme-light',
            type: 'checkbox',
            label: 'Light',
            checked: theme === 'light',
            onCheckedChange: () => setTheme('light'),
          },
          {
            id: 'theme-dark',
            type: 'checkbox',
            label: 'Dark',
            checked: theme === 'dark',
            onCheckedChange: () => setTheme('dark'),
          },
          {
            id: 'theme-system',
            type: 'checkbox',
            label: 'System default',
            checked: theme === 'system',
            onCheckedChange: () => setTheme('system'),
          },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          {
            id: 'user-manual',
            label: 'User manual...',
            meta: '?',
            onSelect: handleOpenDocumentation,
          },
        ],
      },
    ]
  }, [
    activeDriver,
    activeDriverState?.role,
    addMessageLogMarker,
    deviceStates,
    firmwareUpdateChannel,
    firmwareUpdatePrompt,
    exportSelectedMessageLog,
    handleConnectPairedDevice,
    handleDisconnectDevice,
    handleExportRack,
    handleOpenDocumentation,
    handlePulseUsbConnection,
    handleRemoveDevice,
    handleResetPowerChargeMeter,
    handleResetProtection,
    handleResetTrigger,
    handleSetActiveDeviceRole,
    handleSetProtectionThresholds,
    handleToggleActiveDeviceCapture,
    isFirmwareUploadBusy,
    isCaptureEnabled,
    isProtectionTriggered,
    isSinkMode,
    isTriggerActivated,
    hasSelectedMessages,
    isGoodCrcShown,
    isGoodCrcHidden,
    isMessageLogClearing,
    isMessageLogConfiguring,
    isMessageLogExporting,
    isMessageLogMarking,
    isRackEditMode,
    messageLogFilters,
    openGlobalSinkRequestDialog,
    openGlobalTriggerConfigureDialog,
    pairedDevices,
    currentRack,
    rackDocument,
    theme,
    timeSinceMeterReset,
    toggleGoodCrcMessages,
  ])

  return (
    <div className={styles.page}>
      <div className={styles.menuBarViewport}>
        <div className={styles.menuBarScroll}>
          <div
            className={styles.menuBar}
            style={rackCanvasWidthPx ? { width: rackCanvasWidthPx } : undefined}
          >
            {menuBarMenus.map((menu) => (
              <Menu
                key={menu.id}
                label={`${menu.label} menu`}
                align="start"
                items={menu.items}
                trigger={(props) => (
                  <button type="button" className={styles.menuBarButton} {...props}>
                    {menu.label}
                  </button>
                )}
              />
            ))}
          </div>
        </div>
      </div>
      {!currentRack?.hideHeader ? (
        <div className={styles.headerViewport}>
          <div className={styles.headerScroll}>
            <header
              className={styles.header}
              style={rackCanvasWidthPx ? { width: rackCanvasWidthPx } : undefined}
            >
              <div className={styles.titleBlock}>
                <h1 className={styles.title}>
                  <span className={styles.srOnly}>{currentRack?.name ?? 'Rack'}</span>
                  <img className={styles.logo} src={headerLogoSrc} alt="Dr.PD" />
                </h1>
                <HeaderVbusMetrics driver={activeConnectedDeviceState?.drpdDriver} />
              </div>
            </header>
          </div>
        </div>
      ) : null}
      <main className={styles.content}>
        {isLoading ? (
          <div className={styles.notice}>Loading rack...</div>
        ) : null}
        {!isLoading && deviceError ? (
          <div className={`${styles.notice} ${styles.noticeError}`}>
            Device error: {deviceError}
          </div>
        ) : null}
        {!isLoading && error ? (
          <div className={styles.notice}>Error: {error}</div>
        ) : null}
        {!isLoading && !error && currentRack ? (
          <RackRenderer
            rack={currentRack}
            instruments={instrumentDefinitions}
            deviceStates={deviceStates}
            activeDeviceRecord={activeDeviceRecord}
            isEditMode={isRackEditMode}
            onRemoveInstrument={handleRemoveRackInstrument}
            onInstrumentDragStart={setDraggedRackInstrumentId}
            onInstrumentDrop={handleRackInstrumentDrop}
            onInstrumentDragEnd={() => setDraggedRackInstrumentId(null)}
            onUpdateDeviceConfig={handleUpdateDeviceConfig}
          />
        ) : null}
        {!isLoading && !error && rackDocument && !activeRack ? (
          <div className={styles.notice}>No racks available.</div>
        ) : null}
      </main>
      <FirmwareUpdateDialog
        prompt={firmwareUpdatePrompt}
        busy={isFirmwareUploadBusy}
        onOpenChange={(open) => {
          if (!open) {
            setFirmwareUpdatePrompt(null)
          }
        }}
        onSuppressVersionChange={(value) => updateFirmwarePromptState({ suppressVersion: value })}
        onDecline={handleDeclineFirmwareUpdate}
        onAccept={() => {
          void handleAcceptFirmwareUpdate()
        }}
        onRetry={() => {
          void handleAcceptFirmwareUpdate()
        }}
        onDone={() => setFirmwareUpdatePrompt(null)}
      />
      <VbusConfigurePopover
        instrumentId="global-vbus"
        open={isGlobalVbusDialogOpen}
        onOpenChange={setIsGlobalVbusDialogOpen}
        driver={activeDriver}
        vbusInfo={activeVbusInfo}
        ovpThresholdInput={globalOvpThresholdInput}
        ocpThresholdInput={globalOcpThresholdInput}
        displayUpdateRateInput={globalDisplayUpdateRateInput}
        configureError={globalVbusConfigureError}
        isApplyingConfig={isGlobalVbusApplying}
        setOvpThresholdInput={setGlobalOvpThresholdInput}
        setOcpThresholdInput={setGlobalOcpThresholdInput}
        setDisplayUpdateRateInput={setGlobalDisplayUpdateRateInput}
        setConfigureError={setGlobalVbusConfigureError}
        setIsApplyingConfig={setIsGlobalVbusApplying}
        setDisplayUpdateRateHz={() => undefined}
      />
      <SinkRequestPopover
        open={isGlobalSinkDialogOpen}
        onOpenChange={setIsGlobalSinkDialogOpen}
        instrumentId="global-sink-request"
        sinkPdoList={globalSinkPdoList}
        selectedIndex={globalSinkSelectedIndex}
        selectedPdo={globalSelectedSinkPdo}
        isRefreshingSinkData={false}
        voltageV={globalSinkVoltageV}
        currentA={globalSinkCurrentA}
        voltageHint={getSinkVoltageHint(globalSelectedSinkPdo)}
        currentRangeLabel={globalSinkCurrentRangeLabel}
        validationMessage={globalSinkRequestPreview.error ?? null}
        requestErrorMessage={globalSinkRequestError}
        requestStatus={globalSinkRequestStatus}
        canSubmit={globalSinkCanSubmit}
        setSelectedIndex={setGlobalSinkSelectedIndex}
        setVoltageV={setGlobalSinkVoltageV}
        setCurrentA={setGlobalSinkCurrentA}
        setRequestErrorMessage={setGlobalSinkRequestError}
        setRequestStatus={setGlobalSinkRequestStatus}
        onCancel={() => {
          setIsGlobalSinkDialogOpen(false)
          setGlobalSinkRequestError(null)
          setGlobalSinkRequestStatus('idle')
        }}
        onSubmit={() => {
          if (!activeDriver || !globalSelectedSinkPdo) {
            return
          }
          const parsed = buildSinkRequestArgs({
            pdo: globalSelectedSinkPdo,
            voltageV: globalSinkVoltageV,
            currentA: globalSinkCurrentA,
          })
          if (parsed.error || parsed.voltageMv == null || parsed.currentMa == null) {
            setGlobalSinkRequestError(parsed.error ?? 'Invalid request parameters.')
            setGlobalSinkRequestStatus('error')
            return
          }
          setGlobalSinkRequestStatus('sending')
          setGlobalSinkRequestError(null)
          void activeDriver.sink
            .requestPdo(globalSinkSelectedIndex, parsed.voltageMv, parsed.currentMa)
            .then(async () => {
              await activeDriver.refreshState()
              setGlobalSinkRequestStatus('success')
              setIsGlobalSinkDialogOpen(false)
            })
            .catch((error) => {
              setGlobalSinkRequestError(error instanceof Error ? error.message : String(error))
              setGlobalSinkRequestStatus('error')
          })
        }}
      />
      <MessageLogFilterPopover
        open={isMessageLogFilterDialogOpen}
        onOpenChange={setIsMessageLogFilterDialogOpen}
        filters={messageLogFilters}
        options={messageLogFilterOptions}
        onApply={(next) => {
          setMessageLogFilters(next)
          notifyMessageLogFiltersChanged(next)
          if (!activeDriver) {
            return
          }
          void activeDriver
            .queryCapturedMessages({
              startTimestampUs: 0n,
              endTimestampUs: LOG_END_TIMESTAMP_US,
              sortOrder: 'asc',
            })
            .then(setMessageLogFilterRows)
        }}
        onClear={() => {
          setMessageLogFilters(EMPTY_MESSAGE_LOG_FILTERS)
          notifyMessageLogFiltersChanged(EMPTY_MESSAGE_LOG_FILTERS)
        }}
      />
      <MessageLogClearPopover
        open={isMessageLogClearDialogOpen}
        onOpenChange={setIsMessageLogClearDialogOpen}
        clearError={messageLogError}
        isClearing={isMessageLogClearing}
        onCancel={() => {
          setMessageLogError(null)
          setIsMessageLogClearDialogOpen(false)
        }}
        onClear={() => {
          if (!activeDriver) {
            return
          }
          setIsMessageLogClearing(true)
          setMessageLogError(null)
          void activeDriver
            .clearLogs('all')
            .then(() => {
              setMessageLogSelectionKeys([])
              setMessageLogFilterRows([])
              setIsMessageLogClearDialogOpen(false)
            })
            .catch((error) => {
              setMessageLogError(error instanceof Error ? error.message : String(error))
            })
            .finally(() => {
              setIsMessageLogClearing(false)
            })
        }}
      />
      <MessageLogConfigurePopover
        open={isMessageLogConfigureDialogOpen}
        onOpenChange={setIsMessageLogConfigureDialogOpen}
        instrumentId="global-message-log"
        minBuffer={MIN_CAPTURED_MESSAGE_BUFFER}
        maxBuffer={MAX_CAPTURED_MESSAGE_BUFFER}
        bufferInput={messageLogBufferInput}
        bufferError={messageLogBufferError}
        isApplyingBuffer={isMessageLogConfiguring}
        setBufferInput={setMessageLogBufferInput}
        setBufferError={setMessageLogBufferError}
        onCancel={() => {
          setMessageLogBufferError(null)
          setIsMessageLogConfigureDialogOpen(false)
        }}
        onApply={() => {
          if (!activeDeviceRecord) {
            return
          }
          if (!/^\d+$/.test(messageLogBufferInput)) {
            setMessageLogBufferError(
              `Enter an integer value from ${MIN_CAPTURED_MESSAGE_BUFFER} to ${MAX_CAPTURED_MESSAGE_BUFFER}.`,
            )
            return
          }
          const parsed = Number(messageLogBufferInput)
          if (
            !Number.isFinite(parsed) ||
            parsed < MIN_CAPTURED_MESSAGE_BUFFER ||
            parsed > MAX_CAPTURED_MESSAGE_BUFFER
          ) {
            setMessageLogBufferError(
              `Enter an integer value from ${MIN_CAPTURED_MESSAGE_BUFFER} to ${MAX_CAPTURED_MESSAGE_BUFFER}.`,
            )
            return
          }
          setIsMessageLogConfiguring(true)
          setMessageLogBufferError(null)
          void handleUpdateDeviceConfig(activeDeviceRecord.id, (current) => {
            const source = current && typeof current === 'object'
              ? (current as { logging?: Partial<DRPDLoggingConfig> })
              : {}
            return {
              ...source,
              logging: normalizeLoggingConfig({
                ...source.logging,
                maxCapturedMessages: Math.floor(parsed),
              }),
            }
          })
            .then(() => {
              setIsMessageLogConfigureDialogOpen(false)
            })
            .catch((error) => {
              setMessageLogBufferError(error instanceof Error ? error.message : String(error))
            })
            .finally(() => {
              setIsMessageLogConfiguring(false)
            })
        }}
      />
      <TriggerConfigurePopover
        open={isGlobalTriggerDialogOpen}
        onOpenChange={setIsGlobalTriggerDialogOpen}
        instrumentId="global-trigger"
        eventTypeInput={globalTriggerEventTypeInput}
        senderFilterInput={globalTriggerSenderInput}
        messageTypeFiltersInput={globalTriggerMessageTypeFiltersInput}
        messageTypeFilterClassInput={globalTriggerMessageTypeFilterClassInput}
        messageTypeFilterTypeInput={globalTriggerMessageTypeFilterTypeInput}
        eventThresholdInput={globalTriggerThresholdInput}
        autoRepeatInput={globalTriggerAutoRepeatInput}
        syncModeInput={globalTriggerSyncModeInput}
        syncPulseWidthUsInput={globalTriggerSyncPulseWidthUsInput}
        configureError={globalTriggerConfigureError}
        isApplyingConfig={isGlobalTriggerApplying}
        setEventTypeInput={setGlobalTriggerEventTypeInput}
        setSenderFilterInput={setGlobalTriggerSenderInput}
        setMessageTypeFiltersInput={setGlobalTriggerMessageTypeFiltersInput}
        setMessageTypeFilterClassInput={setGlobalTriggerMessageTypeFilterClassInput}
        setMessageTypeFilterTypeInput={setGlobalTriggerMessageTypeFilterTypeInput}
        setEventThresholdInput={setGlobalTriggerThresholdInput}
        setAutoRepeatInput={setGlobalTriggerAutoRepeatInput}
        setSyncModeInput={setGlobalTriggerSyncModeInput}
        setSyncPulseWidthUsInput={setGlobalTriggerSyncPulseWidthUsInput}
        setConfigureError={setGlobalTriggerConfigureError}
        onCancel={() => {
          setGlobalTriggerConfigureError(null)
          setIsGlobalTriggerDialogOpen(false)
        }}
        onApply={() => {
          if (!activeDriver) {
            return
          }
          const parsedThreshold = Number(globalTriggerThresholdInput)
          const parsedPulseWidthUs = Number(globalTriggerSyncPulseWidthUsInput)
          if (!Number.isInteger(parsedThreshold) || parsedThreshold < 1) {
            setGlobalTriggerConfigureError('Threshold must be an integer greater than or equal to 1.')
            return
          }
          if (!Number.isInteger(parsedPulseWidthUs) || parsedPulseWidthUs < 1) {
            setGlobalTriggerConfigureError('Pulse width must be an integer greater than or equal to 1 us.')
            return
          }
          setIsGlobalTriggerApplying(true)
          setGlobalTriggerConfigureError(null)
          void Promise.all([
            activeDriver.trigger.setEventType(globalTriggerEventTypeInput),
            activeDriver.trigger.setEventThreshold(parsedThreshold),
            activeDriver.trigger.setSenderFilter(globalTriggerSenderInput),
            activeDriver.trigger.setAutoRepeat(globalTriggerAutoRepeatInput),
            activeDriver.trigger.setSyncMode(globalTriggerSyncModeInput),
            activeDriver.trigger.setSyncPulseWidthUs(parsedPulseWidthUs),
            activeDriver.trigger.setMessageTypeFilters(globalTriggerMessageTypeFiltersInput),
          ])
            .then(async () => {
              await activeDriver.refreshState()
              setIsGlobalTriggerDialogOpen(false)
            })
            .catch((error) => {
              setGlobalTriggerConfigureError(error instanceof Error ? error.message : String(error))
            })
            .finally(() => {
              setIsGlobalTriggerApplying(false)
            })
        }}
      />
    </div>
  )
}

const HeaderVbusMetrics = ({
  driver,
}: {
  driver?: DRPDDriverRuntime
}) => {
  const [analogMonitor, setAnalogMonitor] = useState<AnalogMonitorChannels | null>(
    driver ? driver.getState().analogMonitor ?? null : null,
  )
  const [role, setRole] = useState<CCBusRole | null>(
    driver ? driver.getState().role ?? null : null,
  )
  const [roleStatus, setRoleStatus] = useState<CCBusRoleStatus | null>(
    driver ? driver.getState().ccBusRoleStatus ?? null : null,
  )
  const [vbusInfo, setVbusInfo] = useState<VBusInfo | null>(
    driver ? driver.getState().vbusInfo ?? null : null,
  )
  const [sinkInfo, setSinkInfo] = useState<SinkInfo | null>(
    driver ? driver.getState().sinkInfo ?? null : null,
  )
  const [triggerInfo, setTriggerInfo] = useState<TriggerInfo | null>(
    driver ? driver.getState().triggerInfo ?? null : null,
  )
  const [displayMeasurements, setDisplayMeasurements] = useState<HeaderVbusDisplayMeasurements>(() =>
    buildHeaderVbusDisplayMeasurements(driver ? driver.getState().analogMonitor ?? null : null),
  )
  const pendingAverageRef = useRef<HeaderVbusPendingAverage>({
    voltageSum: 0,
    currentSum: 0,
    sampleCount: 0,
  })

  useEffect(() => {
    const initialState = driver ? driver.getState() : null
    const initialAnalogMonitor = initialState?.analogMonitor ?? null
    setAnalogMonitor(initialAnalogMonitor)
    setRole(initialState?.role ?? null)
    setRoleStatus(initialState?.ccBusRoleStatus ?? null)
    setVbusInfo(initialState?.vbusInfo ?? null)
    setSinkInfo(initialState?.sinkInfo ?? null)
    setTriggerInfo(initialState?.triggerInfo ?? null)
    setDisplayMeasurements(buildHeaderVbusDisplayMeasurements(initialAnalogMonitor))
    pendingAverageRef.current = {
      voltageSum: 0,
      currentSum: 0,
      sampleCount: 0,
    }
  }, [driver])

  useEffect(() => {
    if (!driver) {
      return
    }

    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const changed = Array.isArray(detail?.changed) ? detail.changed as string[] : null
      if (
        changed &&
        !changed.includes('analogMonitor') &&
        !changed.includes('role') &&
        !changed.includes('ccBusRoleStatus') &&
        !changed.includes('vbusInfo') &&
        !changed.includes('sinkInfo') &&
        !changed.includes('triggerInfo')
      ) {
        return
      }
      const state = driver.getState()
      if (!changed || changed.includes('analogMonitor')) {
        setAnalogMonitor(state.analogMonitor ?? null)
      }
      if (!changed || changed.includes('role')) {
        setRole(state.role ?? null)
      }
      if (!changed || changed.includes('ccBusRoleStatus')) {
        setRoleStatus(state.ccBusRoleStatus ?? null)
      }
      if (!changed || changed.includes('vbusInfo')) {
        setVbusInfo(state.vbusInfo ?? null)
      }
      if (!changed || changed.includes('sinkInfo')) {
        setSinkInfo(state.sinkInfo ?? null)
      }
      if (!changed || changed.includes('triggerInfo')) {
        setTriggerInfo(state.triggerInfo ?? null)
      }
    }

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)

    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [driver])

  useEffect(() => {
    if (!analogMonitor) {
      pendingAverageRef.current = {
        voltageSum: 0,
        currentSum: 0,
        sampleCount: 0,
      }
      setDisplayMeasurements({ vbusVoltage: null, vbusCurrent: null })
      return
    }
    if (!Number.isFinite(analogMonitor.vbus) || !Number.isFinite(analogMonitor.ibus)) {
      return
    }
    pendingAverageRef.current = {
      voltageSum: pendingAverageRef.current.voltageSum + analogMonitor.vbus,
      currentSum: pendingAverageRef.current.currentSum + analogMonitor.ibus,
      sampleCount: pendingAverageRef.current.sampleCount + 1,
    }
  }, [analogMonitor])

  useEffect(() => {
    const periodMs = 1000 / HEADER_VBUS_DISPLAY_UPDATE_RATE_HZ
    const timerId = window.setInterval(() => {
      const pending = pendingAverageRef.current
      if (pending.sampleCount <= 0) {
        return
      }
      setDisplayMeasurements({
        vbusVoltage: pending.voltageSum / pending.sampleCount,
        vbusCurrent: pending.currentSum / pending.sampleCount,
      })
      pendingAverageRef.current = {
        voltageSum: 0,
        currentSum: 0,
        sampleCount: 0,
      }
    }, periodMs)
    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  const vbusVoltage = truncateHeaderMetric(displayMeasurements.vbusVoltage)
  const signedVbusCurrent = truncateHeaderMetric(displayMeasurements.vbusCurrent)
  const displayVbusCurrent =
    role === CCBusRole.SINK && signedVbusCurrent != null && signedVbusCurrent < 0
      ? 0
      : signedVbusCurrent
  const vbusCurrent = displayVbusCurrent == null ? null : Math.abs(displayVbusCurrent)
  const vbusPower =
    vbusVoltage != null && vbusCurrent != null ? vbusVoltage * vbusCurrent : null
  const voltageText = formatHeaderMetricWithGhostZeros(vbusVoltage, 5)
  const currentText = formatHeaderMetricWithGhostZeros(vbusCurrent, 4)
  const powerText = formatHeaderMetricWithGhostZeros(vbusPower, 6)
  const currentFlow = resolveHeaderCurrentFlow(role, signedVbusCurrent)
  const accumulatedChargeAh =
    analogMonitor && Number.isFinite(analogMonitor.accumulatedChargeMah)
      ? analogMonitor.accumulatedChargeMah / 1000
      : null
  const accumulatedEnergyWh =
    analogMonitor && Number.isFinite(analogMonitor.accumulatedEnergyMwh)
      ? analogMonitor.accumulatedEnergyMwh / 1000
      : null
  const accumulatedChargeText = formatHeaderAccumulatorMetricWithGhostZeros(accumulatedChargeAh)
  const accumulatedEnergyText = formatHeaderAccumulatorMetricWithGhostZeros(accumulatedEnergyWh)
  const isChargingIndicatorActive = signedVbusCurrent != null && signedVbusCurrent !== 0
  const accumulationElapsedText = formatHeaderElapsed(analogMonitor?.accumulationElapsedTimeUs)
  const ovpValueText = formatHeaderProtectionThreshold(vbusInfo?.ovpThresholdMv, 1000, 'V')
  const ocpValueText = formatHeaderProtectionThreshold(vbusInfo?.ocpThresholdMa, 1000, 'A')
  const isOvpTriggered = vbusInfo?.status === VBusStatus.OVP
  const isOcpTriggered = vbusInfo?.status === VBusStatus.OCP
  const roleText = formatHeaderRoleLabel(role)
  const roleStatusText = formatHeaderRoleStatusLabel(roleStatus)
  const activeSinkInfo = role === CCBusRole.SINK ? sinkInfo : null
  const sinkTypeText = formatHeaderSinkPdoType(activeSinkInfo?.negotiatedPdo)
  const sinkContractText = formatHeaderSinkContract(activeSinkInfo)
  const triggerStateText = formatHeaderTriggerStatus(triggerInfo?.status)
  const triggerCountText = formatHeaderTriggerCount(triggerInfo?.eventCount)
  const isTriggerStateTriggered = triggerInfo?.status === TriggerStatus.TRIGGERED

  return (
    <div className={styles.headerVbusMetrics} aria-label="VBUS metrics">
      <div className={`${styles.headerVbusMetric} ${styles.headerVbusVoltage}`}>
        <span className={styles.headerVbusNumber}>
          <HeaderGhostValue text={voltageText} />
        </span>
        <span className={styles.headerVbusUnit}>V</span>
      </div>
      <div className={styles.headerVbusDivider} aria-hidden="true" />
      <div className={styles.headerVbusSecondaryGroup}>
        <div className={`${styles.headerVbusMetric} ${styles.headerVbusCurrent}`}>
          <span className={styles.headerVbusNumber}>
            <HeaderGhostValue text={currentText} />
          </span>
          <span className={styles.headerVbusUnit}>A</span>
        </div>
        <div className={styles.headerVbusFlow}>
          {currentFlow.kind === 'flow' ? (
            <>
              <span className={styles.headerVbusFlowEndpoint}>
                <span className={styles.headerVbusUsbCPort} aria-hidden="true" />
                {currentFlow.from}
              </span>
              <span
                className={styles.headerVbusFlowTrack}
                data-direction={currentFlow.direction}
                aria-hidden="true"
              />
              <span className={styles.headerVbusFlowEndpoint}>
                {currentFlow.toBananaPort ? (
                  <span className={styles.headerVbusBananaPort} aria-hidden="true" />
                ) : null}
                {currentFlow.to}
                {currentFlow.toPort ? (
                  <span className={styles.headerVbusUsbCPort} aria-hidden="true" />
                ) : null}
              </span>
            </>
          ) : (
            currentFlow.text
          )}
        </div>
      </div>
      <div className={styles.headerVbusDivider} aria-hidden="true" />
      <div className={styles.headerVbusSecondaryGroup}>
        <div className={`${styles.headerVbusMetric} ${styles.headerVbusPower}`}>
          <span className={styles.headerVbusNumber}>
            <HeaderGhostValue text={powerText} />
          </span>
          <span className={styles.headerVbusUnit}>W</span>
        </div>
        <div className={styles.headerVbusAccumulation}>
          <HeaderAccumulatorValue text={accumulatedChargeText} unit="Ah" />
          <span
            className={styles.headerVbusChargeIndicator}
            data-active={isChargingIndicatorActive ? 'true' : 'false'}
            title={`Time since accumulator reset: ${accumulationElapsedText}`}
            aria-hidden="true"
          />
          <HeaderAccumulatorValue text={accumulatedEnergyText} unit="Wh" />
        </div>
      </div>
      <div className={styles.headerVbusDivider} aria-hidden="true" />
      <div className={styles.headerVbusProtection}>
        <div
          className={styles.headerVbusProtectionCell}
          data-triggered={isOvpTriggered ? 'true' : 'false'}
        >
          <span className={styles.headerVbusProtectionLabel}>OVP</span>
          <HeaderProtectionValue value={ovpValueText} />
        </div>
        <div
          className={styles.headerVbusProtectionCell}
          data-triggered={isOcpTriggered ? 'true' : 'false'}
        >
          <span className={styles.headerVbusProtectionLabel}>OCP</span>
          <HeaderProtectionValue value={ocpValueText} />
        </div>
      </div>
      <div className={styles.headerVbusDivider} aria-hidden="true" />
      <div className={`${styles.headerVbusProtection} ${styles.headerVbusRoleStatus} ${styles.headerVbusSinkContract}`}>
        <div className={styles.headerVbusProtectionCell}>
          <span className={styles.headerVbusProtectionLabel}>ROLE</span>
          <span className={styles.headerVbusRoleStatusValue}>{roleText}</span>
        </div>
        <div className={styles.headerVbusProtectionCell}>
          <span className={styles.headerVbusProtectionLabel}>STATUS</span>
          <span className={styles.headerVbusRoleStatusValue}>{roleStatusText}</span>
        </div>
      </div>
      <div className={styles.headerVbusDivider} aria-hidden="true" />
      <div className={`${styles.headerVbusProtection} ${styles.headerVbusRoleStatus}`}>
        <div className={styles.headerVbusProtectionCell}>
          <span className={styles.headerVbusProtectionLabel}>TYPE</span>
          <span className={styles.headerVbusRoleStatusValue}>{sinkTypeText}</span>
        </div>
        <div className={styles.headerVbusProtectionCell}>
          <span className={styles.headerVbusProtectionLabel}>POWER</span>
          <span className={styles.headerVbusRoleStatusValue}>{sinkContractText}</span>
        </div>
      </div>
      <div className={styles.headerVbusDivider} aria-hidden="true" />
      <div className={`${styles.headerVbusProtection} ${styles.headerVbusRoleStatus}`}>
        <div className={styles.headerVbusProtectionCell}>
          <span className={styles.headerVbusProtectionLabel}>STATE</span>
          <span
            className={styles.headerVbusRoleStatusValue}
            data-alert={isTriggerStateTriggered ? 'true' : 'false'}
          >
            {triggerStateText}
          </span>
        </div>
        <div className={styles.headerVbusProtectionCell}>
          <span className={styles.headerVbusProtectionLabel}>COUNT</span>
          <span className={styles.headerVbusRoleStatusValue}>{triggerCountText}</span>
        </div>
      </div>
    </div>
  )
}

/** Resolve a safe localStorage instance when available. */
const getThemeStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const storage = window.localStorage
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null
  }
  return storage
}

/** Read the saved theme preference, defaulting to system mode. */
const getStoredTheme = (): ThemeMode => {
  const storage = getThemeStorage()
  const storedTheme = storage?.getItem(THEME_STORAGE_KEY)
  if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
    return storedTheme
  }
  return 'system'
}

/** Resolve the effective theme used for themed assets. */
const getResolvedTheme = (theme: ThemeMode): 'light' | 'dark' => {
  if (theme === 'light' || theme === 'dark') {
    return theme
  }
  const mediaQuery = getSystemThemeMediaQuery()
  return mediaQuery?.matches ? 'dark' : 'light'
}

/** Resolve the system dark-mode media query when available. */
const getSystemThemeMediaQuery = (): MediaQueryList | null => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null
  }
  return window.matchMedia('(prefers-color-scheme: dark)')
}

/**
 * Subscribe to media query changes with broad browser compatibility.
 *
 * @param mediaQuery - Media query list to observe.
 * @param listener - Callback fired when the query match changes.
 * @returns Cleanup function that removes the listener.
 */
const listenToMediaQueryChange = (
  mediaQuery: MediaQueryList,
  listener: () => void,
): (() => void) => {
  if (typeof mediaQuery.addEventListener === 'function') {
    const handler = () => listener()
    mediaQuery.addEventListener('change', handler)
    return () => {
      mediaQuery.removeEventListener('change', handler)
    }
  }
  const legacyMediaQuery = mediaQuery as MediaQueryList & {
    addListener?: (callback: () => void) => void
    removeListener?: (callback: () => void) => void
  }
  if (
    typeof legacyMediaQuery.addListener === 'function' &&
    typeof legacyMediaQuery.removeListener === 'function'
  ) {
    legacyMediaQuery.addListener(listener)
    return () => {
      legacyMediaQuery.removeListener?.(listener)
    }
  }
  return () => {}
}

/**
 * Ensure a device record is present in the list.
 *
 * @param devices - Existing device list.
 * @param record - Device record to add.
 * @returns Updated device list.
 */
const upsertDevice = (
  devices: RackDeviceRecord[],
  record: RackDeviceRecord,
): RackDeviceRecord[] => {
  const next = devices.filter((device) => device.id !== record.id)
  next.push(record)
  return next
}

const replacePairedDevices = (
  document: RackDocument,
  pairedDevices: RackDeviceRecord[],
): RackDocument => ({
  ...document,
  pairedDevices,
})

const moveRackInstrument = (
  rack: RackDefinition,
  instrumentId: string,
  payload: RackInstrumentDragPayload,
  instrumentMap: Map<string, Instrument>,
): RackDefinition => {
  let movedInstrument: RackInstrument | null = null
  let rows = rack.rows.map((row) => {
    const remainingInstruments = row.instruments.filter((instrument) => {
      if (instrument.id !== instrumentId) {
        return true
      }
      movedInstrument = instrument
      return false
    })
    return {
      ...row,
      instruments: remainingInstruments,
    }
  })

  if (!movedInstrument) {
    return rack
  }

  if (payload.targetKind === 'new-row') {
    const insertAt = Math.max(0, Math.min(payload.rowIndex, rows.length))
    rows = [
      ...rows.slice(0, insertAt),
      {
        id: createRackRowId(),
        instruments: [movedInstrument],
      },
      ...rows.slice(insertAt),
    ]
    return {
      ...rack,
      rows: rows.filter((row) => row.instruments.length > 0),
    }
  }

  const targetRowIndex = rows.findIndex((row) => row.id === payload.rowId)
  if (targetRowIndex < 0) {
    return rack
  }

  const targetRow = rows[targetRowIndex]
  const insertIndex = payload.insertIndex ?? targetRow.instruments.length
  if (!canInsertInstrumentIntoRow(targetRow, movedInstrument, insertIndex, instrumentMap)) {
    return rack
  }

  rows = rows.map((row, index) => (
    index === targetRowIndex
      ? insertInstrumentIntoRowAtIndex(row, movedInstrument as RackInstrument, insertIndex)
      : row
  ))
  return {
    ...rack,
    rows: rows.filter((row) => row.instruments.length > 0),
  }
}

const createRackRowId = (): string =>
  `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const upsertPairedDeviceDocument = (
  document: RackDocument,
  record: RackDeviceRecord,
): RackDocument => replacePairedDevices(document, upsertDevice(document.pairedDevices ?? [], record))

/**
 * Build a rack device record from a selected USB device.
 *
 * @param definition - Matching device definition.
 * @param device - Selected USB device.
 * @returns Rack device record.
 */
const buildRackDeviceRecord = (
  definition: { identifier: string; displayName: string },
  device: USBDevice,
): RackDeviceRecord => {
  const serial = device.serialNumber ?? undefined
  return {
    id: buildRackDeviceId(definition.identifier, device, serial),
    identifier: definition.identifier,
    displayName: definition.displayName,
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: serial,
    productName: device.productName ?? undefined
  }
}

/**
 * Build a stable ID for a rack device entry.
 *
 * @param identifier - Device definition identifier.
 * @param device - USB device instance.
 * @param serial - Optional serial number.
 * @returns Stable device entry id.
 */
const buildRackDeviceId = (
  identifier: string,
  device: USBDevice,
  serial?: string,
): string => {
  if (serial) {
    return `${identifier}:${serial}`
  }
  return `${identifier}:${device.vendorId.toString(16)}:${device.productId.toString(16)}`
}

/**
 * Build a device runtime state entry for a rack device.
 *
 * @param record - Rack device record.
 * @param runtime - Optional runtime details.
 * @returns Rack device state entry.
 */
const buildRackDeviceState = (
  record: RackDeviceRecord,
  runtime?: DeviceRuntime | null,
): RackDeviceState => {
  return {
    record,
    status: 'connected',
    drpdDriver: runtime?.drpdDriver,
    transport: runtime?.transport,
    usbDevice: runtime?.usbDevice,
  }
}

/**
 * Build a disconnected device state entry.
 *
 * @param record - Rack device record.
 * @returns Disconnected device state entry.
 */
const buildDisconnectedDeviceState = (
  record: RackDeviceRecord,
): RackDeviceState => {
  return { record, status: 'disconnected' }
}

/**
 * Upsert a rack device state entry.
 *
 * @param states - Existing device states.
 * @param nextState - New device state to upsert.
 * @returns Updated state list.
 */
const upsertDeviceState = (
  states: RackDeviceState[],
  nextState: RackDeviceState,
): RackDeviceState[] => {
  const next = states.filter((state) => state.record.id !== nextState.record.id)
  next.push(nextState)
  return next
}

const stampDeviceConnection = (record: RackDeviceRecord): RackDeviceRecord => ({
  ...record,
  lastConnectedAtMs: Date.now(),
})

/**
 * Connect a device and return its runtime details.
 *
 * @param definition - Matching device definition.
 * @param device - WebUSB device instance.
 * @returns Runtime details for the connected device.
 */
const connectDeviceRuntime = async (
  definition: Device,
  device: USBDevice,
): Promise<DeviceRuntime | null> => {
  if (definition instanceof DRPDDeviceDefinition) {
    const runtime = await definition.createConnectedRuntime(device)
    await definition.connectDevice(device)
    return { drpdDriver: runtime.driver, transport: runtime.transport, usbDevice: device }
  }

  await definition.connectDevice(device)
  return { usbDevice: device }
}

/**
 * Connect a persisted rack device record using the normal runtime flow.
 *
 * @param params - Reconnect parameters.
 */
const reconnectRackDeviceRecord = async ({
  record,
  definition,
  device,
  onUpdate,
  onPersistRecord,
  onError,
  onFirmwareUpdateCheck,
}: {
  record: RackDeviceRecord
  definition: Device
  device?: USBDevice
  onUpdate: (updater: (states: RackDeviceState[]) => RackDeviceState[]) => void
  onPersistRecord?: (record: RackDeviceRecord) => void
  onError: (message: string | null) => void
  onFirmwareUpdateCheck?: (record: RackDeviceRecord, identity: DeviceIdentity | null) => void
}): Promise<void> => {
  onError(null)

  try {
    const matchedDevice =
      device ??
      (typeof navigator === 'undefined' || !navigator.usb
        ? null
        : findUsbDeviceForRecord(await navigator.usb.getDevices(), record))

    if (!matchedDevice) {
      onError('Device is not available. Check the USB connection.')
      onUpdate((states) =>
        upsertDeviceState(states, { record, status: 'missing' }),
      )
      return
    }

    const runtime = await connectDeviceRuntime(definition, matchedDevice)
    const identity = await identifyRackDeviceRuntimeForFirmwareUpdate(runtime)
    const nextRecord = stampDeviceConnection(mergeRackDeviceIdentity(record, identity))

    await applyRecordConfigToRuntime(nextRecord, runtime)
    onFirmwareUpdateCheck?.(nextRecord, identity)
    onPersistRecord?.(nextRecord)
    onUpdate((states) =>
      upsertDeviceState(states, buildRackDeviceState(nextRecord, runtime)),
    )
  } catch (connectError) {
    const message =
      connectError instanceof Error ? connectError.message : String(connectError)
    onError(message)
    onUpdate((states) =>
      upsertDeviceState(states, { record, status: 'error', error: message }),
    )
  }
}

/**
 * Disconnect a device runtime and clean up resources.
 *
 * @param state - Device runtime state.
 * @param definitions - Registered device definitions.
 */
const disconnectDeviceRuntime = async (
  state: RackDeviceState,
  definitions: Device[],
): Promise<void> => {
  if (
    state.status !== 'connected' &&
    !state.transport &&
    !state.drpdDriver
  ) {
    return
  }
  const definition = definitions.find(
    (candidate) => candidate.identifier === state.record.identifier,
  )
  if (definition) {
    definition.disconnectDevice()
  }
  if (state.drpdDriver) {
    state.drpdDriver.detachInterrupts()
  }
  if (state.transport) {
    try {
      await state.transport.close()
    } catch {
      // Ignore close errors for cleanup.
    }
  }
}

/**
 * Clean up all device runtimes on teardown.
 *
 * @param states - Active device states.
 * @param definitions - Registered device definitions.
 */
const cleanupDeviceRuntimes = async (
  states: RackDeviceState[],
  definitions: Device[],
): Promise<void> => {
  for (const state of states) {
    await disconnectDeviceRuntime(state, definitions)
  }
}

const describeUsbDevice = (device: USBDevice | SelectedDeviceInfo): string => {
  const product = device.productName ?? 'DRPD'
  const serial = device.serialNumber ?? 'unknown serial'
  return `${product} (${serial})`
}

const downloadFirmwareAsset = async (asset: FirmwareRelease['asset']): Promise<Uint8Array> => {
  const response = await fetch(asset.downloadUrl)
  if (!response.ok) {
    throw new Error(`Firmware download failed: ${response.status} ${response.statusText}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

const requestFirmwareUpdater = async (device: USBDevice): Promise<void> => {
  let transport: Awaited<ReturnType<typeof openPreferredDRPDTransport>> | null = null
  try {
    transport = await openPreferredDRPDTransport(device)
    console.info(
      `[firmware-update] updater request transport=${transport.kind} interface=${transport.claimedInterfaceNumber ?? 'unknown'}`,
    )
    await transport.sendCommand('SYST:FIRM:UPD')
  } finally {
    await transport?.close().catch(() => undefined)
  }
}

const openUpdaterTransport = async (device: USBDevice): Promise<WinUSBTransport> => {
  const interfaceNumber = findUpdaterInterfaceNumber(device)
  if (interfaceNumber == null) {
    throw new Error('Updater WinUSB interface not found on device')
  }
  const transport = new WinUSBTransport(device, {
    interfaceNumber,
    readTimeoutMs: UPDATER_READ_TIMEOUT_MS,
    writeTimeoutMs: UPDATER_WRITE_TIMEOUT_MS,
  })
  await transport.open()
  return transport
}

const describeUsbInterfaces = (device: USBDevice): string => {
  const configuration = device.configuration ?? device.configurations?.[0] ?? null
  if (!configuration) {
    return 'no configuration'
  }
  return configuration.interfaces.map((usbInterface) => {
    const alternates = usbInterface.alternates.map((alternate) =>
      `alt class=0x${alternate.interfaceClass.toString(16)} subclass=0x${alternate.interfaceSubclass.toString(16)} protocol=0x${alternate.interfaceProtocol.toString(16)}`,
    )
    return `interface=${usbInterface.interfaceNumber} ${alternates.join('; ')}`
  }).join(', ')
}

const isFirmwareUpdaterUsbDevice = (device: USBDevice): boolean => {
  const configurations = device.configurations ?? []
  if (configurations.length === 0) {
    return true
  }
  return findUpdaterInterfaceNumber(device) != null
}

const findUpdaterInterfaceNumber = (device: USBDevice): number | null => {
  const configurations = device.configurations ?? []
  for (const configuration of configurations) {
    for (const usbInterface of configuration.interfaces) {
      for (const alternate of usbInterface.alternates) {
        if (
          alternate.interfaceClass === WINUSB_INTERFACE_CLASS &&
          alternate.interfaceSubclass === WINUSB_INTERFACE_SUBCLASS &&
          alternate.interfaceProtocol === WINUSB_INTERFACE_PROTOCOL
        ) {
          return usbInterface.interfaceNumber
        }
      }
    }
  }
  return null
}

const findMatchingAuthorizedDevice = async (
  info: SelectedDeviceInfo,
): Promise<USBDevice | null> => {
  const devices = await navigator.usb.getDevices()
  console.info(`[firmware-update] authorized USB devices=${devices.map(describeUsbDevice).join(', ') || 'none'}`)
  const matchingIdentity = devices.filter((device) => {
    if (device.vendorId !== info.vendorId || device.productId !== info.productId) {
      return false
    }
    if (info.serialNumber != null) {
      return (device.serialNumber ?? null) === info.serialNumber
    }
    return (device.productName ?? null) === info.productName
  })
  const updaterDevice = matchingIdentity.find(isFirmwareUpdaterUsbDevice) ?? null
  if (!updaterDevice && matchingIdentity.length > 0) {
    console.info(
      `[firmware-update] waiting for updater descriptor; current matches=${matchingIdentity.map(describeUsbInterfaces).join(' | ')}`,
    )
  }
  return updaterDevice
}

const waitForUpdaterTransport = async (
  info: SelectedDeviceInfo,
): Promise<{ device: USBDevice; transport: WinUSBTransport }> => {
  const deadline = Date.now() + UPDATER_RECONNECT_TIMEOUT_MS
  let attempt = 0
  let lastError: unknown = null
  while (Date.now() < deadline) {
    const device = await findMatchingAuthorizedDevice(info)
    if (device) {
      attempt += 1
      console.info(
        `[firmware-update] updater open attempt=${attempt} device=${describeUsbDevice(device)} interfaces=${describeUsbInterfaces(device)}`,
      )
      try {
        const transport = await openUpdaterTransport(device)
        const updaterStatus = await transport.getFirmwareUpdateStatus()
        console.info(
          `[firmware-update] updater status state=${updaterStatus.state} base=0x${updaterStatus.baseOffset.toString(16)} length=${updaterStatus.totalLength} written=${updaterStatus.bytesWritten}`,
        )
        return { device, transport }
      } catch (error) {
        lastError = error
        console.info(`[firmware-update] updater open failed: ${error instanceof Error ? error.message : String(error)}`)
        if (device.opened) {
          await device.close().catch(() => undefined)
        }
      }
    }
    await sleep(UPDATER_RECONNECT_POLL_MS)
  }
  throw new Error(
    `Timed out opening updater WinUSB transport for ${describeUsbDevice(info)}${lastError instanceof Error ? `; last error: ${lastError.message}` : ''}`,
  )
}

/**
 * Attempt to auto-connect stored devices when available.
 *
 * @param params - Auto-connect parameters.
 */
const autoConnectDevices = async ({
  devices,
  definitions,
  existingStates,
  onUpdate,
  onPersistDevices,
  onError,
  onFirmwareUpdateCheck,
}: {
  devices: RackDeviceRecord[]
  definitions: Device[]
  existingStates: RackDeviceState[]
  onUpdate: (state: RackDeviceState[]) => void
  onPersistDevices?: (devices: RackDeviceRecord[]) => void
  onError: (message: string | null) => void
  onFirmwareUpdateCheck?: (record: RackDeviceRecord, identity: DeviceIdentity | null) => void
}): Promise<void> => {
  if (devices.length === 0) {
    onUpdate([])
    return
  }
  if (typeof navigator === 'undefined' || !navigator.usb) {
    onError('WebUSB is not available in this browser.')
    return
  }

  try {
    const connectedUsbDevices = await navigator.usb.getDevices()
    const nextStates = devices.map((record) => {
      const existingState = existingStates.find((state) => state.record.id === record.id)
      if (existingState?.status === 'connected' && existingState.transport) {
        return existingState
      }
      const matchedDevice = connectedUsbDevices.find((usbDevice) =>
        doesRackDeviceRecordMatchUsbDevice(record, usbDevice),
      )
      if (!matchedDevice) {
        return { record, status: 'missing' } satisfies RackDeviceState
      }
      return buildDisconnectedDeviceState(record)
    })

    if (existingStates.some((state) => state.status === 'connected')) {
      onUpdate(nextStates)
      onError(null)
      return
    }

    const availableCandidates = devices
      .map((record, index) => ({
        record,
        index,
        matchedDevice: connectedUsbDevices.find((usbDevice) =>
          doesRackDeviceRecordMatchUsbDevice(record, usbDevice),
        ) ?? null,
      }))
      .filter((candidate) => candidate.matchedDevice)
      .sort((left, right) => {
        const leftTs = left.record.lastConnectedAtMs ?? Number.NEGATIVE_INFINITY
        const rightTs = right.record.lastConnectedAtMs ?? Number.NEGATIVE_INFINITY
        if (leftTs !== rightTs) {
          return rightTs - leftTs
        }
        return left.index - right.index
      })

    const selectedCandidate = availableCandidates[0]
    if (!selectedCandidate?.matchedDevice) {
      onUpdate(nextStates)
      onError(null)
      return
    }

    const matchingDefinitions = findMatchingDevices(
      definitions,
      selectedCandidate.matchedDevice,
    ).filter((definition) => definition.identifier === selectedCandidate.record.identifier)
    const verified = await verifyMatchingDevices(
      matchingDefinitions,
      selectedCandidate.matchedDevice,
    )
    const target = verified[0] ?? matchingDefinitions[0]
    if (!target) {
      onUpdate(
        nextStates.map((state) =>
          state.record.id === selectedCandidate.record.id
            ? { record: state.record, status: 'error', error: 'No matching device.' }
            : state,
        ),
      )
      onError(null)
      return
    }

    try {
      const runtime = await connectDeviceRuntime(target, selectedCandidate.matchedDevice)
      const identity = await identifyRackDeviceRuntimeForFirmwareUpdate(runtime)
      const connectedRecord = stampDeviceConnection(
        mergeRackDeviceIdentity(selectedCandidate.record, identity),
      )
      await applyRecordConfigToRuntime(connectedRecord, runtime)
      onFirmwareUpdateCheck?.(connectedRecord, identity)
      onPersistDevices?.(
        devices.map((device) =>
          device.id === connectedRecord.id ? connectedRecord : device,
        ),
      )
      onUpdate(
        nextStates.map((state) =>
          state.record.id === connectedRecord.id
            ? buildRackDeviceState(connectedRecord, runtime)
            : state,
        ),
      )
    } catch (connectError) {
      const message =
        connectError instanceof Error ? connectError.message : String(connectError)
      onUpdate(
        nextStates.map((state) =>
          state.record.id === selectedCandidate.record.id
            ? { record: state.record, status: 'error', error: message }
            : state,
        ),
      )
    }

    onError(null)
  } catch (autoError) {
    const message =
      autoError instanceof Error ? autoError.message : String(autoError)
    onError(message)
  }
}

/**
 * Find a USB device matching a rack device record.
 *
 * @param devices - Authorized WebUSB devices.
 * @param record - Rack device record to match.
 * @returns Matching USB device or null.
 */
const findUsbDeviceForRecord = (
  devices: USBDevice[],
  record: RackDeviceRecord,
): USBDevice | null => {
  return (
    devices.find((usbDevice) => doesRackDeviceRecordMatchUsbDevice(record, usbDevice)) ?? null
  )
}

/**
 * Check whether a persisted rack device record matches a WebUSB device.
 *
 * @param record - Rack device record.
 * @param device - WebUSB device.
 * @returns True when the record identifies the device.
 */
const doesRackDeviceRecordMatchUsbDevice = (
  record: RackDeviceRecord,
  device: USBDevice,
): boolean => {
  if (device.vendorId !== record.vendorId) {
    return false
  }
  if (device.productId !== record.productId) {
    return false
  }
  if (record.serialNumber && device.serialNumber !== record.serialNumber) {
    return false
  }
  return true
}

/**
 * Treat WebUSB picker cancellations as non-errors.
 *
 * @param error - Thrown error from requestDevice.
 * @returns True when the error represents a user cancel.
 */
const isUserCancelError = (error: unknown): boolean => {
  if (!error) {
    return false
  }
  if (typeof error === 'object' && 'name' in error) {
    const name = String((error as { name?: string }).name)
    if (name === 'NotFoundError') {
      return true
    }
  }
  const message =
    error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('no device selected')
}
