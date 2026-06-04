import '@testing-library/jest-dom'

const buildCanvasContext = (): CanvasRenderingContext2D => ({
  canvas: document.createElement('canvas'),
  clearRect: () => undefined,
  drawImage: () => undefined,
  fillRect: () => undefined,
  fillText: () => undefined,
  measureText: (text: string) => ({ width: text.length * 6 }) as TextMetrics,
  restore: () => undefined,
  save: () => undefined,
  scale: () => undefined,
  setTransform: () => undefined,
  stroke: () => undefined,
  strokeRect: () => undefined,
  strokeText: () => undefined,
  translate: () => undefined,
}) as unknown as CanvasRenderingContext2D

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value(contextId: string) {
    return contextId === '2d' ? buildCanvasContext() : null
  },
})
