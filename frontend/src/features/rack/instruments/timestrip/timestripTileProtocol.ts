import type { TimestripVisibleTile } from './timestripLayout'
import type { TimestripThemePalette } from './timestripTheme'

export interface TimestripTileRenderRequest {
  type: 'renderTile'
  requestId: number
  tile: TimestripVisibleTile
  dpr: number
  theme: TimestripThemePalette
}

export interface TimestripTileRenderResponse {
  type: 'tileRendered'
  requestId: number
  tileKey: string
  tile: TimestripVisibleTile
  bitmap: ImageBitmap
}

export type TimestripTileWorkerRequest = TimestripTileRenderRequest
export type TimestripTileWorkerResponse = TimestripTileRenderResponse
