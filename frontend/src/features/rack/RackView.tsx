import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Device } from '../../lib/device'
import type { DeviceIdentity } from '../../lib/device'
import {
  CCBusRole,
  CCBusRoleStatus,
  DRPDDevice,
  DRPDDeviceDefinition,
  OnOffState,
  SinkPdoType,
  SinkInquiryType,
  TriggerEventType,
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
  compareFirmwareVersions,
  normalizeGitHubFirmwareReleases,
  selectReleaseForChannel,
  parseFirmwareVersion,
  saveFirmwareUpdateChannel,
  suppressFirmwareUpdatePrompt,
  type FirmwareRelease,
  type FirmwareUpdateChannel,
} from '../../lib/firmware'
import { loadRackDocument, saveRackDocument } from '../../lib/rack/loadRack'
import { usePWAInstallPrompt } from '../../lib/pwa/usePWAInstallPrompt'
import { openPreferredDRPDTransport } from '../../lib/transport/drpdUsb'
import WinUSBTransport from '../../lib/transport/winusb'
import { DRPDWorkerServiceClient } from '../../lib/device/drpd/worker'
import drpdLogoDark from '../../assets/drpd-logo-dark.svg'
import drpdLogoLight from '../../assets/drpd-logo-light.svg'
import t76Stripes from '../../assets/t76-stripes.svg'
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
  type RackRowResizePayload,
} from './RackRenderer'
import { insertInstrumentIntoRowAtIndex } from './layout'
import type { RackInstrumentResizePayload } from './RowRenderer'
import { getSupportedDevices } from './deviceCatalog'
import { getSupportedInstruments } from './instrumentCatalog'
import { matchRackShortcut } from './shortcuts'
import { applyRecordConfigToRuntime } from './applyRecordConfigToRuntime'
import {
  buildSinkRequestArgs,
  computeEprAvsMaxCurrentMa,
  getSprAvsMaxCurrentA,
  parseSinkRequestField,
} from './sinkRequest'
import {
  ContextMenu,
  Dialog,
  DialogButton,
  DialogForm,
  DialogFormRow,
  DialogInput,
  Menu,
  MenuBar,
  type MenuItem,
} from '../../ui/overlays'
import { FirmwareUpdateDialog } from './overlays/firmware/FirmwareUpdateDialog'
import { VbusConfigurePopover } from './overlays/vbus/VbusConfigurePopover'
import { prepareVbusConfigureDialog } from './overlays/vbus/vbusConfigureDialogState'
import { TriggerConfigurePopover } from './overlays/trigger/TriggerConfigurePopover'
import { SinkRequestPopover } from './overlays/sink/SinkRequestPopover'
import { SourceInquiryDialog } from './overlays/sink/SourceInquiryDialog'
import {
  ACTIVE_CABLE_INQUIRIES,
  ACTIVE_SOURCE_INQUIRIES,
  type InquiryDefinition,
} from './inquiries/catalog'
import {
  COUNTRY_INFORMATION_EVENT_TITLE,
  surveyCountryInformation,
} from './inquiries/countryWorkflow'
import {
  BATTERY_CAPABILITIES_EVENT_TITLE,
  BATTERY_STATUS_EVENT_TITLE,
  surveyBatteryCapabilities,
  surveyBatteryStatus,
} from './inquiries/batteryWorkflow'
import {
  PORT_PARTNER_IDENTITY_EVENT_TITLE,
  PORT_PARTNER_MODES_EVENT_TITLE,
  PORT_PARTNER_SVIDS_EVENT_TITLE,
  surveyPortPartnerIdentity,
  surveyPortPartnerModes,
  surveyPortPartnerSvids,
} from './inquiries/vdmWorkflow'
import {
  CalibrationManagementDialog,
  CalibrationSafetyDialog,
  CalibrationStartErrorDialog,
  type CalibrationDialogTarget,
  type CalibrationKind,
} from './overlays/calibration/CalibrationDialogs'
import {
  BMCDecoderConfigurationDialog,
  BMCDecoderConfigurationSafetyDialog,
  type BMCDecoderConfigurationTarget,
} from './overlays/calibration/BMCDecoderConfigurationDialogs'
import {
  MessageLogClearPopover,
  MessageLogImportConfirmPopover,
  MessageLogImportPopover,
} from './overlays/usbPdLog/LogActionPopovers'
import { MessageLogFilterPopover } from './overlays/usbPdLog/MessageLogFilterPopover'
import {
  GOODCRC_MESSAGE_TYPE_LABEL,
  toggleFilterValue,
  type FilterOption,
  type MessageLogFilters,
} from './overlays/usbPdLog/usbPdLogFilters'
import {
  DEFAULT_MESSAGE_LOG_COLUMN_VISIBILITY,
  DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS,
  notifyMessageLogColumnVisibilityChanged,
  saveMessageLogColumnVisibility,
  saveMessageLogColumnWidths,
} from './overlays/usbPdLog/messageLogColumns'
import {
  buildSelectedMessageLogCsv,
  getLogCrcLabel,
  getLogMessageTypeLabel,
  getLogReceiverLabel,
  getLogSenderLabel,
  getLogSopLabel,
} from './messageLogExport'
import { parseMessageLogImportJson, serializeMessageLogRow } from './messageLogImport'
import styles from './RackView.module.css'
import messageLogStyles from './instruments/DrpdUsbPdLogInstrumentView.module.css'

type ThemeMode = 'system' | 'light' | 'dark' | 'high-contrast' | 'colorblind'

const THEME_STORAGE_KEY = 'drpd:theme'
const LEGACY_HIGH_CONTRAST_STORAGE_KEY = 'drpd:theme:high-contrast'
const SHOW_TIMESTRIP_STORAGE_KEY = 'drpd:display:show-timestrip'
const CALIBRATION_WARNING_SUPPRESSED_STORAGE_KEY = 'drpd:calibration-warning-suppressed'
const BMC_DECODER_CONFIGURATION_WARNING_SUPPRESSED_STORAGE_KEY =
  'drpd:bmc-decoder-configuration-warning-suppressed'
const INQUIRY_CAPTURE_WARNING_SUPPRESSED_STORAGE_KEY =
  'drpd:inquiry-capture-warning-suppressed'
const LEGACY_SOURCE_CAPABILITIES_CAPTURE_WARNING_SUPPRESSED_STORAGE_KEY =
  'drpd:source-capabilities-capture-warning-suppressed'
const GET_STATUS_SIDE_EFFECT_WARNING_SUPPRESSED_STORAGE_KEY =
  'drpd:get-status-side-effect-warning-suppressed'
const LOG_ONLY_SOURCE_INQUIRY_TYPES = new Set<SinkInquiryType>([
  SinkInquiryType.GET_SOURCE_CAP,
  SinkInquiryType.GET_SOURCE_CAP_EXTENDED,
  SinkInquiryType.GET_STATUS,
  SinkInquiryType.GET_SOURCE_INFO,
  SinkInquiryType.GET_REVISION,
  SinkInquiryType.GET_MANUFACTURER_INFO,
  SinkInquiryType.GET_COUNTRY_CODES,
  SinkInquiryType.GET_COUNTRY_INFO,
  SinkInquiryType.GET_BATTERY_CAP,
  SinkInquiryType.GET_BATTERY_STATUS,
])
const LOG_ONLY_SOURCE_INQUIRY_IDS = new Set([
  'discover-identity',
  'discover-svids',
  'discover-modes',
])
const isLogOnlySourceInquiry = (definition: InquiryDefinition): boolean =>
  LOG_ONLY_SOURCE_INQUIRY_TYPES.has(definition.type) ||
  LOG_ONLY_SOURCE_INQUIRY_IDS.has(definition.id)
const TIMESTRIP_INSTRUMENT_IDENTIFIER = 'com.mta.drpd.timestrip'
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
const EMPTY_MESSAGE_LOG_FILTERS: MessageLogFilters = {
  messageTypes: { include: [], exclude: [] },
  senders: { include: [], exclude: [] },
  receivers: { include: [], exclude: [] },
  sopTypes: { include: [], exclude: [] },
  crcValid: { include: [], exclude: [] },
  flagged: { include: [], exclude: [] },
}

interface DRPDLogsConsoleHelper {
  devices(): Array<{ id: string; name: string; status: string }>
  driver(deviceId?: string): DRPDDriverRuntime
  diagnostics(deviceId?: string): Promise<unknown>
  loggingConfig(deviceId?: string): DRPDLoggingConfig
  setStorageBackend(mode: 'auto' | 'memory', deviceId?: string): Promise<DRPDLoggingConfig>
  resetPersistentStorage(deviceId?: string): Promise<unknown>
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

interface DeviceNameDialogState {
  recordId: string
  name: string
  error: string | null
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
    hardwareRevision: identity.hardwareRevision || record.hardwareRevision,
  }
}

const MIN_SINK_BEHAVIOUR_FIRMWARE_VERSION = parseFirmwareVersion('0.9.13')
const MIN_BMC_DECODER_CONFIGURATION_FIRMWARE_VERSION = parseFirmwareVersion('0.9.24')

const supportsSinkBehaviourSettings = (firmwareVersion: string | undefined): boolean => {
  if (!firmwareVersion) {
    return false
  }
  try {
    return compareFirmwareVersions(
      parseFirmwareVersion(firmwareVersion),
      MIN_SINK_BEHAVIOUR_FIRMWARE_VERSION,
    ) >= 0
  } catch {
    return false
  }
}

