import { useEffect, useState } from 'react'

export interface RackSizingConfig {
  ///< Base horizontal width for a single rack unit.
  horizontalUnitPx: number
  ///< Maximum width capacity for a row, expressed in width units.
  maxRowWidthUnits: number
  ///< Base height for a single rack unit.
  unitHeightPx: number
  ///< Width/height ratio used for the rack canvas.
  aspectRatio: number
  ///< Minimum number of units to display when sizing the canvas.
  minDisplayUnits: number
  ///< Minimum viewport height before the rack switches into fit mode.
  minFitViewportHeightPx: number
  ///< Inset used to clamp floating menus within the viewport.
  popoverViewportInsetPx: number
  ///< Gap between a trigger element and its floating menu.
  popoverGapPx: number
}

export const DEFAULT_RACK_SIZING: RackSizingConfig = {
  horizontalUnitPx: 20,
  maxRowWidthUnits: 60,
  unitHeightPx: 100,
  aspectRatio: 16 / 10,
  minDisplayUnits: 6,
  minFitViewportHeightPx: 400,
  popoverViewportInsetPx: 8,
  popoverGapPx: 4,
}

const readCssNumber = (
  styles: CSSStyleDeclaration,
  propertyName: string,
  fallback: number,
): number => {
  const value = styles.getPropertyValue(propertyName).trim()
  if (value.length === 0) {
    return fallback
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Read the resolved rack sizing tokens from CSS custom properties.
 *
 * @returns Rack sizing config derived from the active stylesheet.
 */
export const getRackSizingConfig = (): RackSizingConfig => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return DEFAULT_RACK_SIZING
  }
  const styles = window.getComputedStyle(document.documentElement)
  return {
    horizontalUnitPx: readCssNumber(
      styles,
      '--rack-horizontal-unit-px',
      DEFAULT_RACK_SIZING.horizontalUnitPx,
    ),
    maxRowWidthUnits: readCssNumber(
      styles,
      '--rack-max-row-width-units',
      DEFAULT_RACK_SIZING.maxRowWidthUnits,
    ),
    unitHeightPx: readCssNumber(
      styles,
      '--rack-unit-height-px',
      DEFAULT_RACK_SIZING.unitHeightPx,
    ),
    aspectRatio: readCssNumber(
      styles,
      '--rack-canvas-aspect-ratio',
      DEFAULT_RACK_SIZING.aspectRatio,
    ),
    minDisplayUnits: readCssNumber(
      styles,
      '--rack-min-display-units',
      DEFAULT_RACK_SIZING.minDisplayUnits,
    ),
    minFitViewportHeightPx: readCssNumber(
      styles,
      '--rack-fit-min-viewport-height-px',
      DEFAULT_RACK_SIZING.minFitViewportHeightPx,
    ),
    popoverViewportInsetPx: readCssNumber(
      styles,
      '--rack-popover-viewport-inset-px',
      DEFAULT_RACK_SIZING.popoverViewportInsetPx,
    ),
    popoverGapPx: readCssNumber(
      styles,
      '--rack-popover-gap-px',
      DEFAULT_RACK_SIZING.popoverGapPx,
    ),
  }
}

/**
 * Track rack sizing tokens and refresh them when the viewport changes.
 *
 * @returns Current rack sizing config.
 */
export const useRackSizingConfig = (): RackSizingConfig => {
  const [config, setConfig] = useState<RackSizingConfig>(() => getRackSizingConfig())

  useEffect(() => {
    const updateConfig = () => {
      setConfig(getRackSizingConfig())
    }

    updateConfig()
    window.addEventListener('resize', updateConfig)
    return () => {
      window.removeEventListener('resize', updateConfig)
    }
  }, [])

  return config
}
