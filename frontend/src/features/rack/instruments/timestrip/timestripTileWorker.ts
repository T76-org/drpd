import {
  type TimestripTileWorkerRequest,
  type TimestripTileWorkerResponse,
} from './timestripTileProtocol'
import { drawTimestripTile } from './timestripTileDrawing'

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<TimestripTileWorkerRequest>) => void) | null
  postMessage: (message: TimestripTileWorkerResponse, transfer: Transferable[]) => void
}

workerScope.onmessage = (event: MessageEvent<TimestripTileWorkerRequest>) => {
  const message = event.data
  if (message.type !== 'renderTile') {
    return
  }

  const width = Math.max(1, Math.ceil((message.tile.widthPx + message.tile.bleedPx * 2) * message.dpr))
  const height = Math.max(1, Math.ceil(message.tile.heightPx * message.dpr))
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  drawTimestripTile(context, message.tile, message.dpr, message.worldStartWallClockUs)
  const bitmap = canvas.transferToImageBitmap()
  const response: TimestripTileWorkerResponse = {
    type: 'tileRendered',
    requestId: message.requestId,
    tileKey: message.tile.key,
    tile: message.tile,
    bitmap,
  }
  workerScope.postMessage(response, [bitmap])
}
