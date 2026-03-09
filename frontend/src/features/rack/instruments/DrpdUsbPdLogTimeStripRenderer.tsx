import { line, scaleLinear } from 'd3'
import { useMemo, type PointerEventHandler, type RefObject } from 'react'
import type { MessageLogTimeStripWindow } from '../../../lib/device'
import styles from './DrpdUsbPdLogTimeStrip.module.css'
import { DRPD_USB_PD_LOG_CONFIG } from './DrpdUsbPdLogTimeStrip.config'
import {
  ANALOG_HEIGHT_PX,
  AXIS_HEIGHT_PX,
  PULSE_HEIGHT_PX,
  TIME_STRIP_HEIGHT_PX,
  formatDeviceTimestampUs,
  findSelectedPulseSegment,
} from './DrpdUsbPdLogTimeStrip.utils'

const parseCssPixels = (
  value: string,
  fallback: number,
): number => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const formatScaleLabel = (
  value: number,
  suffix: string,
): string => {
  if (Number.isInteger(value)) {
    return `${value}${suffix}`
  }
  return `${value.toFixed(1).replace(/\.0$/, '')}${suffix}`
}

/**
 * Render-only time-strip view.
 */
export const DrpdUsbPdLogTimeStripRenderer = ({
  viewportRef,
  width,
  data,
  selectedKey,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  viewportRef?: RefObject<HTMLDivElement>
  width: number
  data: MessageLogTimeStripWindow | null
  selectedKey: string | null
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerCancel?: PointerEventHandler<HTMLDivElement>
}) => {
  const viewportStyle =
    viewportRef?.current !== undefined && viewportRef.current !== null
      ? getComputedStyle(viewportRef.current)
      : null
  const axisLabelY = parseCssPixels(viewportStyle?.getPropertyValue('--timestrip-axis-label-y') ?? '', 5)
  const plotInsetLeft = parseCssPixels(
    viewportStyle?.getPropertyValue('--timestrip-plot-inset-left') ?? '',
    18,
  )
  const plotInsetRight = parseCssPixels(
    viewportStyle?.getPropertyValue('--timestrip-plot-inset-right') ?? '',
    18,
  )
  const pulseHighY = parseCssPixels(viewportStyle?.getPropertyValue('--timestrip-pulse-high-y') ?? '', 7)
  const pulseLowInsetBottom = parseCssPixels(
    viewportStyle?.getPropertyValue('--timestrip-pulse-low-inset-bottom') ?? '',
    7,
  )
  const analogTopInset = parseCssPixels(
    viewportStyle?.getPropertyValue('--timestrip-analog-top-inset') ?? '',
    8,
  )
  const analogBottomInset = parseCssPixels(
    viewportStyle?.getPropertyValue('--timestrip-analog-bottom-inset') ?? '',
    8,
  )
  const analogPointRadius = parseCssPixels(
    viewportStyle?.getPropertyValue('--timestrip-analog-point-radius') ?? '',
    1.8,
  )
  const plotLeftX = Math.min(Math.max(0, plotInsetLeft), Math.max(width, 1))
  const plotRightX = Math.max(plotLeftX, Math.max(width, 1) - Math.max(0, plotInsetRight))
  const plotWidth = Math.max(0, plotRightX - plotLeftX)
  const selectedPulse = useMemo(
    () => findSelectedPulseSegment(data?.pulses ?? [], selectedKey),
    [data?.pulses, selectedKey],
  )
  const xScale = useMemo(() => {
    const domainStart = Number(data?.windowStartUs ?? 0n)
    const domainEnd = Number(data?.windowEndUs ?? 1n)
    return scaleLinear()
      .domain([domainStart, domainEnd > domainStart ? domainEnd : domainStart + 1])
      .range([plotLeftX, plotRightX])
  }, [data?.windowEndUs, data?.windowStartUs, plotLeftX, plotRightX])
  const ticks = useMemo(() => {
    const targetCount = Math.max(
      2,
      Math.floor(width / DRPD_USB_PD_LOG_CONFIG.stripAxis.tickTargetSpacingPx),
    )
    return xScale.ticks(targetCount).map((tick) => {
      const timestampUs = BigInt(Math.round(tick))
      return {
        x: xScale(tick),
        deviceLabel: formatDeviceTimestampUs(timestampUs),
      }
    })
  }, [width, xScale])
  const pulseGeometry = useMemo(() => {
    if (!data) {
      return { highlight: null, paths: [] as string[] }
    }
    const lowY = PULSE_HEIGHT_PX - pulseLowInsetBottom
    const highY = pulseHighY
    const highlight = selectedPulse
      ? {
          x: xScale(Number(selectedPulse.startTimestampUs)),
          width: Math.max(
            1,
            xScale(Number(selectedPulse.traceEndTimestampUs)) -
              xScale(Number(selectedPulse.startTimestampUs)),
          ),
        }
      : null
    const paths = data.pulses.map((pulse) => {
      let timestampUs = Number(pulse.startTimestampUs)
      let stateHigh = false
      const commands: string[] = [`M ${xScale(timestampUs)} ${lowY}`]
      for (const widthNs of pulse.pulseWidthsNs) {
        timestampUs += widthNs / 1_000
        const x = xScale(timestampUs)
        const y = stateHigh ? highY : lowY
        commands.push(`L ${x} ${y}`)
        stateHigh = !stateHigh
        commands.push(`L ${x} ${stateHigh ? highY : lowY}`)
      }
      const pulseEndX = xScale(Number(pulse.traceEndTimestampUs))
      commands.push(`L ${pulseEndX} ${stateHigh ? highY : lowY}`)
      if (stateHigh) {
        commands.push(`L ${pulseEndX} ${lowY}`)
      }
      return commands.join(' ')
    })
    return { highlight, paths }
  }, [data, pulseHighY, pulseLowInsetBottom, selectedPulse, xScale])
  const analogGeometry = useMemo(() => {
    const voltageScale = scaleLinear()
      .domain([0, DRPD_USB_PD_LOG_CONFIG.stripAnalog.voltageMax])
      .range([
        ANALOG_HEIGHT_PX - analogBottomInset,
        analogTopInset,
      ])
    const currentScale = scaleLinear()
      .domain([0, DRPD_USB_PD_LOG_CONFIG.stripAnalog.currentMax])
      .range([
        ANALOG_HEIGHT_PX - analogBottomInset,
        analogTopInset,
      ])
    const gridLines = DRPD_USB_PD_LOG_CONFIG.stripAnalog.gridMarks.map((mark) => ({
      y: voltageScale(mark),
      key: mark,
      voltageLabel: formatScaleLabel(mark, 'V'),
      currentLabel: formatScaleLabel(
        (mark / DRPD_USB_PD_LOG_CONFIG.stripAnalog.voltageMax) *
          DRPD_USB_PD_LOG_CONFIG.stripAnalog.currentMax,
        'A',
      ),
    }))
    if (!data) {
      return {
        gridLines,
        highlight: null as null | { x: number; width: number },
        voltagePath: null as string | null,
        currentPath: null as string | null,
        voltageMarkers: [] as Array<{ key: string; x: number; y: number }>,
        currentMarkers: [] as Array<{ key: string; x: number; y: number }>,
      }
    }
    const pathBuilder = line<(typeof data.analogPoints)[number]>()
      .x((point) => xScale(Number(point.timestampUs)))
    const voltagePath =
      data.analogPoints.length > 0
        ? pathBuilder.y((point) => voltageScale(point.vbusV))(data.analogPoints)
        : null
    const currentPath =
      data.analogPoints.length > 0
        ? pathBuilder.y((point) => currentScale(point.ibusA))(data.analogPoints)
        : null
    const markersEnabled =
      data.analogPoints.length <= DRPD_USB_PD_LOG_CONFIG.stripAnalog.markerPointLimit
    const voltageMarkers = markersEnabled
      ? data.analogPoints.map((point, index) => ({
          key: `v-${index}-${point.timestampUs.toString()}`,
          x: xScale(Number(point.timestampUs)),
          y: voltageScale(point.vbusV),
        }))
      : []
    const currentMarkers = markersEnabled
      ? data.analogPoints.map((point, index) => ({
          key: `i-${index}-${point.timestampUs.toString()}`,
          x: xScale(Number(point.timestampUs)),
          y: currentScale(point.ibusA),
        }))
      : []
    const highlight = selectedPulse
      ? {
          x: xScale(Number(selectedPulse.startTimestampUs)),
          width: Math.max(
            1,
            xScale(Number(selectedPulse.traceEndTimestampUs)) -
              xScale(Number(selectedPulse.startTimestampUs)),
          ),
        }
      : null
    return {
      gridLines,
      highlight,
      voltagePath,
      currentPath,
      voltageMarkers,
      currentMarkers,
    }
  }, [analogBottomInset, analogTopInset, data, selectedPulse, xScale])

  return (
    <div
      ref={viewportRef}
      className={styles.timeStripViewport}
      style={{ height: `${TIME_STRIP_HEIGHT_PX}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      data-testid="drpd-usbpd-log-timestrip"
    >
      <div className={styles.axisLane} style={{ height: `${AXIS_HEIGHT_PX}px` }}>
        <svg className={styles.axisSvg} width={Math.max(width, 1)} height={AXIS_HEIGHT_PX}>
          {ticks.map((tick, index) => (
            <g key={`${tick.x}-${index}`} transform={`translate(${tick.x},0)`}>
              <line className={styles.axisTick} y1={0} y2={AXIS_HEIGHT_PX} />
              <text
                className={styles.axisDeviceLabel}
                y={axisLabelY}
                textAnchor="middle"
              >
                {tick.deviceLabel}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className={styles.pulseLane} style={{ height: `${PULSE_HEIGHT_PX}px` }}>
        <svg className={styles.laneSvg} width={Math.max(width, 1)} height={PULSE_HEIGHT_PX}>
          <defs>
            <clipPath id="drpd-usbpd-log-pulse-clip">
              <rect x={plotLeftX} y={0} width={plotWidth} height={PULSE_HEIGHT_PX} />
            </clipPath>
          </defs>
          <g clipPath="url(#drpd-usbpd-log-pulse-clip)">
            {pulseGeometry.highlight ? (
              <rect
                x={pulseGeometry.highlight.x}
                y={0}
                width={pulseGeometry.highlight.width}
                height={PULSE_HEIGHT_PX}
                fill="var(--timestrip-pulse-highlight-fill)"
              />
            ) : null}
            {pulseGeometry.paths.map((path, index) => (
              <path
                key={`${index}-${path.length}`}
                d={path}
                fill="none"
                stroke="var(--timestrip-pulse-stroke)"
                strokeWidth="var(--timestrip-pulse-stroke-width)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>
      </div>
      <div className={styles.analogLane} style={{ height: `${ANALOG_HEIGHT_PX}px` }}>
        <svg className={styles.laneSvg} width={Math.max(width, 1)} height={ANALOG_HEIGHT_PX}>
          <defs>
            <clipPath id="drpd-usbpd-log-analog-clip">
              <rect x={plotLeftX} y={0} width={plotWidth} height={ANALOG_HEIGHT_PX} />
            </clipPath>
          </defs>
          <g clipPath="url(#drpd-usbpd-log-analog-clip)">
            {analogGeometry.highlight ? (
              <rect
                x={analogGeometry.highlight.x}
                y={0}
                width={analogGeometry.highlight.width}
                height={ANALOG_HEIGHT_PX}
                fill="var(--timestrip-analog-selection-fill)"
              />
            ) : null}
            {analogGeometry.gridLines.map((line) => (
              <line
                key={`grid-${line.key}`}
                x1={plotLeftX}
                y1={line.y}
                x2={plotRightX}
                y2={line.y}
                stroke="var(--timestrip-analog-grid-stroke)"
                strokeWidth="var(--timestrip-analog-grid-stroke-width)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {analogGeometry.voltagePath ? (
              <path
                d={analogGeometry.voltagePath}
                fill="none"
                stroke="var(--timestrip-analog-voltage-stroke)"
                strokeWidth="var(--timestrip-analog-trace-stroke-width)"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {analogGeometry.currentPath ? (
              <path
                d={analogGeometry.currentPath}
                fill="none"
                stroke="var(--timestrip-analog-current-stroke)"
                strokeWidth="var(--timestrip-analog-trace-stroke-width)"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {analogGeometry.voltageMarkers.map((point) => (
              <circle
                key={point.key}
                cx={point.x}
                cy={point.y}
                r={analogPointRadius}
                fill="var(--timestrip-analog-voltage-stroke)"
              />
            ))}
            {analogGeometry.currentMarkers.map((point) => (
              <circle
                key={point.key}
                cx={point.x}
                cy={point.y}
                r={analogPointRadius}
                fill="var(--timestrip-analog-current-stroke)"
              />
            ))}
          </g>
          {analogGeometry.gridLines.map((line) => (
            <g key={`label-${line.key}`}>
              <text className={styles.analogScaleLabelLeft} x={2} y={line.y}>
                {line.voltageLabel}
              </text>
              <text
                className={styles.analogScaleLabelRight}
                x={Math.max(width, 1) - 2}
                y={line.y}
              >
                {line.currentLabel}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
