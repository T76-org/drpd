import type { TimestripAnalogSample } from './timestripAnalogModel'
import type { TimestripDigitalEntry } from './timestripDigitalModel'

const getDigitalStartWorldNs = (entry: TimestripDigitalEntry): number =>
  entry.kind === 'event' ? entry.worldNs : entry.startWorldNs

const getDigitalEndWorldNs = (entry: TimestripDigitalEntry): number =>
  entry.kind === 'event' ? entry.worldNs : entry.endWorldNs

const lowerBound = <T>(
  values: T[],
  target: number,
  readValue: (value: T) => number,
): number => {
  let low = 0
  let high = values.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (readValue(values[mid]) < target) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

const upperBound = <T>(
  values: T[],
  target: number,
  readValue: (value: T) => number,
): number => {
  let low = 0
  let high = values.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (readValue(values[mid]) <= target) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

/**
 * Binary-search index for slicing current timestrip data into tile-local rows.
 */
export class TimestripTileDataIndex {
  protected readonly digitalByEnd: TimestripDigitalEntry[]
  protected readonly analogSamples: TimestripAnalogSample[]

  public constructor(
    digitalEntries: TimestripDigitalEntry[] = [],
    analogSamples: TimestripAnalogSample[] = [],
  ) {
    this.digitalByEnd = [...digitalEntries].sort((left, right) => (
      getDigitalEndWorldNs(left) - getDigitalEndWorldNs(right) ||
      getDigitalStartWorldNs(left) - getDigitalStartWorldNs(right)
    ))
    this.analogSamples = [...analogSamples].sort((left, right) => left.worldNs - right.worldNs)
  }

  public getDigitalEntriesForTile(tileLeftNs: number, tileRightNs: number): TimestripDigitalEntry[] {
    const startIndex = lowerBound(this.digitalByEnd, tileLeftNs, getDigitalEndWorldNs)
    const result: TimestripDigitalEntry[] = []
    for (let index = startIndex; index < this.digitalByEnd.length; index += 1) {
      const entry = this.digitalByEnd[index]
      const startWorldNs = getDigitalStartWorldNs(entry)
      if (startWorldNs > tileRightNs) {
        continue
      }
      result.push(entry)
    }
    return result.sort((left, right) => getDigitalStartWorldNs(left) - getDigitalStartWorldNs(right))
  }

  public getAnalogSamplesForTile(tileLeftNs: number, tileRightNs: number): TimestripAnalogSample[] {
    if (this.analogSamples.length === 0) {
      return []
    }
    const firstVisibleIndex = lowerBound(this.analogSamples, tileLeftNs, (sample) => sample.worldNs)
    const afterVisibleIndex = upperBound(this.analogSamples, tileRightNs, (sample) => sample.worldNs)
    const sliceStart = Math.max(0, firstVisibleIndex - 1)
    const sliceEnd = Math.min(this.analogSamples.length, afterVisibleIndex + 1)
    return this.analogSamples.slice(sliceStart, sliceEnd)
  }
}
