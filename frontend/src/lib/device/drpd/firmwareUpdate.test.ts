import { describe, expect, it } from 'vitest'

import {
  DRPD_APPLICATION_XIP_BASE,
  parseDRPDFirmwareUF2,
} from './firmwareUpdate'

const UF2_BLOCK_SIZE = 512
const UF2_MAGIC_START0 = 0x0a324655
const UF2_MAGIC_START1 = 0x9e5d5157
const UF2_MAGIC_END = 0x0ab16f30

const makeBlock = (targetAddress: number, payload: Uint8Array, blockNo: number, numBlocks: number): Uint8Array => {
  const block = new Uint8Array(UF2_BLOCK_SIZE)
  const view = new DataView(block.buffer)
  view.setUint32(0, UF2_MAGIC_START0, true)
  view.setUint32(4, UF2_MAGIC_START1, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, targetAddress, true)
  view.setUint32(16, payload.byteLength, true)
  view.setUint32(20, blockNo, true)
  view.setUint32(24, numBlocks, true)
  view.setUint32(28, 0, true)
  block.set(payload, 32)
  view.setUint32(508, UF2_MAGIC_END, true)
  return block
}

const concatBlocks = (...blocks: Uint8Array[]): Uint8Array => {
  const image = new Uint8Array(blocks.length * UF2_BLOCK_SIZE)
  blocks.forEach((block, index) => image.set(block, index * UF2_BLOCK_SIZE))
  return image
}

describe('parseDRPDFirmwareUF2', () => {
  it('filters bootloader blocks and keeps only app-region payloads', () => {
    const image = concatBlocks(
      makeBlock(0x10000000, new Uint8Array([0xaa, 0xbb]), 0, 3),
      makeBlock(DRPD_APPLICATION_XIP_BASE, new Uint8Array([1, 2, 3]), 1, 3),
      makeBlock(DRPD_APPLICATION_XIP_BASE + 3, new Uint8Array([4, 5]), 2, 3),
      makeBlock(0x10ffff00, new Uint8Array([0xcc, 0xdd]), 3, 4),
    )

    const parsed = parseDRPDFirmwareUF2(image)

    expect(parsed.baseOffset).toBe(0x8000)
    expect(parsed.totalLength).toBe(5)
    expect(parsed.chunks).toEqual([
      { offset: 0x8000, data: new Uint8Array([1, 2, 3, 4, 5]) },
    ])
    expect(parsed.crc32).toBe(0x470b99f4)
  })

  it('rejects UF2 files with no application-region blocks', () => {
    const image = concatBlocks(
      makeBlock(0x10000000, new Uint8Array([0xaa, 0xbb]), 0, 1),
    )

    expect(() => parseDRPDFirmwareUF2(image)).toThrow(
      'Firmware image does not contain DRPD application-region blocks',
    )
  })
})
