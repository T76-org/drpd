import {
  type TimestripTileWorkerRequest,
  type TimestripTileWorkerResponse,
} from './timestripTileProtocol'
import { drawTimestripTile } from './timestripTileDrawing'

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<TimestripTileWorkerRequest>) => void) | null
  postMessage: (message: TimestripTileWorkerResponse, transfer: Transferable[]) => void
}

let reusableCanvas: OffscreenCanvas | null = null

workerScope.onmessage = (event: MessageEvent<TimestripTileWorkerRequest>) => {
  const message = event.data
  if (message.type !== 'renderTile') {
    return
  }

  const width = Math.max(1, Math.ceil(message.tile.widthPx * message.dpr))
  const height = Math.max(1, Math.ceil(message.tile.heightPx * message.dpr))
  if (!reusableCanvas || reusableCanvas.width !== width || reusableCanvas.height !== height) {
    reusableCanvas = new OffscreenCanvas(width, height)
  }
  const context = reusableCanvas.getContext('2d')
  if (!context) {
    return
  }

  drawTimestripTile(
    context,
    message.tile,
    message.dpr,
    message.theme,
    message.digitalEntries,
    message.analogSamples,
    message.worldStartWallClockUs,
    message.selectedMessageKey,
    null,
  )
  const bitmap = reusableCanvas.transferToImageBitmap()
  const response: TimestripTileWorkerResponse = {
    type: 'tileRendered',
    requestId: message.requestId,
    tileKey: message.tile.key,
    tile: message.tile,
    bitmap,
    generation: message.generation,
  }
  workerScope.postMessage(response, [bitmap])
}
