import { useEffect, useState } from 'react'
import {
  buildCapturedLogSelectionKey,
  decodeLoggedCapturedMessage,
  DRPDDevice,
  type DRPDLogSelectionState,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import type { HumanReadableMetadataRoot } from '../../../lib/device/drpd/usb-pd/humanReadableField'
import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdMessageDetailInstrumentView.module.css'

const EMPTY_SELECTION: DRPDLogSelectionState = {
  selectedKeys: [],
  anchorIndex: null,
  activeIndex: null,
}

type MessageDetailSection = {
  id: keyof HumanReadableMetadataRoot
  label: string
}

const normalizeSelectionState = (value: unknown): DRPDLogSelectionState => {
  if (!value || typeof value !== 'object') {
    return EMPTY_SELECTION
  }
  const probe = value as Partial<DRPDLogSelectionState>
  return {
    selectedKeys: Array.isArray(probe.selectedKeys)
      ? probe.selectedKeys.filter((entry): entry is string => typeof entry === 'string')
      : [],
    anchorIndex:
      typeof probe.anchorIndex === 'number' && Number.isFinite(probe.anchorIndex)
        ? Math.max(0, Math.floor(probe.anchorIndex))
        : null,
    activeIndex:
      typeof probe.activeIndex === 'number' && Number.isFinite(probe.activeIndex)
        ? Math.max(0, Math.floor(probe.activeIndex))
        : null,
  }
}

const buildMetadataSections = (
  metadata: HumanReadableMetadataRoot,
): MessageDetailSection[] => {
  return [
    { id: 'baseInformation', label: metadata.baseInformation.Label },
    { id: 'technicalData', label: metadata.technicalData.Label },
    { id: 'headerData', label: metadata.headerData.Label },
    { id: 'messageSpecificData', label: metadata.messageSpecificData.Label },
  ]
}

const parseMessageSelectionKey = (
  selectionKey: string,
): { startTimestampUs: bigint } | null => {
  const match = /^message:(\d+):(\d+):(\d+)$/.exec(selectionKey)
  if (!match) {
    return null
  }
  const [, startTimestampUs] = match
  return {
    startTimestampUs: BigInt(startTimestampUs),
  }
}

const findSelectedMessageRow = (
  rows: LoggedCapturedMessage[],
  selectionKey: string,
): LoggedCapturedMessage | null => {
  return (
    rows.find(
      (row) =>
        row.entryKind === 'message' &&
        buildCapturedLogSelectionKey(row) === selectionKey,
    ) ?? null
  )
}

/**
 * Message detail instrument shell.
 */
export const DrpdMessageDetailInstrumentView = ({
  instrument,
  displayName,
  deviceState,
  isEditMode,
  onRemove
}: {
  instrument: RackInstrument
  displayName: string
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
}) => {
  const driver = deviceState?.drpdDriver
  const [selection, setSelection] = useState<DRPDLogSelectionState>(() => EMPTY_SELECTION)
  const activeSelectionKey = selection.selectedKeys.length === 1 ? selection.selectedKeys[0] : null
  const [loadedSelectionKey, setLoadedSelectionKey] = useState<string | null>(null)
  const [sections, setSections] = useState<MessageDetailSection[]>([])
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>([])

  useEffect(() => {
    if (!driver || !('getLogSelectionState' in driver) || typeof driver.getLogSelectionState !== 'function') {
      return
    }

    let cancelled = false

    const syncSelection = async () => {
      const nextSelection = normalizeSelectionState(
        await Promise.resolve(driver.getLogSelectionState()),
      )
      if (!cancelled) {
        setSelection(nextSelection)
      }
    }

    void syncSelection()

    const handleStateUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ changed?: string[] }>).detail
      if (detail?.changed && !detail.changed.includes('logSelection')) {
        return
      }
      void syncSelection()
    }

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    return () => {
      cancelled = true
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [driver])

  useEffect(() => {
    if (
      activeSelectionKey === null ||
      !driver ||
      !('queryCapturedMessages' in driver) ||
      typeof driver.queryCapturedMessages !== 'function'
    ) {
      return
    }

    const parsedSelectionKey = parseMessageSelectionKey(activeSelectionKey)
    if (!parsedSelectionKey) {
      return
    }

    let cancelled = false

    const loadSections = async () => {
      const rows = await Promise.resolve(
        driver.queryCapturedMessages({
          startTimestampUs: parsedSelectionKey.startTimestampUs,
          endTimestampUs: parsedSelectionKey.startTimestampUs,
        }),
      )
      if (cancelled) {
        return
      }
      const row = findSelectedMessageRow(rows, activeSelectionKey)
      if (!row) {
        setLoadedSelectionKey(activeSelectionKey)
        setSections([])
        setExpandedSectionIds([])
        return
      }
      const decoded = decodeLoggedCapturedMessage(row)
      if (decoded.kind !== 'message') {
        setLoadedSelectionKey(activeSelectionKey)
        setSections([])
        setExpandedSectionIds([])
        return
      }
      const nextSections = buildMetadataSections(decoded.message.humanReadableMetadata)
      setLoadedSelectionKey(activeSelectionKey)
      setSections(nextSections)
      setExpandedSectionIds(nextSections.map((section) => section.id))
    }

    void loadSections()

    return () => {
      cancelled = true
    }
  }, [activeSelectionKey, driver])

  const toggleSection = (sectionId: string) => {
    setExpandedSectionIds((current) =>
      current.includes(sectionId)
        ? current.filter((entry) => entry !== sectionId)
        : [...current, sectionId],
    )
  }
  const visibleSections =
    activeSelectionKey !== null && loadedSelectionKey === activeSelectionKey ? sections : []

  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      onClose={
        onRemove
          ? () => {
              onRemove(instrument.id)
            }
          : undefined
      }
    >
      {activeSelectionKey !== null ? (
        <section className={styles.singleSelectionContainer} aria-label="Selected message details">
          <h2 className={styles.singleSelectionHeading}>1 message selected</h2>
          <div className={styles.sectionsContainer}>
            {visibleSections.map((section) => {
              const isExpanded = expandedSectionIds.includes(section.id)
              return (
                <section className={styles.section} key={section.id}>
                  <h3 className={styles.sectionHeading}>
                    <button
                      type="button"
                      className={styles.sectionToggle}
                      aria-expanded={isExpanded}
                      onClick={() => {
                        toggleSection(section.id)
                      }}
                    >
                      <span
                        className={`${styles.sectionArrow} ${isExpanded ? styles.sectionArrowExpanded : ''}`}
                        aria-hidden="true"
                      >
                        ▶
                      </span>
                      <span className={styles.sectionHeadingText}>{section.label}</span>
                    </button>
                  </h3>
                  {isExpanded ? (
                    <p className={styles.sectionContent}>Placeholder content</p>
                  ) : null}
                </section>
              )
            })}
          </div>
        </section>
      ) : (
        <div className={styles.emptyStateContainer}>
          <p className={styles.emptyStateText}>Select a message to inspect.</p>
        </div>
      )}
    </InstrumentBase>
  )
}
