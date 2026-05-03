/**
 * Runtime-only configuration for the Message Log instrument.
 *
 * Pure CSS styling stays in CSS modules; only values the TypeScript runtime
 * needs for table virtualization live here.
 */
export const DRPD_USB_PD_LOG_CONFIG = {
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
