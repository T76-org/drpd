import { line, scaleLinear } from 'd3'
import { useEffect, useMemo, useRef, type PointerEventHandler, type WheelEventHandler } from 'react'
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

/**
 * Render-only time-strip view.
 */
export const DrpdUsbPdLogTimeStripRenderer = ({
  width,
  data,
  selectedKey,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onWheel,
}: {
  width: number
  data: MessageLogTimeStripWindow | null
  selectedKey: string | null
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerCancel?: PointerEventHandler<HTMLDivElement>
  onWheel?: WheelEventHandler<HTMLDivElement>
}) => {
  const pulseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const analogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const selectedPulse = useMemo(
    () => findSelectedPulseSegment(data?.pulses ?? [], selectedKey),
    [data?.pulses, selectedKey],
  )
  const xScale = useMemo(() => {
    const domainStart = Number(data?.windowStartUs ?? 0n)
    const domainEnd = Number(data?.windowEndUs ?? 1n)
    return scaleLinear()
      .domain([domainStart, domainEnd > domainStart ? domainEnd : domainStart + 1])
      .range([0, Math.max(width, 1)])
  }, [data?.windowEndUs, data?.windowStartUs, width])
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

  useEffect(() => {
    const canvas = pulseCanvasRef.current
    if (!canvas || !data) {
      return
    }
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(width * ratio))
    canvas.height = Math.max(1, Math.floor(PULSE_HEIGHT_PX * ratio))
    canvas.style.width = `${Math.max(width, 1)}px`
    canvas.style.height = `${PULSE_HEIGHT_PX}px`
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, Math.max(width, 1), PULSE_HEIGHT_PX)

    const lowY = PULSE_HEIGHT_PX - DRPD_USB_PD_LOG_CONFIG.stripPulse.lowInsetBottomPx
    const highY = DRPD_USB_PD_LOG_CONFIG.stripPulse.highYpx
    context.strokeStyle = DRPD_USB_PD_LOG_CONFIG.stripPulse.strokeColor
    context.lineWidth = DRPD_USB_PD_LOG_CONFIG.stripPulse.strokeWidthPx

    if (selectedPulse) {
      const left = xScale(Number(selectedPulse.startTimestampUs))
      const right = xScale(Number(selectedPulse.endTimestampUs))
      context.fillStyle = DRPD_USB_PD_LOG_CONFIG.stripPulse.highlightFill
      context.fillRect(left, 0, Math.max(1, right - left), PULSE_HEIGHT_PX)
    }

    for (const pulse of data.pulses) {
      let timestampUs = Number(pulse.startTimestampUs)
      let stateHigh = false
      context.beginPath()
      context.moveTo(xScale(timestampUs), lowY)
      for (const widthNs of pulse.pulseWidthsNs) {
        const durationUs = widthNs / 1_000
        timestampUs += durationUs
        const x = xScale(timestampUs)
        const y = stateHigh ? highY : lowY
        context.lineTo(x, y)
        stateHigh = !stateHigh
        context.lineTo(x, stateHigh ? highY : lowY)
      }
      const pulseEndX = xScale(Number(pulse.endTimestampUs))
      context.lineTo(pulseEndX, stateHigh ? highY : lowY)
      if (stateHigh) {
        context.lineTo(pulseEndX, lowY)
      }
      context.stroke()
    }
  }, [data, selectedPulse, width, xScale])

  useEffect(() => {
    const canvas = analogCanvasRef.current
    if (!canvas || !data) {
      return
    }
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(width * ratio))
    canvas.height = Math.max(1, Math.floor(ANALOG_HEIGHT_PX * ratio))
    canvas.style.width = `${Math.max(width, 1)}px`
    canvas.style.height = `${ANALOG_HEIGHT_PX}px`
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, Math.max(width, 1), ANALOG_HEIGHT_PX)

    const voltageScale = scaleLinear()
      .domain([0, DRPD_USB_PD_LOG_CONFIG.stripAnalog.voltageMax])
      .range([
        ANALOG_HEIGHT_PX - DRPD_USB_PD_LOG_CONFIG.stripAnalog.bottomInsetPx,
        DRPD_USB_PD_LOG_CONFIG.stripAnalog.topInsetPx,
      ])
    const currentScale = scaleLinear()
      .domain([0, DRPD_USB_PD_LOG_CONFIG.stripAnalog.currentMax])
      .range([
        ANALOG_HEIGHT_PX - DRPD_USB_PD_LOG_CONFIG.stripAnalog.bottomInsetPx,
        DRPD_USB_PD_LOG_CONFIG.stripAnalog.topInsetPx,
      ])

    context.strokeStyle = DRPD_USB_PD_LOG_CONFIG.stripAnalog.gridStroke
    context.lineWidth = DRPD_USB_PD_LOG_CONFIG.stripAnalog.gridStrokeWidthPx
    for (const mark of DRPD_USB_PD_LOG_CONFIG.stripAnalog.gridMarks) {
      const y = voltageScale(mark)
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(Math.max(width, 1), y)
      context.stroke()
    }

    if (selectedPulse) {
      const left = xScale(Number(selectedPulse.startTimestampUs))
      const right = xScale(Number(selectedPulse.endTimestampUs))
      context.fillStyle = DRPD_USB_PD_LOG_CONFIG.stripAnalog.selectionFill
      context.fillRect(left, 0, Math.max(1, right - left), ANALOG_HEIGHT_PX)
    }

    const voltageLine = line<(typeof data.analogPoints)[number]>()
      .x((point) => xScale(Number(point.timestampUs)))
      .y((point) => voltageScale(point.vbusV))
      .context(context)
    const currentLine = line<(typeof data.analogPoints)[number]>()
      .x((point) => xScale(Number(point.timestampUs)))
      .y((point) => currentScale(point.ibusA))
      .context(context)

    context.lineWidth = DRPD_USB_PD_LOG_CONFIG.stripAnalog.traceStrokeWidthPx
    context.strokeStyle = DRPD_USB_PD_LOG_CONFIG.stripAnalog.voltageStroke
    context.beginPath()
    voltageLine(data.analogPoints)
    context.stroke()
    context.fillStyle = DRPD_USB_PD_LOG_CONFIG.stripAnalog.voltageStroke
    for (const point of data.analogPoints) {
      context.beginPath()
      context.arc(
        xScale(Number(point.timestampUs)),
        voltageScale(point.vbusV),
        DRPD_USB_PD_LOG_CONFIG.stripAnalog.pointRadiusPx,
        0,
        Math.PI * 2,
      )
      context.fill()
    }

    context.strokeStyle = DRPD_USB_PD_LOG_CONFIG.stripAnalog.currentStroke
    context.beginPath()
    currentLine(data.analogPoints)
    context.stroke()
    context.fillStyle = DRPD_USB_PD_LOG_CONFIG.stripAnalog.currentStroke
    for (const point of data.analogPoints) {
      context.beginPath()
      context.arc(
        xScale(Number(point.timestampUs)),
        currentScale(point.ibusA),
        DRPD_USB_PD_LOG_CONFIG.stripAnalog.pointRadiusPx,
        0,
        Math.PI * 2,
      )
      context.fill()
    }
  }, [data, selectedPulse, width, xScale])

  return (
    <div
      className={styles.timeStripViewport}
      style={{ height: `${TIME_STRIP_HEIGHT_PX}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
      data-testid="drpd-usbpd-log-timestrip"
    >
      <div className={styles.axisLane} style={{ height: `${AXIS_HEIGHT_PX}px` }}>
        <svg className={styles.axisSvg} width={Math.max(width, 1)} height={AXIS_HEIGHT_PX}>
          {ticks.map((tick, index) => (
            <g key={`${tick.x}-${index}`} transform={`translate(${tick.x},0)`}>
              <line className={styles.axisTick} y1={0} y2={AXIS_HEIGHT_PX} />
              <text
                className={styles.axisDeviceLabel}
                y={DRPD_USB_PD_LOG_CONFIG.stripAxis.labelYpx}
                textAnchor="middle"
              >
                {tick.deviceLabel}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className={styles.pulseLane} style={{ height: `${PULSE_HEIGHT_PX}px` }}>
        <canvas ref={pulseCanvasRef} />
      </div>
      <div className={styles.analogLane} style={{ height: `${ANALOG_HEIGHT_PX}px` }}>
        <canvas ref={analogCanvasRef} />
      </div>
    </div>
  )
}
