import { useEffect, useState } from 'react'

export interface RackSizingConfig {
  ///< Inset used to clamp floating menus within the viewport.
  popoverViewportInsetPx: number
  ///< Gap between a trigger element and its floating menu.
  popoverGapPx: number
}

export const DEFAULT_RACK_SIZING: RackSizingConfig = {
  popoverViewportInsetPx: 8,
  popoverGapPx: 4,
}

const readCssLength = (
  styles: CSSStyleDeclaration,
  propertyName: string,
  fallback: number,
): number => {
  const value = styles.getPropertyValue(propertyName).trim()
  if (value.length === 0 || typeof document === 'undefined') {
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
    const parsed = Number.parseFloat(resolved)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  } finally {
    probe.remove()
  }

  const inlineResolved = resolveLengthExpression(value, styles)
  return inlineResolved ?? fallback
}

const resolveLengthExpression = (
  value: string,
  styles: CSSStyleDeclaration,
): number | null => {
  const resolvedValue = resolveCssVariables(value, styles).trim()
  const directParsed = Number.parseFloat(resolvedValue)
  if (Number.isFinite(directParsed) && !resolvedValue.startsWith('calc(')) {
    return directParsed
  }

  const calcMatch = resolvedValue.match(/^calc\(\s*([0-9.]+)px\s*\*\s*([0-9.]+)\s*\)$/)
  if (calcMatch) {
    const [, lengthPx, scale] = calcMatch
    return Number.parseFloat(lengthPx) * Number.parseFloat(scale)
  }

  return null
}

const resolveCssVariables = (
  value: string,
  styles: CSSStyleDeclaration,
): string => {
  return value.replace(/var\((--[a-zA-Z0-9-]+)\)/g, (_match, variableName: string) => {
    const resolved = styles.getPropertyValue(variableName).trim()
    return resolved.length > 0 ? resolved : '0'
  })
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
    popoverViewportInsetPx: readCssLength(
      styles,
      '--rack-popover-viewport-inset-px',
      DEFAULT_RACK_SIZING.popoverViewportInsetPx,
    ),
    popoverGapPx: readCssLength(
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
