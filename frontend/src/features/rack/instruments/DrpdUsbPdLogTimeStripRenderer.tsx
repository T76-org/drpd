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

const AXIS_LABEL_Y_PX = 12
const PLOT_INSET_X_PX = 23.4
const PULSE_HIGH_Y_PX = 7
const PULSE_LOW_INSET_BOTTOM_PX = 22
const PULSE_ANNOTATION_TOP_PX = 24
const PULSE_ANNOTATION_HEIGHT_PX = 16
const PULSE_ANNOTATION_FONT_SIZE_PX = 6.5
const ANALOG_TOP_INSET_PX = 16
const ANALOG_BOTTOM_INSET_PX = 16
const ANALOG_POINT_RADIUS_PX = 1.8
const ANALOG_SCALE_LABEL_INSET_PX = 6.5

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
  height,
  data,
  hoverPosition,
  selectedKey,
  onSelectSelectionKey,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
}: {
  viewportRef?: RefObject<HTMLDivElement>
  width: number
  height?: number
  data: MessageLogTimeStripWindow | null
  hoverPosition: { x: number; y: number } | null
  selectedKey: string | null
  onSelectSelectionKey?: (selectionKey: string) => void
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerCancel?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
}) => {
  const defaultTimeStripHeightPx = DRPD_USB_PD_LOG_CONFIG.stripLayout.totalHeightPx
  const axisHeightPx = DRPD_USB_PD_LOG_CONFIG.stripLayout.axisHeightPx
  const pulseHeightPx = DRPD_USB_PD_LOG_CONFIG.stripLayout.pulseHeightPx
  const defaultAnalogHeightPx = DRPD_USB_PD_LOG_CONFIG.stripLayout.analogHeightPx
  const measuredTimeStripHeightPx = Math.max(
    0,
    typeof height === 'number' && Number.isFinite(height) ? height : 0,
  )
  const timeStripHeightPx = measuredTimeStripHeightPx > 0
    ? measuredTimeStripHeightPx
    : defaultTimeStripHeightPx
  const analogHeightPx = Math.max(
    defaultAnalogHeightPx,
    timeStripHeightPx - axisHeightPx - pulseHeightPx,
  )
  const axisLabelY = AXIS_LABEL_Y_PX
  const plotInsetLeft = PLOT_INSET_X_PX
  const plotInsetRight = PLOT_INSET_X_PX
  const pulseHighY = PULSE_HIGH_Y_PX
  const pulseLowInsetBottom = PULSE_LOW_INSET_BOTTOM_PX
  const pulseAnnotationTop = PULSE_ANNOTATION_TOP_PX
  const pulseAnnotationHeight = PULSE_ANNOTATION_HEIGHT_PX
  const pulseAnnotationFontSize = PULSE_ANNOTATION_FONT_SIZE_PX
  const analogTopInset = ANALOG_TOP_INSET_PX
  const analogBottomInset = ANALOG_BOTTOM_INSET_PX
  const analogPointRadius = ANALOG_POINT_RADIUS_PX
  const analogScaleLabelInset = ANALOG_SCALE_LABEL_INSET_PX
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
        hitAreas: [] as Array<{ key: string; x: number; width: number }>,
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
    const hitAreas = data.pulses.map((pulse) => ({
      key: pulse.selectionKey,
      x: xScale(Number(pulse.startTimestampUs)),
      width: Math.max(
        6,
        xScale(Number(pulse.traceEndTimestampUs)) - xScale(Number(pulse.startTimestampUs)),
      ),
    }))
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
    return { annotations, baselines, highlight, paths, hitAreas, events }
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
    const tooltipLeft = Math.min(Math.max(hoverPosition.x + analogPointRadius * 4, 4), Math.max(width - 110, 4))
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
            {onSelectSelectionKey
              ? pulseGeometry.hitAreas.map((hitArea) => (
                <rect
                  key={`pulse-hit-${hitArea.key}`}
                  x={hitArea.x}
                  y={0}
                  width={hitArea.width}
                  height={pulseHeightPx}
                  fill="transparent"
                  data-selection-key={hitArea.key}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectSelectionKey(hitArea.key)
                  }}
                />
              ))
              : null}
            {onSelectSelectionKey
              ? pulseGeometry.events.map((event) => (
                <rect
                  key={`pulse-event-hit-${event.key}`}
                  x={event.x - 4}
                  y={0}
                  width={8}
                  height={pulseHeightPx}
                  fill="transparent"
                  data-selection-key={event.key}
                  onPointerDown={(pointerEvent) => {
                    pointerEvent.stopPropagation()
                  }}
                  onClick={(mouseEvent) => {
                    mouseEvent.stopPropagation()
                    onSelectSelectionKey(event.key)
                  }}
                />
              ))
              : null}
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
            {onSelectSelectionKey
              ? analogGeometry.events.map((event) => (
                <rect
                  key={`analog-event-hit-${event.key}`}
                  x={event.x - 4}
                  y={0}
                  width={8}
                  height={analogHeightPx}
                  fill="transparent"
                  data-selection-key={event.key}
                  onPointerDown={(pointerEvent) => {
                    pointerEvent.stopPropagation()
                  }}
                  onClick={(mouseEvent) => {
                    mouseEvent.stopPropagation()
                    onSelectSelectionKey(event.key)
                  }}
                />
              ))
              : null}
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