const supportsBMCDecoderConfiguration = (firmwareVersion: string | undefined): boolean => {
  if (!firmwareVersion) {
    return false
  }
  try {
    return compareFirmwareVersions(
      parseFirmwareVersion(firmwareVersion),
      MIN_BMC_DECODER_CONFIGURATION_FIRMWARE_VERSION,
    ) >= 0
  } catch {
    return false
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

const formatHeaderAccumulatorElapsed = (elapsedUs: bigint | null | undefined): string => {
  if (elapsedUs == null) {
    return '--'
  }
  const totalSeconds = Number(elapsedUs / 1_000_000n)
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--'
  }
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hhmmss = [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':')
  return days > 0 ? `${days}d ${hhmmss}` : hhmmss
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

const HeaderAccumulatorElapsedValue = ({ text }: { text: string }) => (
  <span className={styles.headerVbusAccumulatorElapsedValue}>{text}</span>
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

const HeaderFrontPanelVisual = ({
  disabled,
  bananaDisabled,
  port1Connected,
  port2Connected,
  port1Disabled,
  port2Disabled,
  usbPortsEnabled,
  flow,
  portRailRoute,
  portRailDirection,
  role,
  roleStatus,
}: {
  disabled: boolean
  bananaDisabled: boolean
  port1Connected: boolean
  port2Connected: boolean
  port1Disabled: boolean
  port2Disabled: boolean
  usbPortsEnabled: boolean
  flow: 'off' | 'idle' | 'sink' | 'monitor'
  portRailRoute: 'ports' | 'banana'
  portRailDirection: 'idle' | 'port-1-to-port-2' | 'port-2-to-port-1' | 'port-1-to-banana' | 'banana-to-port-1'
  role: CCBusRole | null
  roleStatus: CCBusRoleStatus | null
}) => (
  <div
    className={styles.headerFrontPanel}
    aria-label={`Front panel ports: ${formatHeaderRoleLabel(role)}, ${formatHeaderRoleStatusLabel(roleStatus)}`}
    data-testid="header-front-panel"
    data-disabled={disabled ? 'true' : 'false'}
    data-connected={port1Connected || port2Connected ? 'true' : 'false'}
    data-usb-ports-enabled={usbPortsEnabled ? 'true' : 'false'}
    data-role={role ?? 'UNKNOWN'}
    data-role-status={roleStatus ?? 'UNKNOWN'}
    data-flow={flow}
    data-port-rail-route={portRailRoute}
    data-port-rail-direction={portRailDirection}
  >
    <div className={styles.headerFrontPanelDeviceRow} aria-hidden="true">
      <div className={styles.headerFrontPanelDevice} data-device="usb-c-1">
        <span className={styles.headerFrontPanelLabel}>1</span>
        <span
          className={styles.headerUsbCPort}
          data-port="1"
          data-connected={port1Connected ? 'true' : 'false'}
          data-disabled={port1Disabled ? 'true' : 'false'}
        >
          <span className={styles.headerUsbCSlot} />
        </span>
      </div>
      <div className={styles.headerFrontPanelDevice} data-device="usb-c-2">
        <span className={styles.headerFrontPanelLabel}>2</span>
        <span
          className={styles.headerUsbCPort}
          data-port="2"
          data-connected={port2Connected ? 'true' : 'false'}
          data-disabled={port2Disabled ? 'true' : 'false'}
        >
          <span className={styles.headerUsbCSlot} />
        </span>
      </div>
      <div className={styles.headerFrontPanelDevice} data-device="vbus">
        <span className={styles.headerFrontPanelLabel}>VBUS</span>
        <span
          className={styles.headerBananaJackPair}
          data-disabled={bananaDisabled ? 'true' : 'false'}
        >
          <span className={styles.headerBananaJack} data-polarity="positive" />
          <span className={styles.headerBananaJack} data-polarity="negative" />
        </span>
      </div>
    </div>
    <svg
      className={styles.headerFrontPanelPortRail}
      viewBox="0 0 126 16"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="header-front-panel-port-rail-clip">
          <rect x="0" y="6" width="126" height="10" />
        </clipPath>
      </defs>
      <path
        className={styles.headerFrontPanelPortRailLine}
        data-port-rail-route="ports"
        clipPath="url(#header-front-panel-port-rail-clip)"
        d="M19 -8 V9 Q19 13 23 13 H53 Q57 13 57 9 V-8"
      />
      <path
        className={styles.headerFrontPanelPortRailLine}
        data-port-rail-route="banana"
        clipPath="url(#header-front-panel-port-rail-clip)"
        d="M19 -8 V9 Q19 13 23 13 H97 Q101 13 101 9 V-8"
      />
    </svg>
    {role === CCBusRole.DISABLED ? (
      <span className={styles.headerFrontPanelDisabledBadge} aria-hidden="true">
        OFF
      </span>
    ) : null}
  </div>
)

const formatHeaderRoleLabel = (role: CCBusRole | null): string => {
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
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, '')
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
  const pdoType = formatHeaderSinkPdoType(sinkInfo.negotiatedPdo)
  return `${pdoType} ${formatHeaderCompactNumber(voltageV)}V @ ${formatHeaderCompactNumber(currentA)}A`
}

const formatHeaderCaptureStatus = (captureEnabled: OnOffState | null): string => {
  switch (captureEnabled) {
    case OnOffState.ON:
      return 'ON'
    case OnOffState.OFF:
      return 'OFF'
    default:
      return '--'
  }
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

const buildMessageLogFilterOptions = (
  rows: LoggedCapturedMessage[],
  filters: MessageLogFilters,
): {
  messageTypes: FilterOption[]
  senders: FilterOption[]
  receivers: FilterOption[]
  sopTypes: FilterOption[]
  crcValid: FilterOption[]
  flagged: FilterOption[]
} => {
  const messageRows = rows.filter((row) => row.entryKind === 'message')
  return {
    messageTypes: uniqueLogOptions([
      ...messageRows.map(getLogMessageTypeLabel),
      ...filters.messageTypes.include,
      ...filters.messageTypes.exclude,
    ].filter((value) => value !== GOODCRC_MESSAGE_TYPE_LABEL)),
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
    flagged: uniqueLogOptions([
      'Flagged',
      'Unflagged',
      ...(filters.flagged?.include ?? []),
      ...(filters.flagged?.exclude ?? []),
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

const readTextFile = (file: File): Promise<string> => {
  if (typeof file.text === 'function') {
    return file.text()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      resolve(String(reader.result ?? ''))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Unable to read selected file.'))
    })
    reader.readAsText(file)
  })
}

const buildSelectedMessageLogJson = (
  rows: LoggedCapturedMessage[],
  selectionKeys: string[],
): string => {
  const selected = new Set(selectionKeys)
  return JSON.stringify(
    rows
      .filter((row) => selected.has(buildCapturedLogSelectionKey(row)))
      .map(serializeMessageLogRow),
    null,
    2,
  )
}

const notifyMessageLogFiltersChanged = (filters: MessageLogFilters): void => {
  window.dispatchEvent(
    new CustomEvent('drpd-message-log-filters-changed', {
      detail: { filters },
    }),
  )
}

const isPowerLimitedSinkPdo = (pdo: SinkPdo | null | undefined): boolean => (
  pdo?.type === SinkPdoType.BATTERY ||
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
      return { voltageV: pdo.minVoltageV.toFixed(2), currentA: (pdo.maxPowerW / pdo.minVoltageV).toFixed(2) }
    case SinkPdoType.SPR_AVS:
      return { voltageV: pdo.minVoltageV.toFixed(2), currentA: pdo.maxCurrent15VA.toFixed(2) }
    case SinkPdoType.EPR_AVS:
      return { voltageV: pdo.minVoltageV.toFixed(2), currentA: (pdo.maxPowerW / pdo.maxVoltageV).toFixed(2) }
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
  if (pdo.type === SinkPdoType.SPR_AVS) {
    if (requestedVoltageV == null || !Number.isFinite(requestedVoltageV)) {
      return { minA: 0, error: 'Enter a valid voltage to compute the current range.' }
    }
    return { minA: 0, maxA: getSprAvsMaxCurrentA(pdo, requestedVoltageV) }
  }
  if (isPowerLimitedSinkPdo(pdo)) {
    if (requestedVoltageV == null || !Number.isFinite(requestedVoltageV)) {
      return { minA: 0, error: 'Enter a valid voltage to compute the current range.' }
    }
    if (requestedVoltageV <= 0) {
      return { minA: 0, error: 'Voltage must be greater than 0 V.' }
    }
    if (pdo.type === SinkPdoType.EPR_AVS) {
      return {
        minA: 0,
        maxA: computeEprAvsMaxCurrentMa(pdo, Math.round(requestedVoltageV * 1000)) / 1000,
      }
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
    return 'Fixed'
  }
  return `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`
}

/**
 * Render the rack view with rack selection and layout rendering.
 */
export const RackView = ({
  startupPairingPromptEnabled = false,
}: {
  startupPairingPromptEnabled?: boolean
}) => {
  const { canInstall, promptInstall } = usePWAInstallPrompt()
  const [rackDocument, setRackDocument] = useState<RackDocument | null>(null)
  const [activeRack, setActiveRack] = useState<RackDefinition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())
  const [firmwareUpdateChannel, setFirmwareUpdateChannel] = useState<FirmwareUpdateChannel>(() =>
    loadFirmwareUpdateChannel(),
  )
  const firmwareUpdateChannelRef = useRef<FirmwareUpdateChannel>(firmwareUpdateChannel)
  const [deviceNameDialog, setDeviceNameDialog] = useState<DeviceNameDialogState | null>(null)
  const [calibrationWarningTarget, setCalibrationWarningTarget] =
    useState<CalibrationDialogTarget | null>(null)
  const [calibrationWarningSuppressInput, setCalibrationWarningSuppressInput] = useState(false)
  const [calibrationDialogTarget, setCalibrationDialogTarget] =
    useState<CalibrationDialogTarget | null>(null)
  const [calibrationStartError, setCalibrationStartError] = useState<string | null>(null)
  const [bmcDecoderConfigurationWarningTarget, setBMCDecoderConfigurationWarningTarget] =
    useState<BMCDecoderConfigurationTarget | null>(null)
  const [bmcDecoderConfigurationWarningSuppressInput, setBMCDecoderConfigurationWarningSuppressInput] =
    useState(false)
  const [bmcDecoderConfigurationTarget, setBMCDecoderConfigurationTarget] =
    useState<BMCDecoderConfigurationTarget | null>(null)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    getResolvedTheme(getStoredTheme()),
  )
  const [deviceStates, setDeviceStates] = useState<RackDeviceState[]>([])
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [isStartupPairingDialogOpen, setIsStartupPairingDialogOpen] = useState(false)
  const hasHandledStartupPairingPromptRef = useRef(false)
  const isRackEditMode = false
  const [draggedRackInstrumentId, setDraggedRackInstrumentId] = useState<string | null>(null)
  const [firmwareUpdatePrompt, setFirmwareUpdatePrompt] = useState<FirmwareUpdatePromptState | null>(null)
  const [isGlobalVbusDialogOpen, setIsGlobalVbusDialogOpen] = useState(false)
  const [globalOvpThresholdInput, setGlobalOvpThresholdInput] = useState('')
  const [globalOcpThresholdInput, setGlobalOcpThresholdInput] = useState('')
  const [globalVbusConfigureError, setGlobalVbusConfigureError] = useState<string | null>(null)
  const [isGlobalVbusApplying, setIsGlobalVbusApplying] = useState(false)
  const [isGlobalSinkDialogOpen, setIsGlobalSinkDialogOpen] = useState(false)
  const [sourceInquiryDefinition, setSourceInquiryDefinition] =
    useState<InquiryDefinition | null>(null)
  const [pendingCaptureWarningInquiry, setPendingCaptureWarningInquiry] =
    useState<InquiryDefinition | null>(null)
  const [suppressInquiryCaptureWarning, setSuppressInquiryCaptureWarning] = useState(false)
  const [getStatusConfirmationDefinition, setGetStatusConfirmationDefinition] =
    useState<InquiryDefinition | null>(null)
  const [suppressGetStatusSideEffectWarning, setSuppressGetStatusSideEffectWarning] =
    useState(false)
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
  const [globalTriggerConfigureError, setGlobalTriggerConfigureError] = useState<string | null>(null)
  const [isGlobalTriggerApplying, setIsGlobalTriggerApplying] = useState(false)
  const [messageLogSelectionKeys, setMessageLogSelectionKeys] = useState<string[]>([])
  const [messageLogFilters, setMessageLogFilters] =
    useState<MessageLogFilters>(EMPTY_MESSAGE_LOG_FILTERS)
  const [messageLogFilterRows, setMessageLogFilterRows] = useState<LoggedCapturedMessage[]>([])
  const [isMessageLogFilterDialogOpen, setIsMessageLogFilterDialogOpen] = useState(false)
  const [isMessageLogClearDialogOpen, setIsMessageLogClearDialogOpen] = useState(false)
  const [isMessageLogImportDialogOpen, setIsMessageLogImportDialogOpen] = useState(false)
  const [isMessageLogImportConfirmOpen, setIsMessageLogImportConfirmOpen] = useState(false)
  const [isMessageCommentDialogOpen, setIsMessageCommentDialogOpen] = useState(false)
  const [isDeleteMessageCommentConfirmOpen, setIsDeleteMessageCommentConfirmOpen] = useState(false)
  const [messageCommentDraft, setMessageCommentDraft] = useState('')
  const [isMessageLogMarking, setIsMessageLogMarking] = useState(false)
  const [isMessageLogClearing, setIsMessageLogClearing] = useState(false)
  const [isMessageLogExporting, setIsMessageLogExporting] = useState(false)
  const [isMessageLogImporting, setIsMessageLogImporting] = useState(false)
  const [messageLogError, setMessageLogError] = useState<string | null>(null)
  const [messageLogImportFile, setMessageLogImportFile] = useState<File | null>(null)
  const [messageLogImportError, setMessageLogImportError] = useState<string | null>(null)
  const [showTimestrip, setShowTimestrip] = useState<boolean>(() => getStoredShowTimestrip())
  const rackDocumentRef = useRef<RackDocument | null>(null)
  const deviceStatesRef = useRef<RackDeviceState[]>([])
  const pairedDevicesRef = useRef<RackDeviceRecord[]>(EMPTY_PAIRED_DEVICES)
  const firmwareUpdateActiveRef = useRef(false)

  const deviceDefinitions = useMemo<Device[]>(() => getSupportedDevices(), [])
  const instrumentDefinitions = useMemo(() => getSupportedInstruments(), [])
  const pairedDevices = rackDocument?.pairedDevices ?? EMPTY_PAIRED_DEVICES
  const activeConnectedDeviceState = useMemo(
    () => deviceStates.find((state) => state.status === 'connected'),
    [deviceStates],
  )
  const activeDeviceRecord = activeConnectedDeviceState?.record

  useEffect(() => {
    if (
      !startupPairingPromptEnabled ||
      isLoading ||
      !rackDocument ||
      pairedDevices.length > 0 ||
      hasHandledStartupPairingPromptRef.current
    ) {
      return
    }

    hasHandledStartupPairingPromptRef.current = true
    setIsStartupPairingDialogOpen(true)
  }, [isLoading, pairedDevices.length, rackDocument, startupPairingPromptEnabled])

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
    if (theme === 'high-contrast') {
      root.setAttribute('data-high-contrast', 'true')
    } else {
      root.removeAttribute('data-high-contrast')
    }
    if (theme === 'colorblind') {
      root.setAttribute('data-colorblind', 'true')
    } else {
      root.removeAttribute('data-colorblind')
    }
    if (theme === 'high-contrast') {
      root.setAttribute('data-theme', 'dark')
      setResolvedTheme('dark')
      const storage = getBrowserStorage()
      if (storage) {
        storage.setItem(THEME_STORAGE_KEY, theme)
        storage.removeItem(LEGACY_HIGH_CONTRAST_STORAGE_KEY)
      }
      return
    }
    if (theme === 'colorblind') {
      root.setAttribute('data-theme', 'dark')
      setResolvedTheme('dark')
      const storage = getBrowserStorage()
      if (storage) {
        storage.setItem(THEME_STORAGE_KEY, theme)
        storage.removeItem(LEGACY_HIGH_CONTRAST_STORAGE_KEY)
      }
      return
    }
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
        const storage = getBrowserStorage()
        if (storage) {
          storage.setItem(THEME_STORAGE_KEY, theme)
        }
        return cleanup
      }
    }
    const storage = getBrowserStorage()
    if (storage) {
      storage.setItem(THEME_STORAGE_KEY, theme)
    }
  }, [theme])

  useEffect(() => {
    const storage = getBrowserStorage()
    if (storage) {
      storage.setItem(SHOW_TIMESTRIP_STORAGE_KEY, showTimestrip ? 'true' : 'false')
    }
  }, [showTimestrip])

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
      resetPersistentStorage: async (deviceId) => {
        if (!navigator.storage?.getDirectory) {
          throw new Error('OPFS is not available in this browser context.')
        }
        const previousConfig = helper.loggingConfig(deviceId)
        await helper.setStorageBackend('memory', deviceId)
        const root = await navigator.storage.getDirectory()
        let deleted = false
        try {
          await root.removeEntry('drpd', { recursive: true })
          deleted = true
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
            throw error
          }
        }
        if (previousConfig.storageBackend !== 'memory') {
          await helper.setStorageBackend(previousConfig.storageBackend, deviceId)
        }
        return {
          deleted,
          storageBackend: helper.loggingConfig(deviceId).storageBackend,
        }
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
          'await window.__drpdLogs.resetPersistentStorage(deviceId?)',
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
  const renderedRack = useMemo(
    () => (currentRack && !showTimestrip ? hideTimestripInstrument(currentRack) : currentRack),
    [currentRack, showTimestrip],
  )
  const activeDriver = activeConnectedDeviceState?.drpdDriver
  const activeDriverState = activeDriver?.getState()
  const handleSourceInquiryResponse = useCallback((definition: InquiryDefinition) => {
    if (definition.type === SinkInquiryType.GET_SOURCE_CAP) return activeDriver?.refreshState()
  }, [activeDriver])
  const hasSelectedMessages = messageLogSelectionKeys.length > 0
  const selectedLogRow = useMemo(() => {
    if (messageLogSelectionKeys.length !== 1) return null
    const selectionKey = messageLogSelectionKeys[0]
    return messageLogFilterRows.find(
      (candidate) => buildCapturedLogSelectionKey(candidate) === selectionKey,
    ) ?? null
  }, [messageLogFilterRows, messageLogSelectionKeys])
  const selectedAnnotatableMessage =
    selectedLogRow?.entryKind === 'message' ||
    (selectedLogRow?.entryKind === 'event' && selectedLogRow.eventType === 'mark')
      ? selectedLogRow
      : null
  const selectedAnnotationTargetLabel =
    selectedAnnotatableMessage?.entryKind === 'event' ? 'mark' : 'message'
  const isCaptureEnabled = activeDriverState?.captureEnabled === OnOffState.ON
  const proceedWithLogOnlyInquiry = useCallback((definition: InquiryDefinition) => {
    if (!activeDriver) return
    const getStatusWarningSuppressed = window.localStorage.getItem(
      GET_STATUS_SIDE_EFFECT_WARNING_SUPPRESSED_STORAGE_KEY,
    ) === 'true'
    if (definition.type === SinkInquiryType.GET_STATUS && !getStatusWarningSuppressed) {
      setSuppressGetStatusSideEffectWarning(false)
      setGetStatusConfirmationDefinition(definition)
      return
    }
    if (definition.type === SinkInquiryType.GET_MANUFACTURER_INFO) {
      setSourceInquiryDefinition(definition)
      return
    }
    if (definition.type === SinkInquiryType.GET_COUNTRY_INFO) {
      setDeviceError(null)
      void surveyCountryInformation(activeDriver.sink)
        .then(({ summary }) => activeDriver.markLog(
          `${COUNTRY_INFORMATION_EVENT_TITLE}\n${summary}`,
        ))
        .catch((error) => setDeviceError(error instanceof Error ? error.message : String(error)))
      return
    }
    if (definition.type === SinkInquiryType.GET_BATTERY_CAP) {
      setDeviceError(null)
      void surveyBatteryCapabilities(activeDriver.sink)
        .then(({ summary }) => activeDriver.markLog(
          `${BATTERY_CAPABILITIES_EVENT_TITLE}\n${summary}`,
        ))
        .catch((error) => setDeviceError(error instanceof Error ? error.message : String(error)))
      return
    }
    if (definition.type === SinkInquiryType.GET_BATTERY_STATUS) {
      setDeviceError(null)
      void surveyBatteryStatus(activeDriver.sink)
        .then(({ summary }) => activeDriver.markLog(
          `${BATTERY_STATUS_EVENT_TITLE}\n${summary}`,
        ))
        .catch((error) => setDeviceError(error instanceof Error ? error.message : String(error)))
      return
    }
    if (definition.id === 'discover-identity') {
      setDeviceError(null)
      void surveyPortPartnerIdentity(activeDriver.sink)
        .then(({ summary }) => activeDriver.markLog(
          `${PORT_PARTNER_IDENTITY_EVENT_TITLE}\n${summary}`,
        ))
        .catch((error) => setDeviceError(error instanceof Error ? error.message : String(error)))
      return
    }
    if (definition.id === 'discover-svids') {
      setDeviceError(null)
      void surveyPortPartnerSvids(activeDriver.sink)
        .then(({ summary }) => activeDriver.markLog(
          `${PORT_PARTNER_SVIDS_EVENT_TITLE}\n${summary}`,
        ))
        .catch((error) => setDeviceError(error instanceof Error ? error.message : String(error)))
      return
    }
    if (definition.id === 'discover-modes') {
      setDeviceError(null)
      void surveyPortPartnerModes(activeDriver.sink)
        .then(({ summary }) => activeDriver.markLog(
          `${PORT_PARTNER_MODES_EVENT_TITLE}\n${summary}`,
        ))
        .catch((error) => setDeviceError(error instanceof Error ? error.message : String(error)))
      return
    }
    setDeviceError(null)
    void activeDriver.sink
      .sendInquiry(definition.type)
      .catch((error) => setDeviceError(error instanceof Error ? error.message : String(error)))
  }, [activeDriver])
  const handleSelectSourceInquiry = useCallback((definition: InquiryDefinition) => {
    if (!isLogOnlySourceInquiry(definition)) {
      setSourceInquiryDefinition(definition)
      return
    }
    const warningSuppressed =
      window.localStorage.getItem(INQUIRY_CAPTURE_WARNING_SUPPRESSED_STORAGE_KEY) === 'true' ||
      window.localStorage.getItem(
        LEGACY_SOURCE_CAPABILITIES_CAPTURE_WARNING_SUPPRESSED_STORAGE_KEY,
      ) === 'true'
    if (!isCaptureEnabled && !warningSuppressed) {
      setSuppressInquiryCaptureWarning(false)
      setPendingCaptureWarningInquiry(definition)
      return
    }
    proceedWithLogOnlyInquiry(definition)
  }, [isCaptureEnabled, proceedWithLogOnlyInquiry])
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
        return moveRackInstrument(rack, draggedRackInstrumentId, payload)
      }),
    }))
  }, [activeRack?.id, draggedRackInstrumentId, updateRackDocument])

  const handleRackInstrumentResize = useCallback((payload: RackInstrumentResizePayload) => {
    updateRackDocument((document) => ({
      ...document,
      racks: document.racks.map((rack) => {
        if (rack.id !== activeRack?.id) {
          return rack
        }
        return resizeAdjacentRackInstruments(rack, payload)
      }),
    }))
  }, [activeRack?.id, updateRackDocument])

  const handleRackRowResize = useCallback((payload: RackRowResizePayload) => {
    updateRackDocument((document) => ({
      ...document,
      racks: document.racks.map((rack) => {
        if (rack.id !== activeRack?.id) {
          return rack
        }
        return resizeAdjacentRackRows(rack, payload)
      }),
    }))
  }, [activeRack?.id, updateRackDocument])

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

  const resetMessageLogImportDialog = useCallback(() => {
    setMessageLogImportFile(null)
    setMessageLogImportError(null)
    setIsMessageLogImportDialogOpen(false)
    setIsMessageLogImportConfirmOpen(false)
  }, [])

  const confirmMessageLogImport = useCallback(() => {
    if (!activeDriver || !messageLogImportFile || isMessageLogImporting) {
      return
    }
    setIsMessageLogImporting(true)
    setMessageLogImportError(null)
    void readTextFile(messageLogImportFile)
      .then((payload) => parseMessageLogImportJson(payload))
      .then((rows) => activeDriver.importCapturedMessages(rows, { clearScope: 'all' }))
      .then(() => {
        setMessageLogSelectionKeys([])
        setMessageLogFilterRows([])
        resetMessageLogImportDialog()
      })
      .catch((error) => {
        setMessageLogImportError(error instanceof Error ? error.message : String(error))
        setIsMessageLogImportConfirmOpen(false)
        setIsMessageLogImportDialogOpen(true)
      })
      .finally(() => {
        setIsMessageLogImporting(false)
      })
  }, [activeDriver, isMessageLogImporting, messageLogImportFile, resetMessageLogImportDialog])

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

  const addMessageLogMarkerAtSelection = useCallback(() => {
    if (!activeDriver || !selectedLogRow || selectedLogRow.wallClockUs === null || isMessageLogMarking) {
      return
    }
    setIsMessageLogMarking(true)
    setMessageLogError(null)
    void activeDriver
      .markLogAt(selectedLogRow)
      .catch((error) => {
        setMessageLogError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        setIsMessageLogMarking(false)
      })
  }, [activeDriver, isMessageLogMarking, selectedLogRow])

  const toggleSelectedMessageFlag = useCallback(async () => {
    console.debug('[message-annotation] flag handler entered', {
      hasDriver: !!activeDriver,
      selectionKeys: messageLogSelectionKeys,
      selectedMessage: selectedAnnotatableMessage
        ? buildCapturedLogSelectionKey(selectedAnnotatableMessage)
        : null,
    })
    if (!activeDriver || !selectedAnnotatableMessage) {
      console.warn('[message-annotation] flag handler blocked', {
        hasDriver: !!activeDriver,
        selectionCount: messageLogSelectionKeys.length,
        selectedEntryKind: selectedAnnotatableMessage?.entryKind ?? null,
      })
      return
    }
    const selectionKey = buildCapturedLogSelectionKey(selectedAnnotatableMessage)
    setMessageLogError(null)
    try {
      const flagged = selectedAnnotatableMessage.flagged !== true
      console.debug('[message-annotation] sending flag update', {
        selectionKey,
        previousFlagged: selectedAnnotatableMessage.flagged === true,
        nextFlagged: flagged,
      })
      const updated = await activeDriver.updateCapturedMessageAnnotations(selectionKey, {
        flagged,
        comment: selectedAnnotatableMessage.comment ?? null,
        commentCreatedAtMs: selectedAnnotatableMessage.commentCreatedAtMs ?? null,
      })
      console.debug('[message-annotation] flag update RPC completed', {
        selectionKey,
        updated,
      })
      setMessageLogFilterRows((current) => current.map((row) =>
        buildCapturedLogSelectionKey(row) === selectionKey ? { ...row, flagged } : row,
      ))
      console.debug('[message-annotation] local flag state refreshed', {
        selectionKey,
        flagged,
      })
    } catch (error) {
      console.error('[message-annotation] flag update failed', error)
      setMessageLogError(error instanceof Error ? error.message : String(error))
    }
  }, [activeDriver, messageLogSelectionKeys, selectedAnnotatableMessage])

  const openSelectedMessageComment = useCallback(() => {
    if (!selectedAnnotatableMessage) return
    setMessageCommentDraft(selectedAnnotatableMessage.comment ?? '')
    setIsMessageCommentDialogOpen(true)
  }, [selectedAnnotatableMessage])

  const saveSelectedMessageComment = useCallback(async () => {
    if (!activeDriver || !selectedAnnotatableMessage) return
    const selectionKey = buildCapturedLogSelectionKey(selectedAnnotatableMessage)
    const comment = messageCommentDraft.trim()
    if (!comment) return
    const commentCreatedAtMs = selectedAnnotatableMessage.commentCreatedAtMs ?? Date.now()
    setMessageLogError(null)
    try {
      await activeDriver.updateCapturedMessageAnnotations(selectionKey, {
        flagged: selectedAnnotatableMessage.flagged === true,
        comment,
        commentCreatedAtMs,
      })
      setMessageLogFilterRows((current) => current.map((row) =>
        buildCapturedLogSelectionKey(row) === selectionKey
          ? { ...row, comment, commentCreatedAtMs }
          : row,
      ))
      setIsMessageCommentDialogOpen(false)
    } catch (error) {
      setMessageLogError(error instanceof Error ? error.message : String(error))
    }
  }, [activeDriver, messageCommentDraft, selectedAnnotatableMessage])

  const deleteSelectedMessageComment = useCallback(async () => {
    if (!activeDriver || !selectedAnnotatableMessage) return
    const selectionKey = buildCapturedLogSelectionKey(selectedAnnotatableMessage)
    setMessageLogError(null)
    try {
      await activeDriver.updateCapturedMessageAnnotations(selectionKey, {
        flagged: selectedAnnotatableMessage.flagged === true,
        comment: null,
        commentCreatedAtMs: null,
      })
      setMessageLogFilterRows((current) => current.map((row) =>
        buildCapturedLogSelectionKey(row) === selectionKey
          ? { ...row, comment: null, commentCreatedAtMs: null }
          : row,
      ))
      setMessageCommentDraft('')
      setIsDeleteMessageCommentConfirmOpen(false)
    } catch (error) {
      setMessageLogError(error instanceof Error ? error.message : String(error))
    }
  }, [activeDriver, selectedAnnotatableMessage])

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
      if (
        changed.includes('analogMonitor') ||
        changed.includes('role') ||
        changed.includes('sinkEprEnabled')
      ) {
        setDeviceStates((states) =>
          states.map((state) =>
            state.status === 'connected' && state.drpdDriver === activeDriver
              ? { ...state }
              : state,
          ),
        )
      }
    }

    const handleLogEntryAdded = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.kind !== 'message' && detail?.kind !== 'event') {
        return
      }
      if (!isLoggedCapturedMessageLike(detail.row)) {
        return
      }
      const row = detail.row
      setMessageLogFilterRows((current) => {
        const key = buildCapturedLogSelectionKey(row)
        if (current.some((candidate) => buildCapturedLogSelectionKey(candidate) === key)) {
          return current
        }
        return [...current, row]
      })
    }

    const handleLogEntryDeleted = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const deletedCount = Number(detail?.messagesDeleted)
      const importedCount = Number(detail?.messagesImported)
      if (
        (!Number.isFinite(deletedCount) || deletedCount <= 0) &&
        (!Number.isFinite(importedCount) || importedCount <= 0)
      ) {
        return
      }
      void activeDriver
        .queryCapturedMessages({
          startTimestampUs: 0n,
          endTimestampUs: LOG_END_TIMESTAMP_US,
          sortOrder: 'asc',
        })
        .then(setMessageLogFilterRows)
        .catch(() => setMessageLogFilterRows([]))
    }

    const handleLogEntryUpdated = () => {
      void activeDriver.queryCapturedMessages({
        startTimestampUs: 0n,
        endTimestampUs: LOG_END_TIMESTAMP_US,
        sortOrder: 'asc',
      }).then(setMessageLogFilterRows).catch(() => setMessageLogFilterRows([]))
    }

    activeDriver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    activeDriver.addEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, handleLogEntryAdded)
    activeDriver.addEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, handleLogEntryDeleted)
    activeDriver.addEventListener(DRPDDevice.LOG_ENTRY_UPDATED_EVENT, handleLogEntryUpdated)
    return () => {
      activeDriver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
      activeDriver.removeEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, handleLogEntryAdded)
      activeDriver.removeEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, handleLogEntryDeleted)
      activeDriver.removeEventListener(DRPDDevice.LOG_ENTRY_UPDATED_EVENT, handleLogEntryUpdated)
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
    window.open('https://t76.org/drpd/docs', '_blank', 'noopener,noreferrer')
  }

  /** Open the user's email client for DRPD feedback. */
  const handleContactUs = () => {
    window.open('mailto:hello@t76.org?subject=Dr.%20PD%20feedback', '_self')
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

      const baseRecord = mergeExistingRackDeviceRecord(
        buildRackDeviceRecord(deviceDefinition, selected),
        pairedDevicesRef.current,
      )
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

  const handleOpenDeviceNameDialog = useCallback((recordId: string) => {
    const record = pairedDevices.find((device) => device.id === recordId)
    if (!record) {
      return
    }
    setDeviceNameDialog({
      recordId,
      name: record.displayName,
      error: null,
    })
  }, [pairedDevices])

  const handleDeviceNameDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDeviceNameDialog(null)
    }
  }, [])

  const handleDeviceNameInputChange = useCallback((name: string) => {
    setDeviceNameDialog((current) => current ? { ...current, name, error: null } : current)
  }, [])

  const handleSaveDeviceName = useCallback(() => {
    if (!rackDocument || !deviceNameDialog) {
      return
    }
    const displayName = deviceNameDialog.name.trim()
    if (!displayName) {
      setDeviceNameDialog((current) =>
        current ? { ...current, error: 'Name is required.' } : current,
      )
      return
    }
    const nextDevices = pairedDevices.map((device) =>
      device.id === deviceNameDialog.recordId ? { ...device, displayName } : device,
    )
    const nextDocument = replacePairedDevices(rackDocument, nextDevices)
    setRackDocument(nextDocument)
    saveRackDocument(nextDocument)
    setDeviceStates((states) =>
      states.map((state) =>
        state.record.id === deviceNameDialog.recordId
          ? { ...state, record: { ...state.record, displayName } }
          : state,
      ),
    )
    setDeviceNameDialog(null)
  }, [deviceNameDialog, pairedDevices, rackDocument])

  const openCalibrationManagementDialog = useCallback(async (target: CalibrationDialogTarget) => {
    const state = deviceStatesRef.current.find((entry) => entry.record.id === target.recordId)
    const driver = state?.drpdDriver
    if (!state || state.status !== 'connected' || !driver) {
      setCalibrationStartError(
        'Connect the device before starting calibration, then open the calibration command again.',
      )
      return
    }
    try {
      if (target.kind === 'current') {
        await driver.refreshState()
        const snapshot = driver.getState()
        if (snapshot.role !== CCBusRole.SINK) {
          setCalibrationStartError(
            'Current calibration can only start when this Dr. PD is already operating as a USB-C Sink. Put the device in Sink mode, connect it to a USB-C source, negotiate a VBUS contract of at least 5 V, then open Current calibration again.',
          )
          return
        }
        const negotiatedVoltageMv = snapshot.sinkInfo?.negotiatedVoltageMv ?? null
        if (negotiatedVoltageMv == null || negotiatedVoltageMv < 5000) {
          setCalibrationStartError(
            'Current calibration can only start after this Dr. PD has negotiated at least 5 V as a USB-C Sink. Request or negotiate a 5 V or higher sink contract from the connected source, confirm VBUS is present, then open Current calibration again.',
          )
          return
        }
        setCalibrationDialogTarget({ ...target, previousRole: snapshot.role })
        return
      }
      const previousRole = driver.getState().role ?? null
      if (previousRole !== CCBusRole.OBSERVER) {
        await driver.ccBus.setRole(CCBusRole.OBSERVER)
        await driver.refreshState()
      }
      setCalibrationDialogTarget({ ...target, previousRole })
    } catch (error) {
      setCalibrationStartError(
        `Unable to start calibration: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }, [])

  const handleOpenCalibrationDialog = useCallback((recordId: string, kind: CalibrationKind) => {
    const state = deviceStatesRef.current.find((entry) => entry.record.id === recordId)
    if (!state || state.status !== 'connected' || !state.drpdDriver) {
      setCalibrationStartError(
        'Connect the device before starting calibration, then open the calibration command again.',
      )
      return
    }
    const target: CalibrationDialogTarget = {
      recordId,
      deviceName: state.record.displayName,
      kind,
    }
    if (isCalibrationWarningSuppressed()) {
      void openCalibrationManagementDialog(target)
      return
    }
    setCalibrationWarningSuppressInput(false)
    setCalibrationWarningTarget(target)
  }, [openCalibrationManagementDialog])

  const handleOpenBMCDecoderConfiguration = useCallback((recordId: string) => {
    const state = deviceStatesRef.current.find((entry) => entry.record.id === recordId)
    if (!state || state.status !== 'connected' || !state.drpdDriver) {
      setCalibrationStartError('Connect the device before opening BMC decoder configuration.')
      return
    }
    const target = { recordId, deviceName: state.record.displayName }
    if (isBMCDecoderConfigurationWarningSuppressed()) {
      setBMCDecoderConfigurationTarget(target)
      return
    }
    setBMCDecoderConfigurationWarningSuppressInput(false)
    setBMCDecoderConfigurationWarningTarget(target)
  }, [])

  const handleConfirmBMCDecoderConfigurationWarning = useCallback(() => {
    if (!bmcDecoderConfigurationWarningTarget) return
    if (bmcDecoderConfigurationWarningSuppressInput) {
      setBMCDecoderConfigurationWarningSuppressed(true)
    }
    setBMCDecoderConfigurationTarget(bmcDecoderConfigurationWarningTarget)
    setBMCDecoderConfigurationWarningTarget(null)
  }, [bmcDecoderConfigurationWarningSuppressInput, bmcDecoderConfigurationWarningTarget])

  const handleConfirmCalibrationWarning = useCallback(() => {
    const target = calibrationWarningTarget
    if (!target) {
      return
    }
    if (calibrationWarningSuppressInput) {
      setCalibrationWarningSuppressed(true)
    }
    setCalibrationWarningTarget(null)
    void openCalibrationManagementDialog(target)
  }, [calibrationWarningSuppressInput, calibrationWarningTarget, openCalibrationManagementDialog])

  const handleCloseCalibrationDialog = useCallback(async () => {
    const target = calibrationDialogTarget
    if (!target) {
      return
    }
    const state = deviceStatesRef.current.find((entry) => entry.record.id === target.recordId)
    const driver = state?.drpdDriver
    try {
      if (
        target.kind === 'voltage' &&
        driver &&
        target.previousRole &&
        target.previousRole !== CCBusRole.OBSERVER
      ) {
        await driver.ccBus.setRole(target.previousRole)
        await driver.refreshState()
      }
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    } finally {
      setCalibrationDialogTarget(null)
    }
  }, [calibrationDialogTarget])

  const handleSetProtectionThresholds = useCallback(async () => {
    const driver = deviceStatesRef.current.find((state) => state.status === 'connected' && state.drpdDriver)?.drpdDriver
    if (!driver) {
      return
    }
    prepareVbusConfigureDialog({
      vbusInfo: driver.getState().vbusInfo ?? null,
      setConfigureError: setGlobalVbusConfigureError,
      setOvpThresholdInput: setGlobalOvpThresholdInput,
      setOcpThresholdInput: setGlobalOcpThresholdInput,
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
      await state.drpdDriver.refreshState()
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
    if (
      !driver ||
      (previousRole !== CCBusRole.OBSERVER && previousRole !== CCBusRole.SINK)
    ) {
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

  const handleSetActiveSinkEprEnabled = useCallback(async (enabled: boolean) => {
    const state = deviceStatesRef.current.find(
      (entry) => entry.status === 'connected' && entry.drpdDriver,
    )
    const driver = state?.drpdDriver
    if (!driver || driver.getState().role !== CCBusRole.SINK) {
      return
    }

    try {
      await driver.sink.setEprEnabled(enabled)
      await driver.refreshState()
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const handleRefreshActiveDeviceState = useCallback(async () => {
    const state = deviceStatesRef.current.find(
      (entry) => entry.status === 'connected' && entry.drpdDriver,
    )
    const driver = state?.drpdDriver
    if (!driver) {
      return
    }

    try {
      await driver.refreshState()
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const handleRestoreMessageLogTableLayout = useCallback(() => {
    saveMessageLogColumnVisibility(DEFAULT_MESSAGE_LOG_COLUMN_VISIBILITY)
    saveMessageLogColumnWidths(DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS)
    notifyMessageLogColumnVisibilityChanged(
      DEFAULT_MESSAGE_LOG_COLUMN_VISIBILITY,
      DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS,
    )
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
        case 'reset-protection':
          void handleResetProtection()
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
    handleResetProtection,
    handleResetTrigger,
    handleSetActiveDeviceRole,
    handleToggleActiveDeviceCapture,
    activeDriverState?.role,
    openGlobalSinkRequestDialog,
    toggleGoodCrcMessages,
  ])

  const headerLogoSrc = resolvedTheme === 'light' ? drpdLogoLight : drpdLogoDark
  const activeVbusInfo = activeDriverState?.vbusInfo ?? null
  const activeTriggerInfo = activeDriverState?.triggerInfo ?? null
  const calibrationDriver = calibrationDialogTarget
    ? deviceStates.find((state) => state.record.id === calibrationDialogTarget.recordId)?.drpdDriver
    : undefined
  const bmcDecoderConfigurationDriver = bmcDecoderConfigurationTarget
    ? deviceStates.find((state) => state.record.id === bmcDecoderConfigurationTarget.recordId)?.drpdDriver
    : undefined
  const globalSelectedSinkPdo = globalSinkPdoList[globalSinkSelectedIndex] ?? null
  const globalSinkParsedVoltage = parseSinkRequestField(
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
  const canCycleUsbConnection =
    !!activeDriver &&
    (activeDriverState?.role === CCBusRole.OBSERVER || activeDriverState?.role === CCBusRole.SINK)
  const canUseSinkBehaviourSettings = supportsSinkBehaviourSettings(
    activeConnectedDeviceState?.record.firmwareVersion,
  )
  const protectionMenuItems = useMemo<MenuItem[]>(
    () => [
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
        meta: 'Y',
        disabled: !activeDriver || !isProtectionTriggered,
        onSelect: () => {
          void handleResetProtection()
        },
      },
    ],
    [activeDriver, handleResetProtection, handleSetProtectionThresholds, isProtectionTriggered],
  )
  const triggerMenuItems = useMemo<MenuItem[]>(
    () => [
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
    [activeDriver, handleResetTrigger, isTriggerActivated, openGlobalTriggerConfigureDialog],
  )
  const captureMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        id: 'logging-toggle-message-flag',
        label: selectedAnnotatableMessage?.flagged === true
          ? `Unflag ${selectedAnnotationTargetLabel}`
          : `Flag ${selectedAnnotationTargetLabel}`,
        disabled: !activeDriver || !selectedAnnotatableMessage,
        onSelect: () => {
          console.debug('[message-annotation] Flag/Unflag menu item selected', {
            label: selectedAnnotatableMessage?.flagged === true
              ? `Unflag ${selectedAnnotationTargetLabel}`
              : `Flag ${selectedAnnotationTargetLabel}`,
            selectionKeys: messageLogSelectionKeys,
          })
          void toggleSelectedMessageFlag()
        },
      },
      {
        id: 'logging-edit-message-comment',
        label: selectedAnnotatableMessage?.comment ? 'Edit comment' : 'Add comment',
        disabled: !activeDriver || !selectedAnnotatableMessage,
        onSelect: openSelectedMessageComment,
      },
      {
        id: 'logging-toggle-capture',
        label: isCaptureEnabled ? 'Disable Capture' : 'Enable Capture',
        meta: 'C',
        disabled: !activeDriver,
        onSelect: () => {
          void handleToggleActiveDeviceCapture()
        },
      },
    ],
    [
      activeDriver,
      handleToggleActiveDeviceCapture,
      isCaptureEnabled,
      messageLogSelectionKeys,
      selectedAnnotationTargetLabel,
      selectedAnnotatableMessage,
      openSelectedMessageComment,
      toggleSelectedMessageFlag,
    ],
  )
  const powerChargeMeterMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        id: 'reset-power-charge-meter',
        label: 'Reset',
        meta: 'Z',
        disabled: !activeDriver,
        onSelect: () => {
          void handleResetPowerChargeMeter()
        },
      },
    ],
    [activeDriver, handleResetPowerChargeMeter],
  )
  const modeMenuItems = useMemo<MenuItem[]>(
    () => [
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
      {
        id: 'mode-separator-power-contract',
        type: 'separator',
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
        id: 'sink-behaviour',
        type: 'submenu',
        label: 'Sink behaviour',
        disabled: !activeDriver || !isSinkMode,
        items: [
          {
            id: 'support-epr-mode',
            type: 'checkbox',
            label: 'Support EPR mode',
            checked: activeDriverState?.sinkEprEnabled === true,
            disabled: !activeDriver || !isSinkMode || !canUseSinkBehaviourSettings,
            onCheckedChange: (checked) => {
              void handleSetActiveSinkEprEnabled(checked)
            },
          },
          {
            id: 'send-inquiry-to-source',
            type: 'submenu',
            label: 'Send inquiry to source',
            disabled:
              !activeDriver ||
              !isSinkMode ||
              activeDriverState?.ccBusRoleStatus !== CCBusRoleStatus.ATTACHED,
            items: ACTIVE_SOURCE_INQUIRIES.map((definition) => ({
              id: `send-inquiry-${definition.id}`,
              label: definition.label,
              disabled: !definition.applicability({
                sinkMode: isSinkMode,
                attached: activeDriverState?.ccBusRoleStatus === CCBusRoleStatus.ATTACHED,
                sprPpsContract:
                  activeDriverState?.sinkInfo?.negotiatedPdo?.type === SinkPdoType.SPR_PPS,
              }),
              onSelect: () => handleSelectSourceInquiry(definition),
            })),
          },
          {
            id: 'inspect-cable',
            type: 'submenu',
            label: 'Inspect cable…',
            disabled:
              !activeDriver ||
              !isSinkMode ||
              activeDriverState?.ccBusRoleStatus !== CCBusRoleStatus.ATTACHED,
            items: ACTIVE_CABLE_INQUIRIES.map((definition) => ({
              id: `inspect-${definition.id}`,
              label: definition.label,
              disabled: !definition.applicability({
                sinkMode: isSinkMode,
                attached: activeDriverState?.ccBusRoleStatus === CCBusRoleStatus.ATTACHED,
              }),
              onSelect: () => setSourceInquiryDefinition(definition),
            })),
          },
        ],
      },
      {
        id: 'mode-separator-usb-cycle',
        type: 'separator',
      },
      {
        id: 'cycle-usb-connection',
        label: 'Cycle USB Connection',
        meta: 'T',
        disabled: !canCycleUsbConnection,
        onSelect: () => {
          void handlePulseUsbConnection()
        },
      },
    ],
    [
      activeDriver,
      activeDriverState?.role,
      activeDriverState?.sinkEprEnabled,
      activeDriverState?.ccBusRoleStatus,
      activeDriverState?.sinkInfo?.negotiatedPdo?.type,
      canCycleUsbConnection,
      canUseSinkBehaviourSettings,
      handlePulseUsbConnection,
      handleSelectSourceInquiry,
      handleSetActiveDeviceRole,
      handleSetActiveSinkEprEnabled,
      isSinkMode,
      openGlobalSinkRequestDialog,
    ],
  )
  const messageLogMenuItems = useMemo<MenuItem[]>(
    () => [
      ...captureMenuItems,
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
        label: isMessageLogMarking ? 'Adding marker...' : 'Add marker after latest entry',
        meta: 'M',
        disabled: !activeDriver || isMessageLogMarking,
        onSelect: addMessageLogMarker,
      },
      {
        id: 'logging-add-marker-at-selection',
        label:
          selectedLogRow?.entryKind === 'event'
            ? 'Insert marker after selected event'
            : 'Insert marker after selected message',
        disabled:
          !activeDriver ||
          isMessageLogMarking ||
          selectedLogRow === null ||
          selectedLogRow.wallClockUs === null,
        onSelect: addMessageLogMarkerAtSelection,
      },
      {
        id: 'logging-separator-import',
        type: 'separator',
      },
      {
        id: 'logging-import-json',
        label: 'Import JSON...',
        disabled: !activeDriver || isMessageLogImporting,
        onSelect: () => {
          setMessageLogImportFile(null)
          setMessageLogImportError(null)
          setIsMessageLogImportDialogOpen(true)
        },
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
        id: 'logging-separator-restore-layout',
        type: 'separator',
      },
      {
        id: 'logging-restore-table-layout',
        label: 'Restore Table Layout',
        onSelect: handleRestoreMessageLogTableLayout,
      },
    ],
    [
      activeDriver,
      addMessageLogMarker,
      addMessageLogMarkerAtSelection,
      captureMenuItems,
      exportSelectedMessageLog,
      handleRestoreMessageLogTableLayout,
      hasSelectedMessages,
      isGoodCrcHidden,
      isMessageLogClearing,
      isMessageLogExporting,
      isMessageLogImporting,
      isMessageLogMarking,
      selectedLogRow,
      messageLogFilters,
      toggleGoodCrcMessages,
    ],
  )
  const menuBarMenus = useMemo<Array<{ id: string; label: string; items: MenuItem[] }>>(() => {
    const connectedDeviceIds = new Set(
      deviceStates
        .filter((entry) => entry.status === 'connected')
        .map((entry) => entry.record.id),
    )
    const connectedPairedDevices = pairedDevices.filter((record) => connectedDeviceIds.has(record.id))
    const disconnectedPairedDevices = pairedDevices.filter((record) => !connectedDeviceIds.has(record.id))
    const buildPairedDeviceMenuItem = (record: RackDeviceRecord): MenuItem => {
      const state = deviceStates.find((entry) => entry.record.id === record.id)
      const isConnected = state?.status === 'connected'
      const hasFirmwareUpdatePrompt = firmwareUpdatePrompt?.deviceRecordId === record.id
      return {
        id: `paired-device-${record.id}`,
        type: 'submenu' as const,
        label: record.displayName,
        muted: !isConnected,
        items: [
          {
            id: `paired-device-${record.id}-hardware`,
            label: `Hardware version: ${record.hardwareRevision ?? 'Unknown'}`,
            disabled: true,
            onSelect: () => undefined,
          },
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
            id: `paired-device-${record.id}-rename`,
            label: 'Change name...',
            onSelect: () => {
              handleOpenDeviceNameDialog(record.id)
            },
          },
          {
            id: `paired-device-${record.id}-update-firmware`,
            label: 'Update firmware...',
            disabled: !hasFirmwareUpdatePrompt || isFirmwareUploadBusy,
            onSelect: () => undefined,
          },
          {
            id: `paired-device-${record.id}-firmware-channel`,
            type: 'submenu' as const,
            label: 'Update channel',
            items: [
              {
                id: `paired-device-${record.id}-firmware-channel-production`,
                type: 'checkbox' as const,
                label: 'Production',
                checked: firmwareUpdateChannel === 'production',
                onCheckedChange: () => setFirmwareUpdateChannel('production'),
              },
              {
                id: `paired-device-${record.id}-firmware-channel-beta`,
                type: 'checkbox' as const,
                label: 'Beta',
                checked: firmwareUpdateChannel === 'beta',
                onCheckedChange: () => setFirmwareUpdateChannel('beta'),
              },
            ],
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
            id: `paired-device-${record.id}-calibrate`,
            type: 'submenu' as const,
            label: 'Calibrate',
            disabled: !isConnected,
            items: [
              {
                id: `paired-device-${record.id}-calibrate-voltage`,
                label: 'Voltage...',
                disabled: !isConnected,
                onSelect: () => {
                  handleOpenCalibrationDialog(record.id, 'voltage')
                },
              },
              {
                id: `paired-device-${record.id}-calibrate-current`,
                label: 'Current...',
                disabled: !isConnected,
                onSelect: () => {
                  handleOpenCalibrationDialog(record.id, 'current')
                },
              },
              ...(supportsBMCDecoderConfiguration(record.firmwareVersion)
                ? [{
                    id: `paired-device-${record.id}-configure-bmc-decoder`,
                    label: 'Internal settings...',
                    disabled: !isConnected,
                    onSelect: () => {
                      handleOpenBMCDecoderConfiguration(record.id)
                    },
                  }]
                : []),
            ],
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
      }
    }
    const deviceItems: MenuItem[] = [
      ...(pairedDevices.length > 0
        ? [
            ...connectedPairedDevices.map(buildPairedDeviceMenuItem),
            ...(connectedPairedDevices.length > 0 && disconnectedPairedDevices.length > 0
              ? [{
                  id: 'device-separator-disconnected',
                  type: 'separator' as const,
                }]
              : []),
            ...disconnectedPairedDevices.map(buildPairedDeviceMenuItem),
          ]
        : [
            {
              id: 'no-paired-devices',
              label: 'No paired devices',
              disabled: true,
              onSelect: () => undefined,
            } satisfies MenuItem,
          ]),
      {
        id: 'device-separator',
        type: 'separator',
      },
      {
        id: 'pair-new-device',
        label: 'Pair new device...',
        onSelect: () => {
          void handleConnectDevice()
        },
      },
    ]

    return [
      {
        id: 'device',
        label: 'Device',
        items: deviceItems,
      },
      {
        id: 'mode',
        label: 'Mode',
        items: modeMenuItems,
      },
      {
        id: 'capture',
        label: 'Capture',
        items: messageLogMenuItems,
      },
      {
        id: 'protection',
        label: 'Protection',
        items: protectionMenuItems,
      },
      {
        id: 'power-charge-meter',
        label: 'Power/Charge Meter',
        items: powerChargeMeterMenuItems,
      },
      {
        id: 'trigger',
        label: 'Trigger',
        items: triggerMenuItems,
      },
      {
        id: 'display',
        label: 'Display',
        items: [
          {
            id: 'show-timestrip',
            type: 'checkbox',
            label: 'Show Timestrip',
            checked: showTimestrip,
            onCheckedChange: () => setShowTimestrip((current) => !current),
          },
          {
            id: 'theme',
            type: 'submenu',
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
              {
                id: 'theme-high-contrast-separator',
                type: 'separator',
              },
              {
                id: 'theme-high-contrast',
                type: 'checkbox',
                label: 'High contrast',
                checked: theme === 'high-contrast',
                onCheckedChange: () => setTheme('high-contrast'),
              },
              {
                id: 'theme-colorblind',
                type: 'checkbox',
                label: 'Colourblind',
                checked: theme === 'colorblind',
                onCheckedChange: () => setTheme('colorblind'),
              },
            ],
          },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          ...(canInstall
            ? [
                {
                  id: 'install-drpd',
                  label: 'Install Dr. PD as app...',
                  onSelect: () => {
                    void promptInstall()
                  },
                },
                {
                  id: 'help-separator-install',
                  type: 'separator' as const,
                },
              ]
            : []),
          {
            id: 'contact-us',
            label: 'Contact us...',
            onSelect: handleContactUs,
          },
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
    canInstall,
    deviceStates,
    firmwareUpdateChannel,
    firmwareUpdatePrompt,
    handleConnectPairedDevice,
    handleDisconnectDevice,
    handleOpenCalibrationDialog,
    handleOpenBMCDecoderConfiguration,
    handleOpenDeviceNameDialog,
    handleOpenDocumentation,
    handleRemoveDevice,
    handleRefreshActiveDeviceState,
    isFirmwareUploadBusy,
    messageLogMenuItems,
    modeMenuItems,
    pairedDevices,
    powerChargeMeterMenuItems,
    protectionMenuItems,
    promptInstall,
    showTimestrip,
    theme,
    triggerMenuItems,
  ])

  return (
    <div className={styles.page} data-layout-mode="full">
      <div className={styles.menuBarViewport}>
        <div className={styles.menuBarScroll}>
          <div className={styles.menuBar}>
            <MenuBar>
              {menuBarMenus.map((menu) => (
                <Menu
                  key={menu.id}
                  id={menu.id}
                  label={`${menu.label} menu`}
                  align="start"
                  items={menu.items}
                  trigger={(props) => {
                    const handleClick: typeof props.onClick = (event) => {
                      if (menu.id !== 'mode') {
                        props.onClick?.(event)
                        return
                      }
                      void handleRefreshActiveDeviceState().finally(() => {
                        props.onClick?.(event)
                      })
                    }

                    return (
                      <button
                        {...props}
                        type="button"
                        className={styles.menuBarButton}
                        onClick={handleClick}
                      >
                        {menu.label}
                      </button>
                    )
                  }}
                />
              ))}
            </MenuBar>
            {activeConnectedDeviceState ? (
              <ContextMenu
                label="Device name menu"
                items={[
                  {
                    id: `active-device-${activeConnectedDeviceState.record.id}-rename`,
                    label: 'Change name...',
                    onSelect: () => {
                      handleOpenDeviceNameDialog(activeConnectedDeviceState.record.id)
                    },
                  },
                ]}
              >
                {(props) => (
                  <div
                    {...props}
                    className={`${styles.menuBarDeviceStatus} ${styles.menuBarDeviceStatusContextTarget}`}
                    aria-live="polite"
                  >
                    {`Connected to ${activeConnectedDeviceState.record.displayName}`}
                  </div>
                )}
              </ContextMenu>
            ) : (
              <div className={styles.menuBarDeviceStatus} aria-live="polite">
                Waiting for device...
              </div>
            )}
            <img
              className={styles.menuBarStripes}
              src={t76Stripes}
              alt=""
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
      {!currentRack?.hideHeader ? (
        <div className={styles.headerViewport}>
          <div className={styles.headerScroll}>
            <header className={styles.header}>
              <div className={styles.headerContent}>
                <div className={styles.titleBlock}>
                  <h1 className={styles.title}>
                    <span className={styles.srOnly}>{currentRack?.name ?? 'Rack'}</span>
                    <img className={styles.logo} src={headerLogoSrc} alt="Dr.PD" />
                  </h1>
                  <HeaderVbusMetrics
                    driver={activeConnectedDeviceState?.drpdDriver}
                    captureMenuItems={captureMenuItems}
                    modeMenuItems={modeMenuItems}
                    powerChargeMeterMenuItems={powerChargeMeterMenuItems}
                    protectionMenuItems={protectionMenuItems}
                    triggerMenuItems={triggerMenuItems}
                  />
                </div>
              </div>
            </header>
          </div>
        </div>
      ) : null}
      <main className={styles.content}>
        {isLoading ? (
          <div className={`${styles.notice} ${styles.noticeInfo}`}>Loading rack...</div>
        ) : null}
        {!isLoading && deviceError ? (
          <div className={`${styles.notice} ${styles.noticeError}`}>
            Device error: {deviceError}
          </div>
        ) : null}
        {!isLoading && error ? (
          <div className={`${styles.notice} ${styles.noticeError}`}>Error: {error}</div>
        ) : null}
        {!isLoading && !error && renderedRack ? (
          <RackRenderer
            rack={renderedRack}
            instruments={instrumentDefinitions}
            deviceStates={deviceStates}
            activeDeviceRecord={activeDeviceRecord}
            isEditMode={isRackEditMode}
            onRemoveInstrument={handleRemoveRackInstrument}
            onInstrumentDragStart={setDraggedRackInstrumentId}
            onInstrumentDrop={handleRackInstrumentDrop}
            onInstrumentDragEnd={() => setDraggedRackInstrumentId(null)}
            onInstrumentResize={handleRackInstrumentResize}
            onRowResize={handleRackRowResize}
            onUpdateDeviceConfig={handleUpdateDeviceConfig}
            messageLogMenuItems={messageLogMenuItems}
          />
        ) : null}
        {!isLoading && !error && rackDocument && !activeRack ? (
          <div className={`${styles.notice} ${styles.noticeInfo}`}>No racks available.</div>
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
      <Dialog
        open={isMessageCommentDialogOpen}
        onOpenChange={setIsMessageCommentDialogOpen}
        title={selectedAnnotatableMessage?.comment ? 'Edit comment' : 'Add comment'}
        footer={
          <>
            {selectedAnnotatableMessage?.comment ? (
              <DialogButton
                className={styles.messageCommentDeleteButton}
                variant="danger"
                onClick={() => {
                  setIsMessageCommentDialogOpen(false)
                  setIsDeleteMessageCommentConfirmOpen(true)
                }}
              >
                Delete Comment
              </DialogButton>
            ) : null}
            <DialogButton onClick={() => setIsMessageCommentDialogOpen(false)}>Cancel</DialogButton>
            <DialogButton
              variant="primary"
              disabled={!messageCommentDraft.trim()}
              onClick={() => void saveSelectedMessageComment()}
            >
              Save
            </DialogButton>
          </>
        }
      >
        <textarea
          className={styles.messageCommentEditor}
          aria-label={`${selectedAnnotationTargetLabel === 'mark' ? 'Mark' : 'Message'} comment Markdown`}
          value={messageCommentDraft}
          autoFocus
          onChange={(event) => setMessageCommentDraft(event.currentTarget.value)}
        />
        <p className={`${messageLogStyles.headerPopupHint} ${styles.messageCommentHint}`}>
          Markdown supported.
        </p>
      </Dialog>
      <Dialog
        open={isDeleteMessageCommentConfirmOpen}
        onOpenChange={(open) => {
          setIsDeleteMessageCommentConfirmOpen(open)
          if (!open) setIsMessageCommentDialogOpen(true)
        }}
        title="Delete comment?"
        footer={
          <>
            <DialogButton
              onClick={() => {
                setIsDeleteMessageCommentConfirmOpen(false)
                setIsMessageCommentDialogOpen(true)
              }}
            >
              Cancel
            </DialogButton>
            <DialogButton variant="danger" onClick={() => void deleteSelectedMessageComment()}>
              Delete Comment
            </DialogButton>
          </>
        }
      >
        <p>Delete this {selectedAnnotationTargetLabel} comment? This cannot be undone.</p>
      </Dialog>
      <Dialog
        open={isStartupPairingDialogOpen}
        onOpenChange={setIsStartupPairingDialogOpen}
        title="Pair a device"
        footer={
          <>
            <DialogButton onClick={() => setIsStartupPairingDialogOpen(false)}>No</DialogButton>
            <DialogButton
              variant="primary"
              onClick={() => {
                setIsStartupPairingDialogOpen(false)
                void handleConnectDevice()
              }}
            >
              Yes
            </DialogButton>
          </>
        }
      >
        <p>
          No Dr. PD is paired yet. Pair your Dr. PD to allow this browser to communicate with it
          over USB. Would you like to pair it now?
        </p>
      </Dialog>
      <Dialog
        open={deviceNameDialog != null}
        onOpenChange={handleDeviceNameDialogOpenChange}
        title="Change device name"
        description="Choose the name shown in the Device menu."
        footer={
          <>
            <DialogButton onClick={() => setDeviceNameDialog(null)}>Cancel</DialogButton>
            <DialogButton variant="primary" onClick={handleSaveDeviceName}>
              Save
            </DialogButton>
          </>
        }
      >
        <DialogForm>
          <DialogFormRow
            label="Name"
            htmlFor="device-name"
            errorText={deviceNameDialog?.error ?? undefined}
          >
            <DialogInput
              id="device-name"
              value={deviceNameDialog?.name ?? ''}
              autoFocus
              onChange={(event) => handleDeviceNameInputChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSaveDeviceName()
                }
              }}
            />
          </DialogFormRow>
        </DialogForm>
      </Dialog>
      <CalibrationSafetyDialog
        target={calibrationWarningTarget}
        suppressWarning={calibrationWarningSuppressInput}
        onSuppressWarningChange={setCalibrationWarningSuppressInput}
        onCancel={() => {
          setCalibrationWarningTarget(null)
          setCalibrationWarningSuppressInput(false)
        }}
        onConfirm={handleConfirmCalibrationWarning}
      />
      <CalibrationStartErrorDialog
        message={calibrationStartError}
        onClose={() => setCalibrationStartError(null)}
      />
      <BMCDecoderConfigurationSafetyDialog
        target={bmcDecoderConfigurationWarningTarget}
        suppressWarning={bmcDecoderConfigurationWarningSuppressInput}
        onSuppressWarningChange={setBMCDecoderConfigurationWarningSuppressInput}
        onCancel={() => {
          setBMCDecoderConfigurationWarningTarget(null)
          setBMCDecoderConfigurationWarningSuppressInput(false)
        }}
        onConfirm={handleConfirmBMCDecoderConfigurationWarning}
      />
      <BMCDecoderConfigurationDialog
        target={bmcDecoderConfigurationTarget}
        driver={bmcDecoderConfigurationDriver}
        onOpenChange={(open) => {
          if (!open) setBMCDecoderConfigurationTarget(null)
        }}
      />
      <CalibrationManagementDialog
        target={calibrationDialogTarget}
        driver={calibrationDriver}
        onOpenChange={(open) => {
          if (!open) {
            void handleCloseCalibrationDialog()
          }
        }}
        onCalibrated={async () => {
          if (calibrationDriver) {
            await calibrationDriver.refreshState()
          }
        }}
      />
      <VbusConfigurePopover
        instrumentId="global-vbus"
        open={isGlobalVbusDialogOpen}
        onOpenChange={setIsGlobalVbusDialogOpen}
        driver={activeDriver}
        vbusInfo={activeVbusInfo}
        ovpThresholdInput={globalOvpThresholdInput}
        ocpThresholdInput={globalOcpThresholdInput}
        configureError={globalVbusConfigureError}
        isApplyingConfig={isGlobalVbusApplying}
        setOvpThresholdInput={setGlobalOvpThresholdInput}
        setOcpThresholdInput={setGlobalOcpThresholdInput}
        setConfigureError={setGlobalVbusConfigureError}
        setIsApplyingConfig={setIsGlobalVbusApplying}
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
      <SourceInquiryDialog
        key={sourceInquiryDefinition?.id ?? 'no-source-inquiry'}
        open={sourceInquiryDefinition !== null}
        onOpenChange={(open) => {
          if (!open) setSourceInquiryDefinition(null)
        }}
        definition={sourceInquiryDefinition}
        client={activeDriver?.sink ?? null}
        onResponse={handleSourceInquiryResponse}
        logOnly={sourceInquiryDefinition != null &&
          isLogOnlySourceInquiry(sourceInquiryDefinition)}
        publishLogEvent={async (title, summary) => {
          if (!activeDriver) return
          await activeDriver.markLog(`${title}\n${summary}`)
        }}
      />
      <Dialog
        open={pendingCaptureWarningInquiry !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCaptureWarningInquiry(null)
            setSuppressInquiryCaptureWarning(false)
          }
        }}
        title="Capture is off"
        footer={
          <div className={styles.inquiryCaptureWarningFooter}>
            <label className={styles.inquiryCaptureWarningCheckbox}>
              <input
                type="checkbox"
                checked={suppressInquiryCaptureWarning}
                onChange={(event) =>
                  setSuppressInquiryCaptureWarning(event.currentTarget.checked)}
              />
              <span>Do not show this again</span>
            </label>
            <div className={styles.inquiryCaptureWarningButtons}>
              <DialogButton onClick={() => {
                setPendingCaptureWarningInquiry(null)
                setSuppressInquiryCaptureWarning(false)
              }}>CANCEL</DialogButton>
              <DialogButton variant="primary" onClick={() => {
                const inquiry = pendingCaptureWarningInquiry
                if (suppressInquiryCaptureWarning) {
                  window.localStorage.setItem(
                    INQUIRY_CAPTURE_WARNING_SUPPRESSED_STORAGE_KEY,
                    'true',
                  )
                }
                setPendingCaptureWarningInquiry(null)
                setSuppressInquiryCaptureWarning(false)
                if (inquiry) proceedWithLogOnlyInquiry(inquiry)
              }}>REQUEST ANYWAY</DialogButton>
            </div>
          </div>
        }
      >
        <p>
          Capture is turned off. The response to this request will not appear in Message Log.
        </p>
      </Dialog>
      <Dialog
        open={getStatusConfirmationDefinition !== null}
        onOpenChange={(open) => {
          if (!open) {
            setGetStatusConfirmationDefinition(null)
            setSuppressGetStatusSideEffectWarning(false)
          }
        }}
        title={getStatusConfirmationDefinition?.confirmation?.title ?? 'Send Get_Status?'}
        footer={
          <div className={styles.inquiryCaptureWarningFooter}>
            <label className={styles.inquiryCaptureWarningCheckbox}>
              <input
                type="checkbox"
                checked={suppressGetStatusSideEffectWarning}
                onChange={(event) =>
                  setSuppressGetStatusSideEffectWarning(event.currentTarget.checked)}
              />
              <span>Do not show this again</span>
            </label>
            <div className={styles.inquiryCaptureWarningButtons}>
              <DialogButton
                onClick={() => {
                  setGetStatusConfirmationDefinition(null)
                  setSuppressGetStatusSideEffectWarning(false)
                }}
              >CANCEL</DialogButton>
              <DialogButton
                variant="primary"
                onClick={() => {
                  if (!activeDriver) return
                  if (suppressGetStatusSideEffectWarning) {
                    window.localStorage.setItem(
                      GET_STATUS_SIDE_EFFECT_WARNING_SUPPRESSED_STORAGE_KEY,
                      'true',
                    )
                  }
                  setDeviceError(null)
                  void activeDriver.sink
                    .sendInquiry(SinkInquiryType.GET_STATUS)
                    .catch((error) =>
                      setDeviceError(error instanceof Error ? error.message : String(error)))
                  setGetStatusConfirmationDefinition(null)
                  setSuppressGetStatusSideEffectWarning(false)
                }}
              >{getStatusConfirmationDefinition?.confirmation?.confirmLabel ?? 'SEND INQUIRY'}</DialogButton>
            </div>
          </div>
        }
      >
        <p role="alert">
          {getStatusConfirmationDefinition?.confirmation?.body}
        </p>
      </Dialog>
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
      <MessageLogImportPopover
        open={isMessageLogImportDialogOpen}
        onOpenChange={setIsMessageLogImportDialogOpen}
        selectedFileName={messageLogImportFile?.name ?? null}
        importError={messageLogImportError}
        isImporting={isMessageLogImporting}
        onCancel={resetMessageLogImportDialog}
        onFileSelect={(file) => {
          setMessageLogImportFile(file)
          setMessageLogImportError(null)
        }}
        onImport={() => {
          if (!messageLogImportFile) {
            return
          }
          setIsMessageLogImportDialogOpen(false)
          setIsMessageLogImportConfirmOpen(true)
        }}
      />
      <MessageLogImportConfirmPopover
        open={isMessageLogImportConfirmOpen}
        onOpenChange={setIsMessageLogImportConfirmOpen}
        isImporting={isMessageLogImporting}
        onCancel={() => {
          setIsMessageLogImportConfirmOpen(false)
          setIsMessageLogImportDialogOpen(true)
        }}
        onConfirm={confirmMessageLogImport}
      />
      <TriggerConfigurePopover
        open={isGlobalTriggerDialogOpen}
        onOpenChange={setIsGlobalTriggerDialogOpen}
        instrumentId="global-trigger"
        eventTypeInput={globalTriggerEventTypeInput}
        senderFilterInput={globalTriggerSenderInput}
        messageTypeFiltersInput={globalTriggerMessageTypeFiltersInput}
        eventThresholdInput={globalTriggerThresholdInput}
        autoRepeatInput={globalTriggerAutoRepeatInput}
        syncModeInput={globalTriggerSyncModeInput}
        syncPulseWidthUsInput={globalTriggerSyncPulseWidthUsInput}
        configureError={globalTriggerConfigureError}
        isApplyingConfig={isGlobalTriggerApplying}
        setEventTypeInput={setGlobalTriggerEventTypeInput}
        setSenderFilterInput={setGlobalTriggerSenderInput}
        setMessageTypeFiltersInput={setGlobalTriggerMessageTypeFiltersInput}
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
            setGlobalTriggerConfigureError('Pulse width must be an integer greater than or equal to 1 µs.')
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
  captureMenuItems,
  modeMenuItems,
  powerChargeMeterMenuItems,
  protectionMenuItems,
  triggerMenuItems,
}: {
  driver?: DRPDDriverRuntime
  captureMenuItems: MenuItem[]
  modeMenuItems: MenuItem[]
  powerChargeMeterMenuItems: MenuItem[]
  protectionMenuItems: MenuItem[]
  triggerMenuItems: MenuItem[]
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
  const [captureEnabled, setCaptureEnabled] = useState<OnOffState | null>(
    driver ? driver.getState().captureEnabled ?? null : null,
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
    setCaptureEnabled(initialState?.captureEnabled ?? null)
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
        !changed.includes('triggerInfo') &&
        !changed.includes('captureEnabled')
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
      if (!changed || changed.includes('captureEnabled')) {
        setCaptureEnabled(state.captureEnabled ?? null)
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
  const accumulationElapsedText = formatHeaderAccumulatorElapsed(
    analogMonitor?.accumulationElapsedTimeUs,
  )
  const ovpValueText = formatHeaderProtectionThreshold(vbusInfo?.ovpThresholdMv, 1000, 'V')
  const ocpValueText = formatHeaderProtectionThreshold(vbusInfo?.ocpThresholdMa, 1000, 'A')
  const isOvpTriggered = vbusInfo?.status === VBusStatus.OVP
  const isOcpTriggered = vbusInfo?.status === VBusStatus.OCP
  const activeSinkInfo = role === CCBusRole.SINK ? sinkInfo : null
  const captureStatusText = formatHeaderCaptureStatus(captureEnabled)
  const roleText = formatHeaderRoleLabel(role)
  const roleStatusText = formatHeaderRoleStatusLabel(roleStatus)
  const sinkContractText = formatHeaderSinkContract(activeSinkInfo)
  const triggerStateText = formatHeaderTriggerStatus(triggerInfo?.status)
  const triggerCountText = formatHeaderTriggerCount(triggerInfo?.eventCount)
  const isTriggerStateTriggered = triggerInfo?.status === TriggerStatus.TRIGGERED
  const isObserverMode = role === CCBusRole.OBSERVER
  const isSinkMode = role === CCBusRole.SINK
  const isSinkAttached = isSinkMode && roleStatus === CCBusRoleStatus.ATTACHED
  const isFrontPanelDisabled = !driver || role === CCBusRole.DISABLED || isObserverMode
  const areFrontPanelUsbPortsEnabled = Boolean(driver) && role !== CCBusRole.DISABLED
  const aggregateObserverConnected = isObserverMode && roleStatus === CCBusRoleStatus.ATTACHED
  const isFrontPanelPort1Connected =
    Boolean(driver) && (
      isObserverMode ? aggregateObserverConnected : isSinkMode ? isSinkAttached : role !== CCBusRole.DISABLED
    )
  const isFrontPanelPort2Connected =
    Boolean(driver) && (
      isObserverMode ? aggregateObserverConnected : role !== CCBusRole.DISABLED && !isSinkMode
    )
  const isFrontPanelPort1Disabled = !driver || role === CCBusRole.DISABLED
  const isFrontPanelPort2Disabled = isFrontPanelPort1Disabled || isSinkMode
  const frontPanelFlow = aggregateObserverConnected
    ? 'monitor'
    : isFrontPanelDisabled
      ? 'off'
      : isSinkAttached
        ? 'sink'
        : 'idle'
  const frontPanelPortRailRoute = isSinkMode ? 'banana' : 'ports'
  const frontPanelPortRailDirection =
    signedVbusCurrent == null || signedVbusCurrent === 0
      ? 'idle'
      : frontPanelPortRailRoute === 'banana'
        ? signedVbusCurrent > 0
          ? 'port-1-to-banana'
          : 'banana-to-port-1'
        : signedVbusCurrent > 0
          ? 'port-1-to-port-2'
          : 'port-2-to-port-1'

  return (
    <div className={styles.headerVbusMetrics} aria-label="VBUS metrics">
      <HeaderFrontPanelVisual
        disabled={isFrontPanelDisabled}
        bananaDisabled={!driver || (isSinkMode && !isSinkAttached)}
        port1Connected={isFrontPanelPort1Connected}
        port2Connected={isFrontPanelPort2Connected}
        port1Disabled={isFrontPanelPort1Disabled}
        port2Disabled={isFrontPanelPort2Disabled}
        usbPortsEnabled={areFrontPanelUsbPortsEnabled}
        flow={frontPanelFlow}
        portRailRoute={frontPanelPortRailRoute}
        portRailDirection={frontPanelPortRailDirection}
        role={role}
        roleStatus={roleStatus}
      />
      <div className={styles.headerVbusPrimaryMetrics}>
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
        </div>
        <div className={styles.headerVbusDivider} aria-hidden="true" />
        <div className={`${styles.headerVbusSecondaryGroup} ${styles.headerVbusPowerGroup}`}>
          <div className={`${styles.headerVbusMetric} ${styles.headerVbusPower}`}>
            <span className={styles.headerVbusNumber}>
              <HeaderGhostValue text={powerText} />
            </span>
            <span className={styles.headerVbusUnit}>W</span>
          </div>
          <ContextMenu label="Power/Charge Meter menu" items={powerChargeMeterMenuItems}>
            {(props) => (
              <div
                {...props}
                className={styles.headerVbusAccumulatorPanel}
                aria-label="Power and charge meter"
              >
                <div className={styles.headerVbusAccumulatorValueRow} aria-label="Energy">
                  <HeaderAccumulatorValue text={accumulatedChargeText} unit="Ah" />
                </div>
                <div className={styles.headerVbusAccumulatorValueRow} aria-label="Power">
                  <HeaderAccumulatorValue text={accumulatedEnergyText} unit="Wh" />
                </div>
                <div className={styles.headerVbusAccumulatorValueRow} aria-label="Time">
                  <HeaderAccumulatorElapsedValue text={accumulationElapsedText} />
                </div>
              </div>
            )}
          </ContextMenu>
        </div>
      </div>
      <div className={styles.headerVbusStatusGrid}>
        <ContextMenu label="Mode menu" items={modeMenuItems}>
          {(props) => (
            <div
              {...props}
              className={styles.headerVbusProtection}
              aria-label="Mode and profile status"
            >
              <div className={styles.headerVbusProtectionCell}>
                <span className={styles.headerVbusProtectionLabel}>MODE</span>
                <span className={styles.headerVbusRoleStatusValue}>{roleText}</span>
              </div>
              <div className={styles.headerVbusProtectionCell}>
                <span className={styles.headerVbusProtectionLabel}>PROFILE</span>
                <span
                  className={`${styles.headerVbusRoleStatusValue} ${styles.headerVbusProfileStatusValue}`}
                >
                  {sinkContractText}
                </span>
              </div>
            </div>
          )}
        </ContextMenu>
        <ContextMenu label="Capture menu" items={captureMenuItems}>
          {(props) => (
            <div
              {...props}
              className={styles.headerVbusProtection}
              aria-label="Status and capture status"
            >
              <div className={styles.headerVbusProtectionCell}>
                <span className={styles.headerVbusProtectionLabel}>STATUS</span>
                <span className={styles.headerVbusRoleStatusValue}>{roleStatusText}</span>
              </div>
              <div className={styles.headerVbusProtectionCell}>
                <span className={styles.headerVbusProtectionLabel}>CAPTURE</span>
                <span className={styles.headerVbusRoleStatusValue}>{captureStatusText}</span>
              </div>
            </div>
          )}
        </ContextMenu>
        <ContextMenu label="Protection menu" items={protectionMenuItems}>
          {(props) => (
            <div
              {...props}
              className={styles.headerVbusProtection}
              aria-label="VBUS protection"
            >
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
          )}
        </ContextMenu>
        <ContextMenu label="Trigger menu" items={triggerMenuItems}>
          {(props) => (
            <div
              {...props}
              className={styles.headerVbusProtection}
              aria-label="Trigger status"
            >
              <div className={styles.headerVbusProtectionCell}>
                <span className={styles.headerVbusProtectionLabel}>SYNC STATE</span>
                <span
                  className={styles.headerVbusRoleStatusValue}
                  data-alert={isTriggerStateTriggered ? 'true' : 'false'}
                >
                  {triggerStateText}
                </span>
              </div>
              <div className={styles.headerVbusProtectionCell}>
                <span className={styles.headerVbusProtectionLabel}>EVENT COUNT</span>
                <span className={styles.headerVbusRoleStatusValue}>{triggerCountText}</span>
              </div>
            </div>
          )}
        </ContextMenu>
      </div>
    </div>
  )
}

/** Resolve a safe localStorage instance when available. */
const getBrowserStorage = (): Storage | null => {
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
  const storage = getBrowserStorage()
  const storedTheme = storage?.getItem(THEME_STORAGE_KEY)
  if (storage?.getItem(LEGACY_HIGH_CONTRAST_STORAGE_KEY) === 'true') {
    return 'high-contrast'
  }
  if (
    storedTheme === 'light' ||
    storedTheme === 'dark' ||
    storedTheme === 'system' ||
    storedTheme === 'high-contrast' ||
    storedTheme === 'colorblind'
  ) {
    return storedTheme
  }
  return 'system'
}

/** Read the saved timestrip visibility preference, defaulting to shown. */
const getStoredShowTimestrip = (): boolean => {
  const storage = getBrowserStorage()
  const stored = storage?.getItem(SHOW_TIMESTRIP_STORAGE_KEY)
  return stored !== 'false'
}

/** Read whether the calibration warning is suppressed in this browser. */
const isCalibrationWarningSuppressed = (): boolean => {
  const storage = getBrowserStorage()
  return storage?.getItem(CALIBRATION_WARNING_SUPPRESSED_STORAGE_KEY) === 'true'
}

/** Save calibration warning suppression in this browser. */
const setCalibrationWarningSuppressed = (suppressed: boolean): void => {
  const storage = getBrowserStorage()
  if (storage) {
    storage.setItem(CALIBRATION_WARNING_SUPPRESSED_STORAGE_KEY, suppressed ? 'true' : 'false')
  }
}

/** Read whether the BMC decoder configuration warning is suppressed. */
const isBMCDecoderConfigurationWarningSuppressed = (): boolean => {
  const storage = getBrowserStorage()
  return storage?.getItem(BMC_DECODER_CONFIGURATION_WARNING_SUPPRESSED_STORAGE_KEY) === 'true'
}

/** Save BMC decoder configuration warning suppression in this browser. */
const setBMCDecoderConfigurationWarningSuppressed = (suppressed: boolean): void => {
  const storage = getBrowserStorage()
  if (storage) {
    storage.setItem(
      BMC_DECODER_CONFIGURATION_WARNING_SUPPRESSED_STORAGE_KEY,
      suppressed ? 'true' : 'false',
    )
  }
}

/** Return a rack copy without standalone timestrip instruments and empty rows. */
const hideTimestripInstrument = (rack: RackDefinition): RackDefinition => ({
  ...rack,
  rows: rack.rows
    .map((row) => ({
      ...row,
      instruments: row.instruments.filter(
        (instrument) => instrument.instrumentIdentifier !== TIMESTRIP_INSTRUMENT_IDENTIFIER,
      ),
    }))
    .filter((row) => row.instruments.length > 0),
})

/** Resolve the effective theme used for themed assets. */
const getResolvedTheme = (theme: ThemeMode): 'light' | 'dark' => {
  if (theme === 'light' || theme === 'dark') {
    return theme
  }
  if (theme === 'high-contrast' || theme === 'colorblind') {
    return 'dark'
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

const resizeAdjacentRackInstruments = (
  rack: RackDefinition,
  payload: RackInstrumentResizePayload,
): RackDefinition => ({
  ...rack,
  rows: rack.rows.map((row) => {
    if (row.id !== payload.rowId) {
      return row
    }
    const left = row.instruments.find((instrument) => instrument.id === payload.leftInstrumentId)
    const right = row.instruments.find((instrument) => instrument.id === payload.rightInstrumentId)
    if (!left || !right) {
      return row
    }
    const pairSize = payload.leftSize + payload.rightSize
    const pairFlex = payload.leftFlex + payload.rightFlex
    if (pairSize <= 0 || pairFlex <= 0) {
      return row
    }
    const nextLeftRatio = Math.max(0.01, Math.min(0.99, (payload.leftSize + payload.delta) / pairSize))
    const nextLeftFlex = clampFlexPairSide(pairFlex * nextLeftRatio, pairFlex)
    const nextRightFlex = pairFlex - nextLeftFlex
    return {
      ...row,
      instruments: row.instruments.map((instrument) => {
        if (instrument.id === left.id) {
          return { ...instrument, flex: nextLeftFlex }
        }
        if (instrument.id === right.id) {
          return { ...instrument, flex: nextRightFlex }
        }
        return instrument
      }),
    }
  }),
})

const resizeAdjacentRackRows = (
  rack: RackDefinition,
  payload: RackRowResizePayload,
): RackDefinition => {
  const upper = rack.rows.find((row) => row.id === payload.upperRowId)
  const lower = rack.rows.find((row) => row.id === payload.lowerRowId)
  if (!upper || !lower) {
    return rack
  }
  const pairSize = payload.upperSize + payload.lowerSize
  const pairFlex = payload.upperFlex + payload.lowerFlex
  if (pairSize <= 0 || pairFlex <= 0) {
    return rack
  }
  const nextUpperRatio = Math.max(0.01, Math.min(0.99, (payload.upperSize + payload.delta) / pairSize))
  const nextUpperFlex = clampFlexPairSide(pairFlex * nextUpperRatio, pairFlex)
  const nextLowerFlex = pairFlex - nextUpperFlex

  return {
    ...rack,
    rows: rack.rows.map((row) => {
      if (row.id === upper.id) {
        return { ...row, flex: nextUpperFlex }
      }
      if (row.id === lower.id) {
        return { ...row, flex: nextLowerFlex }
      }
      return row
    }),
  }
}

const clampFlexPairSide = (flex: number, pairFlex: number): number => {
  const minFlex = 0.1
  if (pairFlex <= minFlex * 2) {
    return pairFlex / 2
  }
  return Math.max(minFlex, Math.min(pairFlex - minFlex, flex))
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
    displayName: buildRackDeviceDisplayName(definition, serial),
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: serial,
    productName: device.productName ?? undefined
  }
}

/**
 * Build the initial paired-device display name.
 *
 * @param definition - Matching device definition.
 * @param serial - Optional USB serial number.
 * @returns Initial display name for the paired device.
 */
const buildRackDeviceDisplayName = (
  definition: { identifier: string; displayName: string },
  serial?: string,
): string => {
  if (definition.identifier === 'com.mta.drpd' && serial) {
    return `Dr. PD #${serial}`
  }
  return definition.displayName
}

/**
 * Preserve user-owned fields when replacing an existing device record.
 *
 * @param record - Newly detected device record.
 * @param devices - Existing paired device records.
 * @returns Merged device record.
 */
const mergeExistingRackDeviceRecord = (
  record: RackDeviceRecord,
  devices: RackDeviceRecord[],
): RackDeviceRecord => {
  const existing = devices.find((device) => device.id === record.id)
  if (!existing) {
    return record
  }
  return {
    ...existing,
    ...record,
    displayName: existing.displayName,
    config: existing.config ?? record.config,
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
