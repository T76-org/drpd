import { curveStepAfter, line, scaleLinear } from 'd3'
import { useMemo, type PointerEventHandler, type RefObject } from 'react'
import type { LoggedCapturedEventType, MessageLogTimeStripWindow } from '../../../lib/device'
import styles from './DrpdUsbPdLogTimeStrip.module.css'
import { DRPD_USB_PD_LOG_CONFIG } from './DrpdUsbPdLogTimeStrip.config'
import {
  findAnalogPointAtStepTimestamp,
  formatDeviceTimestampUs,
  findSelectedPulseSegment,
} from './DrpdUsbPdLogTimeStrip.utils'

const parseCssNumber = (
  value: string,
  fallback: number,
): number => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const resolveCssLength = (
  value: string,
  fallback: number,
): number => {
  if (value.trim().length === 0 || typeof document === 'undefined') {
    return fallback
  }

  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.width = value
  document.body.appendChild(probe)

  try {
    const resolved = window.getComputedStyle(probe).width
    return parseCssNumber(resolved, fallback)
  } finally {
    probe.remove()
  }
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

const resolveEventStroke = (eventType: LoggedCapturedEventType): string => {
  switch (eventType) {
    case 'capture_changed':
      return 'var(--timestrip-event-capture-stroke)'
    case 'cc_role_changed':
      return 'var(--timestrip-event-role-stroke)'
    case 'cc_status_changed':
      return 'var(--timestrip-event-status-stroke)'
  }
}

/**
 * Render-only time-strip view.
 */
export const DrpdUsbPdLogTimeStripRenderer = ({
  viewportRef,
  width,
  data,
  hoverPosition,
  selectedKey,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
}: {
  viewportRef?: RefObject<HTMLDivElement>
  width: number
  data: MessageLogTimeStripWindow | null
  hoverPosition: { x: number; y: number } | null
  selectedKey: string | null
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerCancel?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
}) => {
  const viewportStyle =
    viewportRef?.current !== undefined && viewportRef.current !== null
      ? getComputedStyle(viewportRef.current)
      : null
  const timeStripHeightPx = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-total-height') ?? '',
    80,
  )
  const axisHeightPx = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-axis-height') ?? '',
    10,
  )
  const pulseHeightPx = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-pulse-height') ?? '',
    20,
  )
  const analogHeightPx = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-analog-height') ?? '',
    50,
  )
  const axisLabelY = resolveCssLength(viewportStyle?.getPropertyValue('--timestrip-axis-label-y') ?? '', 5)
  const plotInsetLeft = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-plot-inset-left') ?? '',
    18,
  )
  const plotInsetRight = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-plot-inset-right') ?? '',
    18,
  )
  const pulseHighY = resolveCssLength(viewportStyle?.getPropertyValue('--timestrip-pulse-high-y') ?? '', 7)
  const pulseLowInsetBottom = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-pulse-low-inset-bottom') ?? '',
    7,
  )
  const analogTopInset = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-analog-top-inset') ?? '',
    8,
  )
  const analogBottomInset = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-analog-bottom-inset') ?? '',
    8,
  )
  const analogPointRadius = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-analog-point-radius') ?? '',
    1.8,
  )
  const analogScaleLabelInset = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-analog-scale-label-inset') ?? '',
    2,
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
      return { highlight: null, paths: [] as string[], events: [] as Array<{ key: string; x: number; stroke: string }> }
    }
    const lowY = pulseHeightPx - pulseLowInsetBottom
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
    const events = data.events.map((event) => ({
      key: event.selectionKey,
      x: xScale(Number(event.timestampUs)),
      stroke: resolveEventStroke(event.eventType),
    }))
    return { highlight, paths, events }
  }, [data, pulseHeightPx, pulseHighY, pulseLowInsetBottom, selectedPulse, xScale])
  const analogGeometry = useMemo(() => {
    const voltageScale = scaleLinear()
      .domain([0, DRPD_USB_PD_LOG_CONFIG.stripAnalog.voltageMax])
      .range([
        analogHeightPx - analogBottomInset,
        analogTopInset,
      ])
    const currentScale = scaleLinear()
      .domain([0, DRPD_USB_PD_LOG_CONFIG.stripAnalog.currentMax])
      .range([
        analogHeightPx - analogBottomInset,
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
        events: [] as Array<{ key: string; x: number; stroke: string }>,
      }
    }
    const pathBuilder = line<(typeof data.analogPoints)[number]>()
      .x((point) => xScale(Number(point.timestampUs)))
      .curve(curveStepAfter)
    const voltagePath =
      data.analogPoints.length > 0
        ? pathBuilder.y((point) => voltageScale(point.vbusV))(data.analogPoints)
        : null
    const currentPath =
      data.analogPoints.length > 0
        ? pathBuilder.y((point) => currentScale(point.ibusA))(data.analogPoints)
        : null
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
    const events = data.events.map((event) => ({
      key: event.selectionKey,
      x: xScale(Number(event.timestampUs)),
      stroke: resolveEventStroke(event.eventType),
    }))
    return {
      gridLines,
      highlight,
      voltagePath,
      currentPath,
      events,
    }
  }, [analogBottomInset, analogHeightPx, analogTopInset, data, selectedPulse, xScale])
  const hoverTooltip = useMemo(() => {
    if (!hoverPosition || !data || data.analogPoints.length === 0) {
      return null
    }
    const analogLaneTop = axisHeightPx + pulseHeightPx
    const analogLaneBottom = analogLaneTop + analogHeightPx
    if (hoverPosition.y < analogLaneTop || hoverPosition.y > analogLaneBottom) {
      return null
    }
    const localAnalogY = hoverPosition.y - analogLaneTop
    const voltageScale = scaleLinear()
      .domain([0, DRPD_USB_PD_LOG_CONFIG.stripAnalog.voltageMax])
      .range([analogHeightPx - analogBottomInset, analogTopInset])
    const currentScale = scaleLinear()
      .domain([0, DRPD_USB_PD_LOG_CONFIG.stripAnalog.currentMax])
      .range([analogHeightPx - analogBottomInset, analogTopInset])
    const hoverTimestampUs = BigInt(Math.round(xScale.invert(hoverPosition.x)))
    const nearestPoint = findAnalogPointAtStepTimestamp(data.analogPoints, hoverTimestampUs)
    if (!nearestPoint) {
      return null
    }
    const voltageY = voltageScale(nearestPoint.vbusV)
    const currentY = currentScale(nearestPoint.ibusA)
    const hoverThresholdPx = Math.max(8, analogPointRadius * 4)
    const isNearTrace =
      Math.min(
        Math.abs(localAnalogY - voltageY),
        Math.abs(localAnalogY - currentY),
      ) <= hoverThresholdPx
    if (!isNearTrace) {
      return null
    }
    const tooltipLeft = Math.min(Math.max(hoverPosition.x + analogPointRadius * 4, 4), Math.max(width - 84, 4))
    const tooltipTop = analogLaneTop + Math.max(4, analogPointRadius * 2)
    return {
      left: tooltipLeft,
      top: tooltipTop,
      vbusLabel: `${nearestPoint.vbusV.toFixed(2)} V`,
      ibusLabel: `${nearestPoint.ibusA.toFixed(2)} A`,
    }
  }, [analogBottomInset, analogHeightPx, analogPointRadius, analogTopInset, axisHeightPx, data, hoverPosition, pulseHeightPx, width, xScale])

  return (
    <div
      ref={viewportRef}
      className={styles.timeStripViewport}
      style={{ height: `${timeStripHeightPx}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      data-testid="drpd-usbpd-log-timestrip"
    >
      {hoverPosition ? (
        <div
          className={styles.hoverLine}
          style={{ left: `${Math.max(0, Math.min(width, hoverPosition.x))}px` }}
        />
      ) : null}
      <div className={styles.axisLane} style={{ height: `${axisHeightPx}px` }}>
        <svg className={styles.axisSvg} width={Math.max(width, 1)} height={axisHeightPx}>
          {ticks.map((tick, index) => (
            <g key={`${tick.x}-${index}`} transform={`translate(${tick.x},0)`}>
              <line className={styles.axisTick} y1={0} y2={axisHeightPx} />
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
      <div className={styles.pulseLane} style={{ height: `${pulseHeightPx}px` }}>
        <svg className={styles.laneSvg} width={Math.max(width, 1)} height={pulseHeightPx}>
          <defs>
            <clipPath id="drpd-usbpd-log-pulse-clip">
              <rect x={plotLeftX} y={0} width={plotWidth} height={pulseHeightPx} />
            </clipPath>
          </defs>
          <g clipPath="url(#drpd-usbpd-log-pulse-clip)">
            {pulseGeometry.highlight ? (
              <rect
                x={pulseGeometry.highlight.x}
                y={0}
                width={pulseGeometry.highlight.width}
                height={pulseHeightPx}
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
            {pulseGeometry.events.map((event) => (
              <line
                key={`pulse-event-${event.key}`}
                x1={event.x}
                y1={0}
                x2={event.x}
                y2={pulseHeightPx}
                stroke={event.stroke}
                strokeWidth="var(--timestrip-event-stroke-width)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>
      </div>
      <div className={styles.analogLane} style={{ height: `${analogHeightPx}px` }}>
        <svg className={styles.laneSvg} width={Math.max(width, 1)} height={analogHeightPx}>
          <defs>
            <clipPath id="drpd-usbpd-log-analog-clip">
              <rect x={plotLeftX} y={0} width={plotWidth} height={analogHeightPx} />
            </clipPath>
          </defs>
          <g clipPath="url(#drpd-usbpd-log-analog-clip)">
            {analogGeometry.highlight ? (
              <rect
                x={analogGeometry.highlight.x}
                y={0}
                width={analogGeometry.highlight.width}
                height={analogHeightPx}
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
            {analogGeometry.events.map((event) => (
              <line
                key={`analog-event-${event.key}`}
                x1={event.x}
                y1={0}
                x2={event.x}
                y2={analogHeightPx}
                stroke={event.stroke}
                strokeWidth="var(--timestrip-event-stroke-width)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          {analogGeometry.gridLines.map((line) => (
            <g key={`label-${line.key}`}>
              <text className={styles.analogScaleLabelLeft} x={analogScaleLabelInset} y={line.y}>
                {line.voltageLabel}
              </text>
              <text
                className={styles.analogScaleLabelRight}
                x={Math.max(width, 1) - analogScaleLabelInset}
                y={line.y}
              >
                {line.currentLabel}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {hoverTooltip ? (
        <div
          className={styles.hoverTooltip}
          style={{ left: `${hoverTooltip.left}px`, top: `${hoverTooltip.top}px` }}
        >
          <div className={styles.hoverTooltipVoltage}>{hoverTooltip.vbusLabel}</div>
          <div className={styles.hoverTooltipCurrent}>{hoverTooltip.ibusLabel}</div>
        </div>
      ) : null}
    </div>
  )
}
