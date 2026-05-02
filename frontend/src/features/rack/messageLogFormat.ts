/**
 * Format one wall-clock label.
 *
 * @param wallClockUs - Host timestamp.
 * @returns Formatted label.
 */
export const formatWallClock = (wallClockUs: bigint | null): string => {
  if (wallClockUs === null) {
    return '--'
  }
  const epochMs = wallClockUs / 1000n
  const microseconds = wallClockUs % 1000n
  const date = new Date(Number(epochMs))
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const millisecondsPart = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${millisecondsPart}${microseconds.toString().padStart(3, '0')}`
}
