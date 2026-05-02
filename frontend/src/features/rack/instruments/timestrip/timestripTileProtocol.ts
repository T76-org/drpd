import type { TimestripVisibleTile } from './timestripLayout'
import type { TimestripThemePalette } from './timestripTheme'
import type { TimestripDigitalEntry } from './timestripDigitalModel'

export interface TimestripTileRenderRequest {
  type: 'renderTile'
  requestId: number
  tile: TimestripVisibleTile
  dpr: number
  theme: TimestripThemePalette
  digitalEntries: TimestripDigitalEntry[]
  generation: number
}

export interface TimestripTileRenderResponse {
  type: 'tileRendered'
  requestId: number
  tileKey: string
  tile: TimestripVisibleTile
  bitmap: ImageBitmap
  generation: number
}

export type TimestripTileWorkerRequest = TimestripTileRenderRequest
export type TimestripTileWorkerResponse = TimestripTileRenderResponse
