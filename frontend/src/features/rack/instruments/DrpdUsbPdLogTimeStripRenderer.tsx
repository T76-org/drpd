import { curveStepAfter, line, scaleLinear } from 'd3'
import { useMemo, type PointerEventHandler, type RefObject } from 'react'
import type { LoggedCapturedEventType, MessageLogTimeStripWindow } from '../../../lib/device'
import styles from './DrpdUsbPdLogTimeStrip.module.css'
import { DRPD_USB_PD_LOG_CONFIG } from './DrpdUsbPdLogTimeStrip.config'
import {
  findAnalogPointAtStepTimestamp,
  formatDeviceTimestampUs,
  formatWallClock,
  findSelectedPulseSegment,
  interpolateDisplayTimestampUs,
  interpolateWallClockUs,
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
    case 'mark':
      return 'var(--timestrip-event-mark-stroke)'
    case 'vbus_ovp':
      return 'var(--timestrip-event-ovp-stroke)'
    case 'vbus_ocp':
      return 'var(--timestrip-event-ocp-stroke)'
  }
}

const normalizeTickIntervalUs = (rawIntervalUs: number): bigint => {
  if (!Number.isFinite(rawIntervalUs) || rawIntervalUs <= 1) {
    return 1n
  }
  const magnitude = 10 ** Math.floor(Math.log10(rawIntervalUs))
  const normalized = rawIntervalUs / magnitude
  const step =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 5
          ? 5
          : 10
  return BigInt(Math.max(1, Math.ceil(step * magnitude)))
}

