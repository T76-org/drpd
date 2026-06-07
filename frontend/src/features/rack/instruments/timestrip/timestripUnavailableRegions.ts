export interface TimestripUnavailableRegion {
  startWorldNs: number
  endWorldNs: number
}

export const mergeTimestripUnavailableRegions = (
  regions: TimestripUnavailableRegion[],
): TimestripUnavailableRegion[] => {
  const sortedRegions = regions
    .filter((region) => (
      Number.isFinite(region.startWorldNs) &&
      Number.isFinite(region.endWorldNs) &&
      region.endWorldNs > region.startWorldNs
    ))
    .sort((left, right) => left.startWorldNs - right.startWorldNs)
  const merged: TimestripUnavailableRegion[] = []
  for (const region of sortedRegions) {
    const previous = merged.at(-1)
    if (!previous || region.startWorldNs > previous.endWorldNs) {
      merged.push({ ...region })
      continue
    }
    previous.endWorldNs = Math.max(previous.endWorldNs, region.endWorldNs)
  }
  return merged
}
