import type { CSSProperties } from 'react'

/**
 * Centralized, user-tunable configuration for the Message Log instrument and time strip.
 */
export const DRPD_USB_PD_LOG_CONFIG = {
  window: {
    defaultWindowUs: 100_000n, ///< Default visible strip width in microseconds.
    minWindowUs: 250n, ///< Minimum allowed strip width in microseconds.
    maxWindowUs: 500_000n, ///< Maximum allowed strip width in microseconds.
    zoomFactor: 2n, ///< Zoom multiplier for each in/out step.
  },
  stripLayout: {
    totalHeightPx: 80, ///< Total time-strip viewport height.
    axisHeightPx: 10, ///< Height of the timestamp row.
    pulseHeightPx: 20, ///< Height of the pulse lane.
    analogHeightPx: 50, ///< Height of the analog lane.
    shellGapPx: 2, ///< Vertical gap between strip sections.
    shellPaddingTopPx: 2, ///< Strip shell top padding.
    shellPaddingRightPx: 3, ///< Strip shell right padding.
    shellPaddingBottomPx: 2, ///< Strip shell bottom padding.
    shellPaddingLeftPx: 3, ///< Strip shell left padding.
    toolbarGapPx: 10, ///< Gap between toolbar regions.
    buttonGapPx: 4, ///< Gap between zoom buttons.
    scrollbarHeightPx: 9, ///< Horizontal scrollbar height.
    scrollbarTrackHeightPx: 1, ///< Scrollbar track element height.
  },
  stripAxis: {
    tickTargetSpacingPx: 96, ///< Desired spacing between timestamp ticks.
    tickStroke: 'rgba(255, 255, 255, 0.1)', ///< Timestamp tick stroke color.
    tickStrokeWidthPx: 1, ///< Timestamp tick stroke width.
    labelFontSizePx: 5, ///< Timestamp label font size.
    labelYpx: 5, ///< Timestamp label baseline position.
    labelColor: 'color-mix(in srgb, var(--color-text-primary) 92%, white 8%)', ///< Timestamp label color.
    borderColor: 'color-mix(in srgb, var(--color-border-panel) 55%, transparent)', ///< Timestamp lane divider color.
  },
  stripPulse: {
    strokeColor: 'rgba(145, 208, 255, 0.92)', ///< Pulse waveform stroke color.
    strokeWidthPx: 1, ///< Pulse waveform stroke width.
    highlightFill: 'rgba(145, 208, 255, 0.14)', ///< Selected pulse highlight color.
    highYpx: 7, ///< High-state waveform y-position.
    lowInsetBottomPx: 7, ///< Low-state inset from the lane bottom.
    borderColor: 'color-mix(in srgb, var(--color-border-panel) 45%, transparent)', ///< Pulse lane divider color.
  },
  stripAnalog: {
    voltageMax: 60, ///< Fixed VBUS vertical range maximum in volts.
    currentMax: 6, ///< Fixed IBUS vertical range maximum in amps.
    gridMarks: [0, 15, 30, 45, 60], ///< Horizontal guide marks for the analog lane.
    topInsetPx: 8, ///< Analog trace top inset.
    bottomInsetPx: 8, ///< Analog trace bottom inset.
    gridStroke: 'rgba(255, 255, 255, 0.08)', ///< Analog grid line color.
    gridStrokeWidthPx: 1, ///< Analog grid line width.
    selectionFill: 'rgba(145, 208, 255, 0.10)', ///< Selected message highlight in analog lane.
    voltageStroke: 'rgba(255, 196, 92, 0.95)', ///< VBUS trace color.
    currentStroke: 'rgba(119, 232, 171, 0.95)', ///< IBUS trace color.
    traceStrokeWidthPx: 1.5, ///< Analog trace line width.
    pointRadiusPx: 1.8, ///< Analog sample point radius.
  },
  stripToolbar: {
    buttonMinWidthPx: 68, ///< Minimum zoom button width.
    buttonFontSizeRem: 0.33, ///< Zoom button font size.
    buttonPaddingYpx: 2, ///< Zoom button vertical padding.
    buttonPaddingXpx: 6, ///< Zoom button horizontal padding.
    buttonLetterSpacing: 'var(--letter-spacing-sm)', ///< Zoom button letter spacing.
    buttonBorderColor: 'color-mix(in srgb, var(--color-border-panel) 84%, white 16%)', ///< Zoom button border color.
    buttonBackground: 'color-mix(in srgb, var(--color-surface-panel) 82%, black 18%)', ///< Zoom button background.
    buttonTextColor: 'var(--color-text-primary)', ///< Zoom button text color.
  },
  stripShell: {
    background:
      'linear-gradient(180deg, color-mix(in srgb, var(--color-surface-panel-accent) 70%, var(--color-surface-instrument) 30%), color-mix(in srgb, var(--color-surface-instrument) 94%, black 6%))', ///< Strip shell background.
    viewportBackground:
      'linear-gradient(180deg, color-mix(in srgb, var(--color-surface-panel) 45%, transparent), transparent 22%, color-mix(in srgb, var(--color-surface-instrument) 92%, black 8%))', ///< Strip viewport background.
    shellBorderColor: 'color-mix(in srgb, var(--color-border-panel) 70%, transparent)', ///< Strip shell border color.
    viewportBorderColor: 'color-mix(in srgb, var(--color-border-panel) 72%, transparent)', ///< Strip viewport border color.
    scrollbarThumb: 'rgba(255, 255, 255, 0.22)', ///< WebKit scrollbar thumb color.
    scrollbarThumbFirefox: 'rgba(255, 255, 255, 0.24)', ///< Firefox scrollbar thumb color.
  },
  tableBehavior: {
    pageSize: 200, ///< Table page fetch size.
    overscanRows: 18, ///< Extra virtualized rows above and below the viewport.
    countSyncIntervalMs: 1200, ///< Poll interval for row-count reconciliation.
    minCapturedMessageBuffer: 51, ///< Minimum allowed configured log buffer size.
  },
  tableLayout: {
    rowHeightPx: 14, ///< Table row height.
    headerPaddingX: 'var(--space-8)', ///< Horizontal padding for the table header.
    rowPaddingX: 'var(--space-8)', ///< Horizontal padding for each table row.
    columnWidthTimestamp: '11ch', ///< Timestamp column width.
    columnWidthDuration: '8ch', ///< Duration column width.
    columnWidthDelta: '12ch', ///< Delta column width.
    columnWidthId: '3ch', ///< Message ID column width.
    columnWidthMessageType: '29ch', ///< Message type column width.
    columnWidthSender: '10ch', ///< Sender column width.
    columnWidthReceiver: '10ch', ///< Receiver column width.
    columnWidthSopType: '5ch', ///< SOP column width.
    columnWidthValid: '5ch', ///< Validity column width.
  },
  tableTypography: {
    headerFontSize: 'var(--font-size-3xs)', ///< Header font size.
    headerLetterSpacing: 'var(--letter-spacing-sm)', ///< Header letter spacing.
    rowFontSize: 'var(--font-size-3xs)', ///< Row font size.
  },
  tableColors: {
    headerTopBorder: 'color-mix(in srgb, var(--color-border-panel) 70%, transparent)', ///< Header top border color.
    headerBottomBorder: 'color-mix(in srgb, var(--color-border-panel) 95%, transparent)', ///< Header bottom border color.
    headerBackground: 'color-mix(in srgb, var(--color-surface-panel-accent) 88%, var(--color-surface-instrument) 12%)', ///< Header background.
    headerTextColor: 'color-mix(in srgb, var(--color-text-muted) 92%, var(--color-text-primary) 8%)', ///< Header text color.
    viewportBackground: 'var(--color-surface-instrument)', ///< Table viewport background.
    viewportScrollbarThumb: 'rgba(255, 255, 255, 0.14)', ///< Table scrollbar thumb color.
    viewportScrollbarThumbHover: 'rgba(255, 255, 255, 0.2)', ///< Table scrollbar thumb hover color.
    rowBorder: 'color-mix(in srgb, var(--color-border-panel) 40%, transparent)', ///< Table row divider color.
    rowTextColor: 'var(--color-text-primary)', ///< Table row text color.
    selectedRowBackground: 'color-mix(in srgb, var(--color-status-info) 30%, transparent)', ///< Selected row background.
    selectedRowOutline: 'color-mix(in srgb, var(--color-status-info) 80%, white 20%)', ///< Selected row outline color.
  },
  tableAlignment: {
    headerDefaultAlign: 'center', ///< Default header alignment.
    cellRightAlign: 'end', ///< Right-aligned numeric cell alignment.
    cellCenterAlign: 'center', ///< Center-aligned cell alignment.
    eventLabelAlign: 'left', ///< Event-row text alignment.
  },
} as const