const floorToIntervalUs = (
  timestampUs: bigint,
  intervalUs: bigint,
): bigint => {
  if (intervalUs <= 0n) {
    return timestampUs
  }
  return (timestampUs / intervalUs) * intervalUs
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
  const pulseAnnotationTop = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-pulse-annotation-top') ?? '',
    18,
  )
  const pulseAnnotationHeight = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-pulse-annotation-height') ?? '',
    11,
  )
  const pulseAnnotationFontSize = resolveCssLength(
    viewportStyle?.getPropertyValue('--timestrip-pulse-annotation-font-size') ?? '',
    5,
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
    if (!data || plotWidth <= 0) {
      return []
    }

    const tickSpacingPx = Math.max(1, DRPD_USB_PD_LOG_CONFIG.stripAxis.tickTargetSpacingPx)
    const rawIntervalUs = (Number(data.windowDurationUs) / plotWidth) * tickSpacingPx
    const tickIntervalUs = normalizeTickIntervalUs(rawIntervalUs)
    const latestVisibleTimestampUs = data.latestTimestampUs ?? data.windowEndUs
    const tickStartUs = floorToIntervalUs(data.windowStartUs, tickIntervalUs)
    const nextTicks = []

    for (
      let timestampUs = tickStartUs;
      timestampUs <= latestVisibleTimestampUs;
      timestampUs += tickIntervalUs
    ) {
      const x = xScale(Number(timestampUs))
      if (x < plotLeftX || x >= plotRightX) {
        continue
      }
      const displayTimestampUs = interpolateDisplayTimestampUs(
        timestampUs,
        data.timeAnchors,
      )
      nextTicks.push({
        x,
        timestampUs,
        displayLabel: formatWallClock(interpolateWallClockUs(timestampUs, data.timeAnchors)),
        deviceLabel: formatDeviceTimestampUs(displayTimestampUs),
      })
    }
    return nextTicks
  }, [data, plotLeftX, plotRightX, plotWidth, xScale])
  const pulseGeometry = useMemo(() => {
    const lowY = pulseHeightPx - pulseLowInsetBottom
    if (!data) {
      return {
        annotations: [] as Array<{
          key: string
          x: number
          width: number
          label: string
          fill: string
          showLabel: boolean
          y: number
          height: number
          textY: number
          index: number
        }>,
        baselines: [{
          x1: plotLeftX,
          x2: plotRightX,
          y: lowY,
        }],
        highlight: null,
        paths: [] as string[],
        events: [] as Array<{ key: string; x: number; stroke: string }>,
      }
    }
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
    const annotations = data.pulses.flatMap((pulse, index) => {
      const pulseStartUs = Number(pulse.startTimestampUs)
      const pulseEndUs = Number(pulse.traceEndTimestampUs)
      const pulseWidthPx = xScale(pulseEndUs) - xScale(pulseStartUs)
      if (pulseWidthPx < DRPD_USB_PD_LOG_CONFIG.stripPulseAnnotations.minPulseWidthPx) {
        return []
      }
      const preambleEndUs = Math.min(
        pulseEndUs,
        pulseStartUs + DRPD_USB_PD_LOG_CONFIG.stripPulseAnnotations.preambleDurationUs,
      )
      const sopEndUs = Math.min(
        pulseEndUs,
        preambleEndUs + DRPD_USB_PD_LOG_CONFIG.stripPulseAnnotations.sopDurationUs,
      )
      const segments = [
        {
          key: `${pulse.selectionKey}-preamble`,
          x: xScale(pulseStartUs),
          width: xScale(preambleEndUs) - xScale(pulseStartUs),
          label: 'Preamble',
          fill: 'var(--timestrip-pulse-annotation-preamble-fill)',
        },
        {
          key: `${pulse.selectionKey}-sop`,
          x: xScale(preambleEndUs),
          width: xScale(sopEndUs) - xScale(preambleEndUs),
          label: pulse.sopLabel ?? 'SOP',
          fill: 'var(--timestrip-pulse-annotation-sop-fill)',
        },
        {
          key: `${pulse.selectionKey}-message`,
          x: xScale(sopEndUs),
          width: xScale(pulseEndUs) - xScale(sopEndUs),
          label: pulse.messageLabel ?? 'message',
          fill: 'var(--timestrip-pulse-annotation-message-fill)',
        },
      ]
      return segments
        .filter((segment) => segment.width > 1)
        .map((segment) => ({
          ...segment,
          showLabel: segment.width >= DRPD_USB_PD_LOG_CONFIG.stripPulseAnnotations.minSegmentLabelWidthPx,
          y: pulseAnnotationTop,
          height: pulseAnnotationHeight,
          textY: pulseAnnotationTop + pulseAnnotationHeight / 2,
          index,
        }))
    })
    const baselines =
      data.pulses.length === 0
        ? [{
            x1: plotLeftX,
            x2: plotRightX,
            y: lowY,
          }]
        : [
            {
              startUs: data.windowStartUs,
              endUs: data.pulses[0]?.startTimestampUs ?? data.windowEndUs,
            },
            ...data.pulses.slice(0, -1).map((pulse, index) => ({
              startUs: pulse.traceEndTimestampUs,
              endUs: data.pulses[index + 1]?.startTimestampUs ?? pulse.traceEndTimestampUs,
            })),
            {
              startUs: data.pulses[data.pulses.length - 1]?.traceEndTimestampUs ?? data.windowStartUs,
              endUs: data.windowEndUs,
            },
          ]
            .filter((segment) => segment.endUs > segment.startUs)
            .map((segment) => ({
              x1: xScale(Number(segment.startUs)),
              x2: xScale(Number(segment.endUs)),
              y: lowY,
            }))
    const events = data.events.map((event) => ({
      key: event.selectionKey,
      x: xScale(Number(event.timestampUs)),
      stroke: resolveEventStroke(event.eventType),
    }))
    return { annotations, baselines, highlight, paths, events }
  }, [data, plotLeftX, plotRightX, pulseAnnotationHeight, pulseAnnotationTop, pulseHeightPx, pulseHighY, pulseLowInsetBottom, selectedPulse, xScale])
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
            <g key={`${tick.timestampUs}-${index}`} transform={`translate(${tick.x},0)`}>
              <line className={styles.axisTick} y1={0} y2={axisHeightPx} />
              <text
                className={styles.axisDeviceLabel}
                y={axisLabelY}
                textAnchor="middle"
              >
                <title>{tick.deviceLabel}</title>
                {tick.displayLabel}
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
            {pulseGeometry.baselines.map((baseline, index) => (
              <line
                key={`pulse-baseline-${index}-${baseline.x1}-${baseline.x2}`}
                x1={baseline.x1}
                y1={baseline.y}
                x2={baseline.x2}
                y2={baseline.y}
                stroke="var(--timestrip-pulse-stroke)"
                strokeWidth="var(--timestrip-pulse-stroke-width)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
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
            {pulseGeometry.annotations.map((annotation) => (
              <g key={`pulse-annotation-${annotation.key}`}>
                <rect
                  x={annotation.x}
                  y={annotation.y}
                  width={annotation.width}
                  height={annotation.height}
                  fill={annotation.fill}
                />
                {annotation.showLabel ? (
                  <text
                    x={annotation.x + annotation.width / 2}
                    y={annotation.textY}
                    fill="var(--timestrip-pulse-annotation-text)"
                    fontSize={pulseAnnotationFontSize}
                    dominantBaseline="middle"
                    textAnchor="middle"
                  >
                    {annotation.label}
                  </text>
                ) : null}
              </g>
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
