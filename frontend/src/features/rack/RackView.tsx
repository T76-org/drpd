import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Device } from '../../lib/device'
import type { DeviceIdentity } from '../../lib/device'
import type { Instrument } from '../../lib/instrument'
import {
  CCBusRole,
  DRPDDeviceDefinition,
  SinkState,
  buildCapturedLogSelectionKey,
  buildDefaultLoggingConfig,
  decodeLoggedCapturedMessage,
  normalizeDRPDDeviceConfig,
  normalizeLoggingConfig,
  uploadDRPDFirmwareUF2,
  type DRPDLoggingConfig,
  type DRPDDriverRuntime,
  type LoggedCapturedMessage,
  type TriggerMessageTypeFilter,
  buildUSBFilters,
  findMatchingDevices,
  verifyMatchingDevices
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
  RackDocument
} from '../../lib/rack/types'
import {
  RackRenderer,
  type RackDeviceState,
  type RackInstrumentDragPayload
} from './RackRenderer'
import { getRackCanvasSize } from './rackCanvasSize'
import {
  canInsertInstrumentIntoRow,
  insertInstrumentIntoRowAtIndex,
} from './layout'
import { getSupportedDevices } from './deviceCatalog'
import { getSupportedInstruments } from './instrumentCatalog'
import { useRackSizingConfig } from './rackSizing'
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
const HEADER_MENU_POPOVER_Z_INDEX = 11000
const EMPTY_PAIRED_DEVICES: RackDeviceRecord[] = []

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
 * Describes a drag interaction while editing the rack layout.
 */
interface DragState {
  ///< Instrument id being dragged.
  instrumentId: string
  ///< Snapshot of the rack at drag start.
  snapshot: RackDefinition
  ///< Whether a drop was completed.
  didDrop: boolean
  ///< Last target key to reduce redundant updates.
  lastTargetKey?: string
}

/**
 * Describes a drop target for a dragged instrument.
 */
interface DropTarget {
  ///< Drop mode indicating placement behavior.
  mode: 'insertIntoRow' | 'insertAsNewRow'
  ///< Target row id for row insertion behavior.
  rowId?: string
  ///< Target row index for insertion behavior.
  rowIndex: number
  ///< In-row insertion index for row insertion behavior.
  insertIndex?: number
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

const formatRackDeviceLabel = (record: RackDeviceRecord): string => {
  const parts = [record.displayName]
  if (record.firmwareVersion) {
    parts.push(record.firmwareVersion)
  }
  const displaySerial = record.deviceSerialNumber ?? record.serialNumber
  if (displaySerial) {
    parts.push(`#${displaySerial}`)
  }
  return parts.join(' ')
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

const areTriggerMessageTypeFiltersEqual = (
  left: TriggerMessageTypeFilter[],
  right: TriggerMessageTypeFilter[],
): boolean =>
  left.length === right.length &&
  left.every((entry, index) =>
    entry.class === right[index]?.class &&
    entry.messageTypeNumber === right[index]?.messageTypeNumber,
  )

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

const isSinkReplayReadyState = (status: unknown): boolean =>
  status === SinkState.PE_SNK_READY || status === SinkState.PE_SNK_EPR_KEEPALIVE

const waitForSinkReplayReady = async (
  driver: DRPDDriverRuntime,
  requestedIndex: number,
): Promise<boolean> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const role =
      (await driver.ccBus.getRole().catch(() => driver.getState().role)) ??
      driver.getState().role
    if (role === CCBusRole.SINK) {
      const sinkInfo =
        (await driver.sink.getSinkInfo().catch(() => driver.getState().sinkInfo)) ??
        driver.getState().sinkInfo
      const pdoCount =
        (await driver.sink.getAvailablePdoCount().catch(() => null)) ??
        driver.getState().sinkPdoList?.length ??
        0
      if (pdoCount > requestedIndex && isSinkReplayReadyState(sinkInfo?.status)) {
        return true
      }
    }
    await driver.refreshState().catch(() => undefined)
    await sleep(150)
  }
  return false
}