/**
 * Convert centralized config into CSS custom properties for the Message Log CSS modules.
 *
 * @returns Inline CSS variable map.
 */
export const buildDrpdUsbPdLogStyleVariables = (): CSSProperties => ({
  '--timestrip-shell-gap': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.shellGapPx}px`,
  '--timestrip-shell-padding-top': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.shellPaddingTopPx}px`,
  '--timestrip-shell-padding-right': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.shellPaddingRightPx}px`,
  '--timestrip-shell-padding-bottom': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.shellPaddingBottomPx}px`,
  '--timestrip-shell-padding-left': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.shellPaddingLeftPx}px`,
  '--timestrip-toolbar-gap': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.toolbarGapPx}px`,
  '--timestrip-button-gap': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.buttonGapPx}px`,
  '--timestrip-scrollbar-height': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.scrollbarHeightPx}px`,
  '--timestrip-scrollbar-track-height': `${DRPD_USB_PD_LOG_CONFIG.stripLayout.scrollbarTrackHeightPx}px`,
  '--timestrip-shell-background': DRPD_USB_PD_LOG_CONFIG.stripShell.background,
  '--timestrip-viewport-background': DRPD_USB_PD_LOG_CONFIG.stripShell.viewportBackground,
  '--timestrip-shell-border-color': DRPD_USB_PD_LOG_CONFIG.stripShell.shellBorderColor,
  '--timestrip-viewport-border-color': DRPD_USB_PD_LOG_CONFIG.stripShell.viewportBorderColor,
  '--timestrip-scrollbar-thumb': DRPD_USB_PD_LOG_CONFIG.stripShell.scrollbarThumb,
  '--timestrip-scrollbar-thumb-firefox': DRPD_USB_PD_LOG_CONFIG.stripShell.scrollbarThumbFirefox,
  '--timestrip-axis-border-color': DRPD_USB_PD_LOG_CONFIG.stripAxis.borderColor,
  '--timestrip-axis-tick-stroke': DRPD_USB_PD_LOG_CONFIG.stripAxis.tickStroke,
  '--timestrip-axis-tick-stroke-width': `${DRPD_USB_PD_LOG_CONFIG.stripAxis.tickStrokeWidthPx}px`,
  '--timestrip-axis-label-font-size': `${DRPD_USB_PD_LOG_CONFIG.stripAxis.labelFontSizePx}px`,
  '--timestrip-axis-label-color': DRPD_USB_PD_LOG_CONFIG.stripAxis.labelColor,
  '--timestrip-pulse-border-color': DRPD_USB_PD_LOG_CONFIG.stripPulse.borderColor,
  '--timestrip-button-min-width': `${DRPD_USB_PD_LOG_CONFIG.stripToolbar.buttonMinWidthPx}px`,
  '--timestrip-button-font-size': `${DRPD_USB_PD_LOG_CONFIG.stripToolbar.buttonFontSizeRem}rem`,
  '--timestrip-button-padding-y': `${DRPD_USB_PD_LOG_CONFIG.stripToolbar.buttonPaddingYpx}px`,
  '--timestrip-button-padding-x': `${DRPD_USB_PD_LOG_CONFIG.stripToolbar.buttonPaddingXpx}px`,
  '--timestrip-button-letter-spacing': DRPD_USB_PD_LOG_CONFIG.stripToolbar.buttonLetterSpacing,
  '--timestrip-button-border-color': DRPD_USB_PD_LOG_CONFIG.stripToolbar.buttonBorderColor,
  '--timestrip-button-background': DRPD_USB_PD_LOG_CONFIG.stripToolbar.buttonBackground,
  '--timestrip-button-text-color': DRPD_USB_PD_LOG_CONFIG.stripToolbar.buttonTextColor,
  '--message-log-row-height': `${DRPD_USB_PD_LOG_CONFIG.tableLayout.rowHeightPx}px`,
  '--message-log-header-padding-x': DRPD_USB_PD_LOG_CONFIG.tableLayout.headerPaddingX,
  '--message-log-row-padding-x': DRPD_USB_PD_LOG_CONFIG.tableLayout.rowPaddingX,
  '--message-log-column-width-timestamp': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthTimestamp,
  '--message-log-column-width-duration': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthDuration,
  '--message-log-column-width-delta': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthDelta,
  '--message-log-column-width-id': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthId,
  '--message-log-column-width-message-type': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthMessageType,
  '--message-log-column-width-sender': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthSender,
  '--message-log-column-width-receiver': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthReceiver,
  '--message-log-column-width-sop-type': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthSopType,
  '--message-log-column-width-valid': DRPD_USB_PD_LOG_CONFIG.tableLayout.columnWidthValid,
  '--message-log-header-font-size': DRPD_USB_PD_LOG_CONFIG.tableTypography.headerFontSize,
  '--message-log-header-letter-spacing': DRPD_USB_PD_LOG_CONFIG.tableTypography.headerLetterSpacing,
  '--message-log-row-font-size': DRPD_USB_PD_LOG_CONFIG.tableTypography.rowFontSize,
  '--message-log-header-top-border': DRPD_USB_PD_LOG_CONFIG.tableColors.headerTopBorder,
  '--message-log-header-bottom-border': DRPD_USB_PD_LOG_CONFIG.tableColors.headerBottomBorder,
  '--message-log-header-background': DRPD_USB_PD_LOG_CONFIG.tableColors.headerBackground,
  '--message-log-header-text-color': DRPD_USB_PD_LOG_CONFIG.tableColors.headerTextColor,
  '--message-log-viewport-background': DRPD_USB_PD_LOG_CONFIG.tableColors.viewportBackground,
  '--message-log-scrollbar-thumb': DRPD_USB_PD_LOG_CONFIG.tableColors.viewportScrollbarThumb,
  '--message-log-scrollbar-thumb-hover': DRPD_USB_PD_LOG_CONFIG.tableColors.viewportScrollbarThumbHover,
  '--message-log-row-border': DRPD_USB_PD_LOG_CONFIG.tableColors.rowBorder,
  '--message-log-row-text-color': DRPD_USB_PD_LOG_CONFIG.tableColors.rowTextColor,
  '--message-log-selected-row-background': DRPD_USB_PD_LOG_CONFIG.tableColors.selectedRowBackground,
  '--message-log-selected-row-outline': DRPD_USB_PD_LOG_CONFIG.tableColors.selectedRowOutline,
  '--message-log-header-default-align': DRPD_USB_PD_LOG_CONFIG.tableAlignment.headerDefaultAlign,
  '--message-log-cell-right-align': DRPD_USB_PD_LOG_CONFIG.tableAlignment.cellRightAlign,
  '--message-log-cell-center-align': DRPD_USB_PD_LOG_CONFIG.tableAlignment.cellCenterAlign,
  '--message-log-event-label-align': DRPD_USB_PD_LOG_CONFIG.tableAlignment.eventLabelAlign,
}) as CSSProperties
