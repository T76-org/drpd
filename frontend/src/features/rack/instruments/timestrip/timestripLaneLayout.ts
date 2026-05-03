export interface TimestripLaneLayout {
  timeAxis: {
    y: number
    height: number
    labelFontPx: number
    tickHeightPx: number
    labelPaddingPx: number
  }
  digital: {
    y: number
    height: number
  }
  analog: {
    y: number
    height: number
  }
  separatorHeightPx: number
}

const TIME_AXIS_HEIGHT_PX = 32
const TICK_LABEL_FONT_PX = 11
const TICK_HEIGHT_PX = 10
const TICK_LABEL_PADDING_PX = 24
const SEPARATOR_HEIGHT_PX = 1
const DIGITAL_LANE_HEIGHT_PX = 86

/**
 * Build fixed-lane timestrip layout in CSS pixels.
 *
 * @param tileHeightPx - Tile height in CSS pixels.
 * @returns Lane layout.
 */
export const buildTimestripLaneLayout = (tileHeightPx: number): TimestripLaneLayout => {
  const minimumHeight = TIME_AXIS_HEIGHT_PX + SEPARATOR_HEIGHT_PX * 2 + DIGITAL_LANE_HEIGHT_PX + 1
  const height = Math.max(minimumHeight, tileHeightPx)
  const digitalHeight = DIGITAL_LANE_HEIGHT_PX
  const analogHeight = Math.max(1, height - TIME_AXIS_HEIGHT_PX - SEPARATOR_HEIGHT_PX * 2 - digitalHeight)
  const digitalY = TIME_AXIS_HEIGHT_PX + SEPARATOR_HEIGHT_PX
  const analogY = digitalY + digitalHeight + SEPARATOR_HEIGHT_PX

  return {
    timeAxis: {
      y: 0,
      height: TIME_AXIS_HEIGHT_PX,
      labelFontPx: TICK_LABEL_FONT_PX,
      tickHeightPx: TICK_HEIGHT_PX,
      labelPaddingPx: TICK_LABEL_PADDING_PX,
    },
    digital: {
      y: digitalY,
      height: digitalHeight,
    },
    analog: {
      y: analogY,
      height: analogHeight,
    },
    separatorHeightPx: SEPARATOR_HEIGHT_PX,
  }
}
