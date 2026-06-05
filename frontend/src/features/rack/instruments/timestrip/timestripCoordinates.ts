export type TimestripBasis = {
  kind: 'wallClock' | 'device'
  originTimestampUs: bigint
  originWallClockUs: number
}

export type TimestripTimelineRange = {
  basis: TimestripBasis
  durationNs: bigint
  hasLogRange: boolean
}

export type TimestripWorldRange = {
  startWorldNs: number
  endWorldNs: number
}

export type TimestripQueryRange = {
  startTimestampUs: bigint
  endTimestampUs: bigint
  timeBasis: 'wallClock' | 'device'
}

const MIN_TIMESTRIP_ZOOM_DENOMINATOR = 500
const MAX_TIMESTRIP_ZOOM_DENOMINATOR = 100_000_000

const clampCoordinateZoomDenominator = (value: number): number => {
  if (!Number.isFinite(value)) {
    return MAX_TIMESTRIP_ZOOM_DENOMINATOR
  }
  return Math.min(
    MAX_TIMESTRIP_ZOOM_DENOMINATOR,
    Math.max(MIN_TIMESTRIP_ZOOM_DENOMINATOR, Math.trunc(value)),
  )
}

export const getTimestripBasisOriginUs = (basis: TimestripBasis): bigint =>
  basis.kind === 'wallClock'
    ? BigInt(Math.floor(basis.originWallClockUs))
    : basis.originTimestampUs

export const getTimestripBasisTimestampUs = (
  timestampUs: bigint,
  wallClockUs: bigint | null,
  basis: TimestripBasis,
): bigint | null => {
  if (basis.kind === 'device') {
    return timestampUs
  }
  return wallClockUs
}

export const basisTimestampUsToWorldNs = (
  timestampUs: bigint,
  basis: TimestripBasis,
): number => Number((timestampUs - getTimestripBasisOriginUs(basis)) * 1000n)

export const rowTimestampUsToWorldNs = (
  timestampUs: bigint,
  wallClockUs: bigint | null,
  basis: TimestripBasis,
): number | null => {
  const basisTimestampUs = getTimestripBasisTimestampUs(timestampUs, wallClockUs, basis)
  return basisTimestampUs === null ? null : basisTimestampUsToWorldNs(basisTimestampUs, basis)
}

export const scrollLeftPxToWorldNs = (
  scrollLeftPx: number,
  zoomDenominator: number,
): number => Math.max(0, scrollLeftPx) * clampCoordinateZoomDenominator(zoomDenominator)

export const worldNsToPx = (
  worldNs: number,
  zoomDenominator: number,
): number => worldNs / clampCoordinateZoomDenominator(zoomDenominator)

export const pxToWorldNs = (
  px: number,
  zoomDenominator: number,
): number => Math.max(0, px) * clampCoordinateZoomDenominator(zoomDenominator)

export const calculateTimestripQueryRange = (
  scrollLeftPx: number,
  viewportWidthPx: number,
  zoomDenominator: number,
  basis: TimestripBasis,
  overscanPx: number,
): TimestripQueryRange => {
  const normalizedZoom = clampCoordinateZoomDenominator(zoomDenominator)
  const startWorldNs = Math.max(0, Math.floor((scrollLeftPx - overscanPx) * normalizedZoom))
  const endWorldNs = Math.max(
    startWorldNs,
    Math.ceil((scrollLeftPx + viewportWidthPx + overscanPx) * normalizedZoom),
  )
  const originUs = getTimestripBasisOriginUs(basis)
  return {
    startTimestampUs: originUs + BigInt(Math.floor(startWorldNs / 1000)),
    endTimestampUs: originUs + BigInt(Math.ceil(endWorldNs / 1000)),
    timeBasis: basis.kind,
  }
}

export const calculatePointerStableZoom = ({
  currentScrollLeftPx,
  pointerX,
  currentZoomDenominator,
  nextZoomDenominator,
}: {
  currentScrollLeftPx: number
  pointerX: number
  currentZoomDenominator: number
  nextZoomDenominator: number
}): number => {
  const timestampUnderPointerNs = pxToWorldNs(currentScrollLeftPx + pointerX, currentZoomDenominator)
  return Math.max(0, worldNsToPx(timestampUnderPointerNs, nextZoomDenominator) - pointerX)
}
