import type { TimestripVisibleTile } from './timestripLayout'

export interface TimestripTileRenderRequest {
  type: 'renderTile'
  requestId: number
  tile: TimestripVisibleTile
  dpr: number
  worldStartWallClockUs: number
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
