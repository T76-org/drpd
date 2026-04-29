/**
 * Runtime-only configuration for the Message Log instrument and time strip.
 *
 * Pure CSS styling stays in the CSS modules; only values the TypeScript runtime
 * needs for layout math, virtualization, zooming, and SVG rendering live here.
 */
export const DRPD_USB_PD_LOG_CONFIG = {
  window: {
    defaultWindowUs: 60_000_000n, ///< Default visible strip width in microseconds.
    minWindowUs: 250n, ///< Minimum allowed strip width in microseconds.
    maxWindowUs: 60_000_000n, ///< Maximum allowed strip width in microseconds.
    zoomFactor: 2n, ///< Zoom multiplier for each in/out step.
  },
  stripLayout: {
    totalHeightPx: 187, ///< Total time-strip viewport height.
    axisHeightPx: 24, ///< Height of the timestamp row.
    pulseHeightPx: 42, ///< Height of the pulse lane including annotations.
    analogHeightPx: 121, ///< Height of the analog lane.
  },
  stripPulseAnnotations: {
    preambleDurationUs: 213.33, ///< Approximate USB-PD preamble duration at 300 kHz.
    sopDurationUs: 66.67, ///< Approximate USB-PD SOP token duration at 300 kHz.
    minPulseWidthPx: 156, ///< Minimum visible pulse width before showing annotations.
    minSegmentLabelWidthPx: 44, ///< Minimum segment width before drawing a label.
  },
  stripAxis: {
    tickTargetSpacingPx: 112, ///< Desired spacing between timestamp ticks.
  },
  stripAnalog: {
    voltageMax: 60, ///< Fixed VBUS vertical range maximum in volts.
    currentMax: 6, ///< Fixed IBUS vertical range maximum in amps.
    gridMarks: [0, 15, 30, 45, 60], ///< Horizontal guide marks for the analog lane.
    markerPointLimit: 256, ///< Maximum analog marker count before switching to path-only rendering.
  },
  tableBehavior: {
    pageSize: 200, ///< Table page fetch size.
    overscanRows: 18, ///< Extra virtualized rows above and below the viewport.
    countSyncIntervalMs: 1200, ///< Poll interval for row-count reconciliation.
    minCapturedMessageBuffer: 51, ///< Minimum allowed configured log buffer size.
  },
  tableLayout: {
    rowHeightPx: 14, ///< Table row height used by virtualization.
  },
} as const