export const applyRecordConfigToRuntime = async (
  record: RackDeviceRecord,
  runtime: DeviceRuntime | null | undefined,
): Promise<void> => {
  if (!runtime?.drpdDriver) {
    return
  }
  const driver = runtime.drpdDriver
  const config = normalizeDRPDDeviceConfig(record.config)

  await driver.configureLogging(config.logging)

  if (config.role && driver.getState().role !== config.role) {
    await driver.ccBus.setRole(config.role)
    await driver.refreshState()
  }

  if (
    config.captureEnabled &&
    driver.getState().captureEnabled !== config.captureEnabled
  ) {
    await driver.setCaptureEnabled(config.captureEnabled)
  }

  const currentRole = driver.getState().role
  if (
    config.sinkRequest &&
    (config.role ?? currentRole) === CCBusRole.SINK
  ) {
    const sinkReady = await waitForSinkReplayReady(driver, config.sinkRequest.index)
    if (sinkReady) {
      const currentSinkInfo = driver.getState().sinkInfo
      if (
        currentSinkInfo?.negotiatedVoltageMv !== config.sinkRequest.voltageMv ||
        currentSinkInfo?.negotiatedCurrentMa !== config.sinkRequest.currentMa
      ) {
        await driver.sink.requestPdo(
          config.sinkRequest.index,
          config.sinkRequest.voltageMv,
          config.sinkRequest.currentMa,
        )
        await driver.refreshState()
      }
    }
  }

  if (config.trigger) {
    const currentTrigger = driver.getState().triggerInfo
    if (currentTrigger?.type !== config.trigger.type) {
      await driver.trigger.setEventType(config.trigger.type)
    }
    if (currentTrigger?.eventThreshold !== config.trigger.eventThreshold) {
      await driver.trigger.setEventThreshold(config.trigger.eventThreshold)
    }
    if (currentTrigger?.senderFilter !== config.trigger.senderFilter) {
      await driver.trigger.setSenderFilter(config.trigger.senderFilter)
    }
    if (currentTrigger?.autorepeat !== config.trigger.autorepeat) {
      await driver.trigger.setAutoRepeat(config.trigger.autorepeat)
    }
    if (currentTrigger?.syncMode !== config.trigger.syncMode) {
      await driver.trigger.setSyncMode(config.trigger.syncMode)
    }
    if (currentTrigger?.syncPulseWidthUs !== config.trigger.syncPulseWidthUs) {
      await driver.trigger.setSyncPulseWidthUs(config.trigger.syncPulseWidthUs)
    }
    if (
      !currentTrigger ||
      !areTriggerMessageTypeFiltersEqual(
        currentTrigger.messageTypeFilters,
        config.trigger.messageTypeFilters,
      )
    ) {
      await driver.trigger.setMessageTypeFilters(config.trigger.messageTypeFilters)
    }
    await driver.refreshState()
  }
}

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
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false)
  const [isInstrumentMenuOpen, setIsInstrumentMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [firmwareUpdatePrompt, setFirmwareUpdatePrompt] = useState<FirmwareUpdatePromptState | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftRack, setDraftRack] = useState<RackDefinition | null>(null)
  const [headerMenuInlineStyle, setHeaderMenuInlineStyle] = useState<CSSProperties | undefined>(
    undefined,
  )
  const rackDocumentRef = useRef<RackDocument | null>(null)
  const deviceStatesRef = useRef<RackDeviceState[]>([])
  const pairedDevicesRef = useRef<RackDeviceRecord[]>(EMPTY_PAIRED_DEVICES)
  const deviceMenuRef = useRef<HTMLDivElement | null>(null)
  const instrumentMenuRef = useRef<HTMLDivElement | null>(null)
  const deviceMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const instrumentMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const headerMenuPopoverRef = useRef<HTMLDivElement | null>(null)
  const editSnapshotRef = useRef<RackDefinition | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const firmwareUpdateActiveRef = useRef(false)
  const rackSizing = useRackSizingConfig()

  const deviceDefinitions = useMemo<Device[]>(() => getSupportedDevices(), [])
  const instrumentDefinitions = useMemo(() => getSupportedInstruments(), [])
  const instrumentDefinitionMap = useMemo(
    () => {
      const map = new Map(
        instrumentDefinitions.map((instrument) => [
          instrument.identifier,
          instrument
        ]),
      )
      const drpdVbusInstrument = map.get('com.mta.drpd.vbus')
      if (drpdVbusInstrument && !map.has('com.mta.drpd.device-status')) {
        // Legacy identifier support for pre-rename saved rack documents.
        map.set('com.mta.drpd.device-status', drpdVbusInstrument)
      }
      return map
    },
    [instrumentDefinitions],
  )
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
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      const popoverElement = headerMenuPopoverRef.current
      if (isDeviceMenuOpen && deviceMenuRef.current) {
        if (
          target &&
          !deviceMenuRef.current.contains(target) &&
          !(popoverElement && popoverElement.contains(target))
        ) {
          setIsDeviceMenuOpen(false)
        }
      }
      if (isInstrumentMenuOpen && instrumentMenuRef.current) {
        if (
          target &&
          !instrumentMenuRef.current.contains(target) &&
          !(popoverElement && popoverElement.contains(target))
        ) {
          setIsInstrumentMenuOpen(false)
        }
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isDeviceMenuOpen, isInstrumentMenuOpen])

  useEffect(() => {
    /**
     * Close menus when the user presses Escape.
     *
     * @param event - Keyboard event.
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      if (isDeviceMenuOpen) {
        setIsDeviceMenuOpen(false)
      }
      if (isInstrumentMenuOpen) {
        setIsInstrumentMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDeviceMenuOpen, isInstrumentMenuOpen])

  const updateHeaderMenuLayout = useCallback(() => {
    const anchor = isDeviceMenuOpen
      ? deviceMenuButtonRef.current
      : isInstrumentMenuOpen
        ? instrumentMenuButtonRef.current
        : null
    const popover = headerMenuPopoverRef.current
    if (!anchor || !popover) {
      return
    }

    const viewportInsetPx = rackSizing.popoverViewportInsetPx
    const popoverGapPx = rackSizing.popoverGapPx
    const buttonRect = anchor.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()
    const width = popoverRect.width
    const height = popoverRect.height

    let left = buttonRect.right - width
    left = Math.max(
      viewportInsetPx,
      Math.min(left, window.innerWidth - width - viewportInsetPx),
    )

    const belowTop = buttonRect.bottom + popoverGapPx
    const belowSpace = window.innerHeight - belowTop - viewportInsetPx
    const aboveSpace = buttonRect.top - popoverGapPx - viewportInsetPx
    const shouldOpenAbove = belowSpace < height && aboveSpace > belowSpace
    const maxHeight = Math.max(120, Math.floor(shouldOpenAbove ? aboveSpace : belowSpace))

    let top = belowTop
    if (shouldOpenAbove) {
      top = Math.max(
        viewportInsetPx,
        buttonRect.top - popoverGapPx - Math.min(height, maxHeight),
      )
    } else {
      top = Math.min(top, window.innerHeight - viewportInsetPx - Math.min(height, maxHeight))
    }

    setHeaderMenuInlineStyle({
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
    })
  }, [
    isDeviceMenuOpen,
    isInstrumentMenuOpen,
    rackSizing.popoverGapPx,
    rackSizing.popoverViewportInsetPx,
  ])

  useLayoutEffect(() => {
    if (!isDeviceMenuOpen && !isInstrumentMenuOpen) {
      setHeaderMenuInlineStyle(undefined)
      return undefined
    }

    const runLayout = () => {
      updateHeaderMenuLayout()
    }
    runLayout()
    window.addEventListener('resize', runLayout)
    window.addEventListener('scroll', runLayout, true)
    return () => {
      window.removeEventListener('resize', runLayout)
      window.removeEventListener('scroll', runLayout, true)
    }
  }, [isDeviceMenuOpen, isInstrumentMenuOpen, updateHeaderMenuLayout])

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
        await state.drpdDriver.configureLogging(resolveDeviceLoggingConfig(updatedRecord))
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

  /** Cycle through the available theme modes. */
  const handleThemeToggle = () => {
    setTheme((current) => {
      if (current === 'system') {
        return 'light'
      }
      if (current === 'light') {
        return 'dark'
      }
      return 'system'
    })
  }

  /** Render the human-friendly theme label. */
  const themeLabel =
    theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'
  const firmwareUpdateChannelLabel =
    firmwareUpdateChannel === 'production' ? 'Production' : 'Beta'
  const currentRack = isEditMode ? draftRack ?? activeRack : activeRack
  const isFirmwareUploadBusy =
    firmwareUpdatePrompt != null &&
    !['prompt', 'success', 'failure'].includes(firmwareUpdatePrompt.phase)

  const updateFirmwarePromptState = useCallback((patch: Partial<FirmwareUpdatePromptState>) => {
    setFirmwareUpdatePrompt((current) => current ? { ...current, ...patch } : current)
  }, [])

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

  /** Reconnect a previously disconnected device. */
  const handleReconnectDevice = async (recordId: string) => {
    setDeviceError(null)
    if (typeof navigator === 'undefined' || !navigator.usb) {
      setDeviceError('WebUSB is not available in this browser.')
      return
    }
    if (deviceStatesRef.current.some((state) => state.status === 'connected')) {
      return
    }
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

  /**
   * Apply a rack layout update, respecting edit mode.
   */
  const applyLayoutUpdate = (nextRack: RackDefinition) => {
    if (!rackDocument) {
      return
    }
    if (isEditMode) {
      setDraftRack(nextRack)
      return
    }
    const nextDocument = replaceRack(rackDocument, nextRack)
    setRackDocument(nextDocument)
    setActiveRack(nextRack)
    saveRackDocument(nextDocument)
  }

  const handleUpdateDeviceConfig = async (
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
  }

  /** Add a compatible instrument to the rack. */
  const handleAddInstrument = (instrumentIdentifier: string) => {
    if (!currentRack || !rackDocument) {
      return
    }
    const instrumentDefinition = instrumentDefinitions.find(
      (instrument) => instrument.identifier === instrumentIdentifier,
    )
    if (!instrumentDefinition) {
      return
    }
    const newRowId = `row-${Date.now()}`
    const newInstrumentId = `inst-${Date.now()}`
    const nextRow = {
      id: newRowId,
      instruments: [
        {
          id: newInstrumentId,
          instrumentIdentifier,
        }
      ]
    }
    const nextRack: RackDefinition = {
      ...currentRack,
      rows: [...currentRack.rows, nextRow]
    }
    applyLayoutUpdate(nextRack)
    setIsInstrumentMenuOpen(false)
  }

  /**
   * Enter rack edit mode and snapshot the current layout.
   */
  const handleEnterEditMode = () => {
    if (!activeRack) {
      return
    }
    const snapshot = cloneRackDefinition(activeRack)
    editSnapshotRef.current = snapshot
    setDraftRack(snapshot)
    setIsEditMode(true)
    setIsDeviceMenuOpen(false)
    setIsInstrumentMenuOpen(false)
  }

  /**
   * Cancel edits and restore the previous layout.
   */
  const handleCancelEditMode = () => {
    setIsEditMode(false)
    setDraftRack(null)
    editSnapshotRef.current = null
    dragStateRef.current = null
  }

  /**
   * Commit edits and persist the rack layout.
   */
  const handleSaveEditMode = () => {
    if (!draftRack || !rackDocument) {
      return
    }
    const nextDocument = replaceRack(rackDocument, draftRack)
    setRackDocument(nextDocument)
    setActiveRack(draftRack)
    saveRackDocument(nextDocument)
    setIsEditMode(false)
    setDraftRack(null)
    editSnapshotRef.current = null
  }

  /**
   * Remove an instrument from the rack layout.
   */
  const handleRemoveInstrument = (instrumentId: string) => {
    if (!currentRack) {
      return
    }
    const nextRack = removeInstrumentFromRack(currentRack, instrumentId)
    applyLayoutUpdate(nextRack)
  }

  /**
   * Start a drag interaction for an instrument.
   */
  const handleInstrumentDragStart = (instrumentId: string) => {
    if (!isEditMode || !currentRack) {
      return
    }
    dragStateRef.current = {
      instrumentId,
      snapshot: cloneRackDefinition(currentRack),
      didDrop: false
    }
  }

  /**
   * Update the layout preview while dragging an instrument.
   */
  const handleInstrumentDragOver = (payload: RackInstrumentDragPayload) => {
    const dragState = dragStateRef.current
    if (!isEditMode || !dragState) {
      return
    }
    const target = getDropTarget({
      rack: dragState.snapshot,
      payload
    })
    const targetKey = buildDropTargetKey(target)
    if (dragState.lastTargetKey === targetKey) {
      return
    }
    dragState.lastTargetKey = targetKey
    const nextRack = moveInstrumentInRack(
      dragState.snapshot,
      dragState.instrumentId,
      target,
      instrumentDefinitionMap,
      rackSizing.maxRowWidthUnits,
    )
    setDraftRack(nextRack)
  }

  /**
   * Commit a drag and drop interaction.
   */
  const handleInstrumentDrop = (payload: RackInstrumentDragPayload) => {
    const dragState = dragStateRef.current
    if (!isEditMode || !dragState) {
      return
    }
    const target = getDropTarget({
      rack: dragState.snapshot,
      payload
    })
    const nextRack = moveInstrumentInRack(
      dragState.snapshot,
      dragState.instrumentId,
      target,
      instrumentDefinitionMap,
      rackSizing.maxRowWidthUnits,
    )
    dragState.didDrop = true
    dragState.snapshot = nextRack
    setDraftRack(nextRack)
  }

  /**
   * Restore the layout if a drag is cancelled.
   */
  const handleInstrumentDragEnd = () => {
    const dragState = dragStateRef.current
    if (!dragState) {
      return
    }
    if (!dragState.didDrop) {
      setDraftRack(dragState.snapshot)
    }
    dragStateRef.current = null
  }

  const compatibleInstruments = currentRack
    ? instrumentDefinitions
    : []
  const rackCanvasWidthPx = currentRack
    ? getRackCanvasSize(currentRack, instrumentDefinitions, rackSizing).rackWidthPx
    : null
  const headerLogoSrc = resolvedTheme === 'light' ? drpdLogoLight : drpdLogoDark

  return (
    <div className={styles.page}>
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
              </div>
              <div className={styles.headerActions}>
                {!isEditMode ? (
                  <button
                    type="button"
                    className={styles.editButton}
                    onClick={handleEnterEditMode}
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.editButtonSecondary}
                      onClick={handleCancelEditMode}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.editButtonPrimary}
                      onClick={handleSaveEditMode}
                    >
                      Save
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={styles.themeButton}
                  onClick={handleThemeToggle}
                >
                  Theme: {themeLabel}
                </button>
                <button
                  type="button"
                  className={styles.settingsButton}
                  onClick={() => setIsSettingsOpen(true)}
                  disabled={isEditMode}
                >
                  Settings
                </button>
                {currentRack &&
                !currentRack.hideHeader ? (
                  <div className={styles.instrumentMenu} ref={instrumentMenuRef}>
                    <button
                      type="button"
                      className={styles.deviceMenuButton}
                      ref={instrumentMenuButtonRef}
                      onClick={() =>
                        setIsInstrumentMenuOpen((open) => !open)
                      }
                    >
                      Add Instrument
                    </button>
                    {isInstrumentMenuOpen ? (
                      typeof document !== 'undefined'
                        ? createPortal(
                            <div
                              className={styles.instrumentMenuPanel}
                              ref={headerMenuPopoverRef}
                              style={{
                                ...headerMenuInlineStyle,
                                zIndex: HEADER_MENU_POPOVER_Z_INDEX,
                                visibility: headerMenuInlineStyle ? 'visible' : 'hidden',
                              }}
                            >
                              {compatibleInstruments.length === 0 ? (
                                <div className={styles.instrumentMenuEmpty}>
                                  No compatible instruments
                                </div>
                              ) : (
                                <ul className={styles.instrumentMenuList}>
                                  {compatibleInstruments.map((instrument) => (
                                    <li key={instrument.identifier}>
                                      <button
                                        type="button"
                                        className={styles.instrumentMenuItem}
                                        onClick={() =>
                                          handleAddInstrument(instrument.identifier)
                                        }
                                      >
                                        {instrument.displayName}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>,
                            document.body,
                          )
                        : null
                    ) : null}
                  </div>
                ) : null}
                <div
                  className={styles.deviceMenu}
                  data-testid="rack-devices"
                  ref={deviceMenuRef}
                >
                  <button
                    type="button"
                    className={styles.deviceMenuButton}
                    ref={deviceMenuButtonRef}
                    onClick={() => setIsDeviceMenuOpen((open) => !open)}
                    disabled={isEditMode}
                  >
                    Paired Devices
                  </button>
                  {isDeviceMenuOpen ? (
                    typeof document !== 'undefined'
                      ? createPortal(
                          <div
                            className={styles.deviceMenuPanel}
                            ref={headerMenuPopoverRef}
                            style={{
                              ...headerMenuInlineStyle,
                              zIndex: HEADER_MENU_POPOVER_Z_INDEX,
                              visibility: headerMenuInlineStyle ? 'visible' : 'hidden',
                            }}
                          >
                            <button
                              type="button"
                              className={styles.deviceMenuItem}
                              onClick={handleConnectDevice}
                            >
                              Pair Device
                            </button>
                            <div className={styles.deviceMenuSeparator} />
                            {deviceStates.length === 0 ? (
                              <div className={styles.deviceMenuEmpty}>No paired devices</div>
                            ) : (
                              <ul className={styles.deviceMenuList}>
                                {deviceStates.map((device) => (
                                  <li key={device.record.id} className={styles.deviceRow}>
                                    <div className={styles.deviceInfo}>
                                      <span className={styles.deviceName}>
                                        {formatRackDeviceLabel(device.record)}
                                      </span>
                                      <span
                                        className={`${styles.deviceStatus} ${
                                          device.status === 'connected'
                                            ? styles.deviceStatusConnected
                                            : device.status === 'error'
                                              ? styles.deviceStatusError
                                              : ''
                                        }`}
                                      >
                                        {device.status}
                                      </span>
                                    </div>
                                    <div className={styles.deviceActions}>
                                      {device.status === 'connected' ? (
                                        <button
                                          type="button"
                                          className={styles.deviceActionButton}
                                          onClick={() =>
                                            handleDisconnectDevice(device.record.id)
                                          }
                                        >
                                          Disconnect
                                        </button>
                                      ) : null}
                                      {device.status === 'disconnected' ||
                                      device.status === 'error' ? (
                                        <button
                                          type="button"
                                          className={styles.deviceActionButton}
                                          onClick={() =>
                                            handleReconnectDevice(device.record.id)
                                          }
                                        >
                                          Connect
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className={`${styles.deviceActionButton} ${styles.removeButton}`}
                                        onClick={() =>
                                          handleRemoveDevice(device.record.id)
                                        }
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>,
                          document.body,
                        )
                      : null
                  ) : null}
                </div>
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
            isEditMode={isEditMode}
            onRemoveInstrument={handleRemoveInstrument}
            onInstrumentDragStart={handleInstrumentDragStart}
            onInstrumentDragOver={handleInstrumentDragOver}
            onInstrumentDrop={handleInstrumentDrop}
            onInstrumentDragEnd={handleInstrumentDragEnd}
            onUpdateDeviceConfig={handleUpdateDeviceConfig}
          />
        ) : null}
        {!isLoading && !error && rackDocument && !activeRack ? (
          <div className={styles.notice}>No racks available.</div>
        ) : null}
      </main>
      {isSettingsOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.settingsBackdrop}>
              <section
                className={styles.settingsDialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="rack-settings-title"
              >
                <div className={styles.settingsHeader}>
                  <h2 id="rack-settings-title" className={styles.settingsTitle}>
                    Settings
                  </h2>
                  <button
                    type="button"
                    className={styles.settingsCloseButton}
                    onClick={() => setIsSettingsOpen(false)}
                    aria-label="Close settings"
                  >
                    Close
                  </button>
                </div>
                <div className={styles.settingsBody}>
                  <fieldset className={styles.settingsFieldset}>
                    <legend className={styles.settingsLegend}>Firmware update channel</legend>
                    <div className={styles.channelOptions}>
                      <label className={styles.channelOption}>
                        <input
                          type="radio"
                          name="firmware-update-channel"
                          value="production"
                          checked={firmwareUpdateChannel === 'production'}
                          onChange={() => setFirmwareUpdateChannel('production')}
                        />
                        <span className={styles.channelOptionText}>
                          <span className={styles.channelOptionTitle}>Production</span>
                          <span className={styles.channelOptionDescription}>
                            Stable firmware releases only.
                          </span>
                        </span>
                      </label>
                      <label className={styles.channelOption}>
                        <input
                          type="radio"
                          name="firmware-update-channel"
                          value="beta"
                          checked={firmwareUpdateChannel === 'beta'}
                          onChange={() => setFirmwareUpdateChannel('beta')}
                        />
                        <span className={styles.channelOptionText}>
                          <span className={styles.channelOptionTitle}>Beta</span>
                          <span className={styles.channelOptionDescription}>
                            Stable and beta firmware releases.
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className={styles.settingsValue}>
                      Current channel: {firmwareUpdateChannelLabel}
                    </div>
                  </fieldset>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
      {firmwareUpdatePrompt && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.settingsBackdrop}>
              <section
                className={styles.settingsDialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="firmware-update-title"
              >
                <div className={styles.settingsHeader}>
                  <h2 id="firmware-update-title" className={styles.settingsTitle}>
                    Firmware update available
                  </h2>
                  <button
                    type="button"
                    className={styles.settingsCloseButton}
                    onClick={() => {
                      if (!isFirmwareUploadBusy) {
                        setFirmwareUpdatePrompt(null)
                      }
                    }}
                    aria-label="Close firmware update prompt"
                    disabled={isFirmwareUploadBusy}
                  >
                    Close
                  </button>
                </div>
                <div className={styles.settingsBody}>
                  <p className={styles.firmwareUpdateText}>
                    {firmwareUpdatePrompt.statusMessage}
                  </p>
                  <dl className={styles.firmwareVersionList}>
                    <div>
                      <dt>Installed</dt>
                      <dd>{firmwareUpdatePrompt.currentVersion}</dd>
                    </div>
                    <div>
                      <dt>Available</dt>
                      <dd>{firmwareUpdatePrompt.targetRelease.versionText}</dd>
                    </div>
                  </dl>
                  {firmwareUpdatePrompt.phase === 'prompt' ? (
                    <label className={styles.firmwareSuppressOption}>
                      <input
                        type="checkbox"
                        checked={firmwareUpdatePrompt.suppressVersion}
                        onChange={(event) => updateFirmwarePromptState({ suppressVersion: event.target.checked })}
                      />
                      <span>Do not ask again for this version</span>
                    </label>
                  ) : null}
                  {firmwareUpdatePrompt.phase !== 'prompt' ? (
                    <div className={styles.firmwareUploadStatus}>
                      <div className={styles.firmwareUploadWarning}>
                        Do not disconnect the device. Do not refresh the page.
                      </div>
                      <div className={styles.firmwareProgressShell} aria-label="Firmware upload progress">
                        <div
                          className={styles.firmwareProgressBar}
                          style={{ '--firmware-progress': `${Math.round(firmwareUpdatePrompt.progress * 100)}%` } as CSSProperties}
                        />
                      </div>
                      {firmwareUpdatePrompt.errorMessage ? (
                        <div className={styles.firmwareUploadError}>
                          Error: {firmwareUpdatePrompt.errorMessage}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.firmwareUpdateActions}>
                    {firmwareUpdatePrompt.phase === 'prompt' ? (
                      <>
                        <button
                          type="button"
                          className={styles.editButtonSecondary}
                          onClick={handleDeclineFirmwareUpdate}
                        >
                          Not Now
                        </button>
                        <button
                          type="button"
                          className={styles.editButtonPrimary}
                          onClick={() => {
                            void handleAcceptFirmwareUpdate()
                          }}
                        >
                          Upload Firmware
                        </button>
                      </>
                    ) : null}
                    {firmwareUpdatePrompt.phase === 'failure' ? (
                      <>
                        <button
                          type="button"
                          className={styles.editButtonSecondary}
                          onClick={() => setFirmwareUpdatePrompt(null)}
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          className={styles.editButtonPrimary}
                          onClick={() => {
                            void handleAcceptFirmwareUpdate()
                          }}
                        >
                          Retry
                        </button>
                      </>
                    ) : null}
                    {firmwareUpdatePrompt.phase === 'success' ? (
                      <button
                        type="button"
                        className={styles.editButtonPrimary}
                        onClick={() => setFirmwareUpdatePrompt(null)}
                      >
                        Done
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
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

const upsertPairedDeviceDocument = (
  document: RackDocument,
  record: RackDeviceRecord,
): RackDocument => replacePairedDevices(document, upsertDevice(document.pairedDevices ?? [], record))

/**
 * Replace a rack in the rack document.
 *
 * @param document - Current rack document.
 * @param rack - Updated rack definition.
 * @returns Updated rack document.
 */
const replaceRack = (
  document: RackDocument,
  rack: RackDefinition,
): RackDocument => {
  return {
    ...document,
    racks: document.racks.map((existing) =>
      existing.id === rack.id ? rack : existing,
    )
  }
}

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

/**
 * Create a deep clone of a rack definition.
 *
 * @param rack - Rack definition to clone.
 * @returns Deep clone of the rack.
 */
const cloneRackDefinition = (rack: RackDefinition): RackDefinition => {
  return JSON.parse(JSON.stringify(rack)) as RackDefinition
}

/**
 * Remove an instrument from a rack and prune empty rows.
 *
 * @param rack - Rack definition.
 * @param instrumentId - Instrument instance id.
 * @returns Updated rack definition.
 */
const removeInstrumentFromRack = (
  rack: RackDefinition,
  instrumentId: string,
): RackDefinition => {
  const rows = rack.rows
    .map((row) => ({
      ...row,
      instruments: row.instruments.filter(
        (instrument) => instrument.id !== instrumentId,
      )
    }))
    .filter((row) => row.instruments.length > 0)

  return { ...rack, rows }
}

/**
 * Build a key for identifying drag preview targets.
 *
 * @param target - Drop target descriptor.
 * @returns Unique key for the target.
 */
const buildDropTargetKey = (target: DropTarget): string => {
  return `${target.mode}:${target.rowId ?? 'none'}:${target.rowIndex}:${
    target.insertIndex ?? -1
  }`
}

/**
 * Resolve a drag payload into a drop target description.
 *
 * @param params - Input parameters.
 * @returns Drop target description.
 */
const getDropTarget = ({
  rack,
  payload,
}: {
  rack: RackDefinition
  payload: RackInstrumentDragPayload
}): DropTarget => {
  if (payload.targetKind === 'new-row') {
    return {
      mode: 'insertAsNewRow',
      rowIndex: Math.max(0, Math.min(payload.rowIndex, rack.rows.length))
    }
  }
  const targetRow = payload.rowId
    ? rack.rows.find((row) => row.id === payload.rowId)
    : null
  if (!targetRow) {
    return {
      mode: 'insertAsNewRow',
      rowIndex: Math.max(0, Math.min(payload.rowIndex, rack.rows.length))
    }
  }
  return {
    mode: 'insertIntoRow',
    rowId: payload.rowId,
    rowIndex: payload.rowIndex,
    insertIndex:
      payload.insertIndex == null
        ? targetRow.instruments.length
        : Math.max(0, Math.min(payload.insertIndex, targetRow.instruments.length))
  }
}

/**
 * Move an instrument within a rack definition.
 *
 * @param rack - Rack definition.
 * @param instrumentId - Instrument instance id.
 * @param target - Drop target descriptor.
 * @param instrumentMap - Instrument definition map.
 * @returns Updated rack definition.
 */
const moveInstrumentInRack = (
  rack: RackDefinition,
  instrumentId: string,
  target: DropTarget,
  instrumentMap: Map<string, Instrument>,
  maxRowWidthUnits: number,
): RackDefinition => {
  const extraction = extractInstrumentFromRack(rack, instrumentId)
  if (!extraction.removedInstrument) {
    return rack
  }
  const rows = extraction.rows
  if (target.mode === 'insertIntoRow') {
    const targetIndex = target.rowId
      ? rows.findIndex((row) => row.id === target.rowId)
      : -1
    if (targetIndex >= 0) {
      const targetRow = rows[targetIndex]
      const insertIndex = Math.max(
        0,
        Math.min(target.insertIndex ?? targetRow.instruments.length, targetRow.instruments.length),
      )
      if (
        canInsertInstrumentIntoRow(
          targetRow,
          extraction.removedInstrument,
          insertIndex,
          instrumentMap,
          maxRowWidthUnits,
        )
      ) {
        const nextRow = insertInstrumentIntoRowAtIndex(
          targetRow,
          extraction.removedInstrument,
          insertIndex,
        )
        return {
          ...rack,
          rows: rows.map((row, index) => (index === targetIndex ? nextRow : row))
        }
      }
    }
  }
  const insertionIndex = Math.max(0, Math.min(target.rowIndex, rows.length))
  const nextRow = {
    id: `row-${Date.now()}`,
    instruments: [extraction.removedInstrument]
  }
  return {
    ...rack,
    rows: [
      ...rows.slice(0, insertionIndex),
      nextRow,
      ...rows.slice(insertionIndex)
    ]
  }
}

/**
 * Extract a single instrument from the rack.
 *
 * @param rack - Rack definition.
 * @param instrumentId - Instrument instance id.
 * @returns Extracted instrument and remaining rows.
 */
const extractInstrumentFromRack = (
  rack: RackDefinition,
  instrumentId: string,
): {
  rows: RackDefinition['rows']
  removedInstrument?: RackDefinition['rows'][number]['instruments'][number]
} => {
  let removedInstrument:
    | RackDefinition['rows'][number]['instruments'][number]
    | undefined
  const rows = rack.rows
    .map((row) => {
      const remaining = row.instruments.filter((instrument) => {
        if (instrument.id === instrumentId) {
          removedInstrument = instrument
          return false
        }
        return true
      })
      return { ...row, instruments: remaining }
    })
    .filter((row) => row.instruments.length > 0)

  return { rows, removedInstrument }
}
