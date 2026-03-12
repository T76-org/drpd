import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Device } from '../../lib/device'
import type { DeviceIdentity } from '../../lib/device'
import type { Instrument } from '../../lib/instrument'
import {
  DRPDDeviceDefinition,
  buildCapturedLogSelectionKey,
  buildDefaultLoggingConfig,
  decodeLoggedCapturedMessage,
  normalizeLoggingConfig,
  type DRPDLoggingConfig,
  type DRPDDriverRuntime,
  type LoggedCapturedMessage,
  buildUSBFilters,
  findMatchingDevices,
  verifyMatchingDevices
} from '../../lib/device'
import { loadRackDocument, saveRackDocument } from '../../lib/rack/loadRack'
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
const CONSOLE_LOG_END_TS_US = (2n ** 63n) - 1n
const HEADER_MENU_POPOVER_Z_INDEX = 11000

interface DRPDLogsConsoleHelper {
  devices(): Array<{ id: string; name: string; status: string }>
  driver(deviceId?: string): DRPDDriverRuntime
  diagnostics(deviceId?: string): Promise<unknown>
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

const applyRecordConfigToRuntime = async (
  record: RackDeviceRecord,
  runtime: DeviceRuntime | null | undefined,
): Promise<void> => {
  if (!runtime?.drpdDriver) {
    return
  }
  await runtime.drpdDriver.configureLogging(resolveDeviceLoggingConfig(record))
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
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    getResolvedTheme(getStoredTheme()),
  )
  const [deviceStates, setDeviceStates] = useState<RackDeviceState[]>([])
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false)
  const [isInstrumentMenuOpen, setIsInstrumentMenuOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftRack, setDraftRack] = useState<RackDefinition | null>(null)
  const [headerMenuInlineStyle, setHeaderMenuInlineStyle] = useState<CSSProperties | undefined>(
    undefined,
  )
  const deviceStatesRef = useRef<RackDeviceState[]>([])
  const deviceMenuRef = useRef<HTMLDivElement | null>(null)
  const instrumentMenuRef = useRef<HTMLDivElement | null>(null)
  const deviceMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const instrumentMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const headerMenuPopoverRef = useRef<HTMLDivElement | null>(null)
  const editSnapshotRef = useRef<RackDefinition | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
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
    deviceStatesRef.current = deviceStates
  }, [deviceStates])

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

  useEffect(() => {
    if (!activeRack) {
      return
    }
    void autoConnectDevices({
      devices: activeRack.devices ?? [],
      definitions: deviceDefinitions,
      onUpdate: setDeviceStates,
      onError: setDeviceError
    })
  }, [activeRack, deviceDefinitions])

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
  const currentRack = isEditMode ? draftRack ?? activeRack : activeRack

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

      const runtime = await connectDeviceRuntime(deviceDefinition, selected)
      const baseRecord = buildRackDeviceRecord(deviceDefinition, selected)
      const identity = await identifyRackDeviceRuntime(runtime).catch(() => null)
      const record = mergeRackDeviceIdentity(baseRecord, identity)
      await applyRecordConfigToRuntime(record, runtime)
      setDeviceStates((states) =>
        upsertDeviceState(states, buildRackDeviceState(record, runtime)),
      )
      if (activeRack && rackDocument) {
        const nextRack = {
          ...activeRack,
          devices: upsertDevice(activeRack.devices ?? [], record)
        }
        const nextDocument = replaceRack(rackDocument, nextRack)
        setRackDocument(nextDocument)
        setActiveRack(nextRack)
        if (isEditMode && draftRack) {
          setDraftRack({ ...draftRack, devices: nextRack.devices })
        }
        saveRackDocument(nextDocument)
      }
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
    if (!activeRack || !rackDocument) {
      return
    }
    const record = (activeRack.devices ?? []).find(
      (device) => device.id === recordId,
    )
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
    const nextDevices = (activeRack.devices ?? []).filter(
      (device) => device.id !== recordId,
    )
    const nextRack = { ...activeRack, devices: nextDevices }
    const nextDocument = replaceRack(rackDocument, nextRack)
    setRackDocument(nextDocument)
    setActiveRack(nextRack)
    if (isEditMode && draftRack) {
      setDraftRack({ ...draftRack, devices: nextDevices })
    }
    saveRackDocument(nextDocument)
    setDeviceStates((states) =>
      states.filter((state) => state.record.id !== recordId),
    )
  }

  /** Reconnect a previously disconnected device. */
  const handleReconnectDevice = async (recordId: string) => {
    setDeviceError(null)
    if (!activeRack) {
      return
    }
    if (typeof navigator === 'undefined' || !navigator.usb) {
      setDeviceError('WebUSB is not available in this browser.')
      return
    }
    const record = (activeRack.devices ?? []).find(
      (device) => device.id === recordId,
    )
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

    try {
      const connected = await navigator.usb.getDevices()
      const matchedDevice = findUsbDeviceForRecord(connected, record)
      if (!matchedDevice) {
        setDeviceError('Device is not available. Check the USB connection.')
        setDeviceStates((states) =>
          upsertDeviceState(states, { record, status: 'missing' }),
        )
        return
      }

      const runtime = await connectDeviceRuntime(definition, matchedDevice)
      const identity = await identifyRackDeviceRuntime(runtime).catch(() => null)
      const nextRecord = mergeRackDeviceIdentity(record, identity)
      await applyRecordConfigToRuntime(nextRecord, runtime)
      setDeviceStates((states) =>
        upsertDeviceState(states, buildRackDeviceState(nextRecord, runtime)),
      )
    } catch (connectError) {
      const message =
        connectError instanceof Error ? connectError.message : String(connectError)
      setDeviceError(message)
      setDeviceStates((states) =>
        upsertDeviceState(states, { record, status: 'error', error: message }),
      )
    }
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
    if (!activeRack || !rackDocument) {
      return
    }

    let updatedRecord: RackDeviceRecord | null = null
    const nextDevices = (activeRack.devices ?? []).map((device) => {
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

    const nextRack = { ...activeRack, devices: nextDevices }
    const nextDocument = replaceRack(rackDocument, nextRack)
    setRackDocument(nextDocument)
    setActiveRack(nextRack)
    if (draftRack) {
      setDraftRack({
        ...draftRack,
        devices: (draftRack.devices ?? []).map((device) =>
          device.id === deviceRecordId ? updatedRecord as RackDeviceRecord : device,
        ),
      })
    }
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
    const compatibleDevice = (currentRack.devices ?? []).find((device) =>
      instrumentDefinition.supportedDeviceIdentifiers.includes(device.identifier),
    )
    if (!compatibleDevice) {
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
          deviceRecordId: compatibleDevice.id
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
    ? instrumentDefinitions.filter((instrument) =>
        instrument.supportedDeviceIdentifiers.some((identifier) =>
          (currentRack.devices ?? []).some(
            (device) => device.identifier === identifier,
          ),
        ),
      )
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
                {currentRack &&
                !currentRack.hideHeader &&
                (currentRack.devices ?? []).length > 0 ? (
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
                    Devices
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
                              <div className={styles.deviceMenuEmpty}>No devices</div>
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
    transport: runtime?.transport
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
    return { drpdDriver: runtime.driver, transport: runtime.transport }
  }

  await definition.connectDevice(device)
  return null
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

/**
 * Attempt to auto-connect stored devices when available.
 *
 * @param params - Auto-connect parameters.
 */
const autoConnectDevices = async ({
  devices,
  definitions,
  onUpdate,
  onError
}: {
  devices: RackDeviceRecord[]
  definitions: Device[]
  onUpdate: (state: RackDeviceState[]) => void
  onError: (message: string | null) => void
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
    const connected = await navigator.usb.getDevices()
    const nextStates: RackDeviceState[] = []

    for (const record of devices) {
      const matchedDevice = connected.find((usbDevice) => {
        if (usbDevice.vendorId !== record.vendorId) {
          return false
        }
        if (usbDevice.productId !== record.productId) {
          return false
        }
        if (record.serialNumber && usbDevice.serialNumber !== record.serialNumber) {
          return false
        }
        return true
      })

      if (!matchedDevice) {
        nextStates.push({ record, status: 'missing' })
        continue
      }

      const matchingDefinitions = findMatchingDevices(
        definitions,
        matchedDevice,
      ).filter((definition) => definition.identifier === record.identifier)
      const verified = await verifyMatchingDevices(
        matchingDefinitions,
        matchedDevice,
      )
      const target = verified[0] ?? matchingDefinitions[0]
      if (!target) {
        nextStates.push({ record, status: 'error', error: 'No matching device.' })
        continue
      }

      try {
        const runtime = await connectDeviceRuntime(target, matchedDevice)
        const identity = await identifyRackDeviceRuntime(runtime).catch(() => null)
        const nextRecord = mergeRackDeviceIdentity(record, identity)
        await applyRecordConfigToRuntime(nextRecord, runtime)
        nextStates.push(buildRackDeviceState(nextRecord, runtime))
      } catch (connectError) {
        const message =
          connectError instanceof Error ? connectError.message : String(connectError)
        nextStates.push({ record, status: 'error', error: message })
      }
    }

    onUpdate(nextStates)
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
    devices.find((usbDevice) => {
      if (usbDevice.vendorId !== record.vendorId) {
        return false
      }
      if (usbDevice.productId !== record.productId) {
        return false
      }
      if (record.serialNumber && usbDevice.serialNumber !== record.serialNumber) {
        return false
      }
      return true
    }) ?? null
  )
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
