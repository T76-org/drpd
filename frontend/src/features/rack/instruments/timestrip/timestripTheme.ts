export interface TimestripThemePalette {
  canvasBackground: string
  timeAxisBackground: string
  digitalBackground: string
  analogBackground: string
  tickColor: string
  tickTextColor: string
}

export const DEFAULT_TIMESTRIP_THEME: TimestripThemePalette = {
  canvasBackground: '#10141a',
  timeAxisBackground: '#161d26',
  digitalBackground: '#121821',
  analogBackground: '#10151d',
  tickColor: 'rgba(255, 255, 255, 0.34)',
  tickTextColor: 'rgba(255, 255, 255, 0.82)',
}

const LIGHT_TIMESTRIP_THEME: TimestripThemePalette = {
  canvasBackground: '#f4f6fa',
  timeAxisBackground: '#eef2f7',
  digitalBackground: '#f8fafc',
  analogBackground: '#f3f6fb',
  tickColor: 'rgba(28, 31, 42, 0.34)',
  tickTextColor: 'rgba(28, 31, 42, 0.82)',
}

const DARK_TIMESTRIP_THEME = DEFAULT_TIMESTRIP_THEME

export const getTimestripThemePalette = (themeName: string | null | undefined): TimestripThemePalette => (
  themeName === 'light' ? LIGHT_TIMESTRIP_THEME : DARK_TIMESTRIP_THEME
)

export const getTimestripThemeCacheKey = (palette: TimestripThemePalette): string => (
  [
    palette.canvasBackground,
    palette.timeAxisBackground,
    palette.digitalBackground,
    palette.analogBackground,
    palette.tickColor,
    palette.tickTextColor,
  ].join('|')
)
