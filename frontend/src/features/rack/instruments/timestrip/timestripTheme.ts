export interface TimestripThemePalette {
  canvasBackground: string
  timeAxisBackground: string
  digitalBackground: string
  analogBackground: string
  tickColor: string
  tickTextColor: string
  messageFillColor: string
  messageStrokeColor: string
  messageTextColor: string
  waveformColor: string
  componentFillColor: string
  byteFillColor: string
  preambleFillColor: string
  sopFillColor: string
  headerFillColor: string
  dataFillColor: string
  crc32FillColor: string
  eventCaptureColor: string
  eventRoleColor: string
  eventStatusColor: string
  eventMarkColor: string
  eventOvpColor: string
  eventOcpColor: string
  voltageTraceColor: string
  currentTraceColor: string
  analogGridColor: string
}

export const DEFAULT_TIMESTRIP_THEME: TimestripThemePalette = {
  canvasBackground: '#10141a',
  timeAxisBackground: '#161d26',
  digitalBackground: '#121821',
  analogBackground: '#10151d',
  tickColor: 'rgba(255, 255, 255, 0.34)',
  tickTextColor: 'rgba(255, 255, 255, 0.82)',
  messageFillColor: 'rgba(5, 186, 250, 0.18)',
  messageStrokeColor: 'rgba(5, 186, 250, 0.72)',
  messageTextColor: 'rgba(255, 255, 255, 0.84)',
  waveformColor: 'rgba(1, 168, 4, 0.88)',
  componentFillColor: 'rgba(255, 255, 255, 0.08)',
  byteFillColor: 'rgba(255, 255, 255, 0.12)',
  preambleFillColor: '#334155',
  sopFillColor: '#0f4a46',
  headerFillColor: '#1d356f',
  dataFillColor: '#4f2e14',
  crc32FillColor: '#5a1830',
  eventCaptureColor: '#F6941F',
  eventRoleColor: '#05BAFA',
  eventStatusColor: '#01A804',
  eventMarkColor: '#d67bff',
  eventOvpColor: '#ff7c5c',
  eventOcpColor: '#f0c04d',
  voltageTraceColor: '#05BAFA',
  currentTraceColor: '#01A804',
  analogGridColor: 'rgba(255, 255, 255, 0.09)',
}

const LIGHT_TIMESTRIP_THEME: TimestripThemePalette = {
  canvasBackground: '#f4f6fa',
  timeAxisBackground: '#eef2f7',
  digitalBackground: '#f8fafc',
  analogBackground: '#f3f6fb',
  tickColor: 'rgba(28, 31, 42, 0.34)',
  tickTextColor: 'rgba(28, 31, 42, 0.82)',
  messageFillColor: 'rgba(26, 115, 232, 0.14)',
  messageStrokeColor: 'rgba(26, 115, 232, 0.62)',
  messageTextColor: 'rgba(28, 31, 42, 0.84)',
  waveformColor: 'rgba(1, 128, 4, 0.82)',
  componentFillColor: 'rgba(28, 31, 42, 0.06)',
  byteFillColor: 'rgba(28, 31, 42, 0.1)',
  preambleFillColor: '#d8e0ea',
  sopFillColor: '#b6dedb',
  headerFillColor: '#bdccf4',
  dataFillColor: '#efd1ad',
  crc32FillColor: '#efb5cb',
  eventCaptureColor: '#F6941F',
  eventRoleColor: '#05BAFA',
  eventStatusColor: '#01A804',
  eventMarkColor: '#d67bff',
  eventOvpColor: '#ff7c5c',
  eventOcpColor: '#f0c04d',
  voltageTraceColor: '#05BAFA',
  currentTraceColor: '#01A804',
  analogGridColor: 'rgba(28, 31, 42, 0.1)',
}

const DARK_TIMESTRIP_THEME = DEFAULT_TIMESTRIP_THEME

export const getTimestripThemePalette = (
  themeName: string | null | undefined,
  computedStyle?: CSSStyleDeclaration,
): TimestripThemePalette => {
  const fallback = themeName === 'light' ? LIGHT_TIMESTRIP_THEME : DARK_TIMESTRIP_THEME
  const readColor = (name: string, value: string) => computedStyle?.getPropertyValue(name).trim() || value
  return {
    ...fallback,
    eventCaptureColor: readColor('--color-log-event-capture', fallback.eventCaptureColor),
    eventRoleColor: readColor('--color-log-event-role', fallback.eventRoleColor),
    eventStatusColor: readColor('--color-log-event-status', fallback.eventStatusColor),
    eventMarkColor: readColor('--color-log-event-mark', fallback.eventMarkColor),
    eventOvpColor: readColor('--color-log-event-ovp', fallback.eventOvpColor),
    eventOcpColor: readColor('--color-log-event-ocp', fallback.eventOcpColor),
    voltageTraceColor: readColor('--color-metric-voltage', fallback.voltageTraceColor),
    currentTraceColor: readColor('--color-metric-current', fallback.currentTraceColor),
    analogGridColor: fallback.analogGridColor,
  }
}

export const getTimestripThemeCacheKey = (palette: TimestripThemePalette): string => (
  [
    palette.canvasBackground,
    palette.timeAxisBackground,
    palette.digitalBackground,
    palette.analogBackground,
    palette.tickColor,
    palette.tickTextColor,
    palette.messageFillColor,
    palette.messageStrokeColor,
    palette.messageTextColor,
    palette.waveformColor,
    palette.componentFillColor,
    palette.byteFillColor,
    palette.preambleFillColor,
    palette.sopFillColor,
    palette.headerFillColor,
    palette.dataFillColor,
    palette.crc32FillColor,
    palette.eventCaptureColor,
    palette.eventRoleColor,
    palette.eventStatusColor,
    palette.eventMarkColor,
    palette.eventOvpColor,
    palette.eventOcpColor,
    palette.voltageTraceColor,
    palette.currentTraceColor,
    palette.analogGridColor,
  ].join('|')
)
