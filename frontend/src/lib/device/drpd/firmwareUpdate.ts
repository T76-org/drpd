/**
 * @file firmwareUpdate.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Browser-side UF2 parsing and DRPD firmware-update orchestration.
 */

import type {
  DRPDFirmwareUpdateProgress,
  DRPDFirmwareUpdateRequest,
  DRPDTransport,
} from './transport'

export const DRPD_APPLICATION_FLASH_OFFSET_BYTES = 0x00008000
export const DRPD_APPLICATION_XIP_BASE = 0x10000000 + DRPD_APPLICATION_FLASH_OFFSET_BYTES
export const DRPD_PERSISTENT_CONFIG_FLASH_SIZE_BYTES = 4096
export const DRPD_FLASH_SIZE_BYTES = 4 * 1024 * 1024
export const DRPD_APPLICATION_MAX_LENGTH_BYTES =
  DRPD_FLASH_SIZE_BYTES - DRPD_APPLICATION_FLASH_OFFSET_BYTES - DRPD_PERSISTENT_CONFIG_FLASH_SIZE_BYTES

const UF2_MAGIC_START0 = 0x0a324655
const UF2_MAGIC_START1 = 0x9e5d5157
const UF2_MAGIC_END = 0x0ab16f30
const UF2_BLOCK_SIZE = 512
const UF2_PAYLOAD_OFFSET = 32
const UF2_MAX_PAYLOAD_SIZE = 476
const MAX_UPDATE_CHUNK_BYTES = 256

export interface ParsedFirmwareImage {
  baseOffset: number
  totalLength: number
  crc32: number
  chunks: Array<{ offset: number; data: Uint8Array }>
}

export interface UploadFirmwareOptions {
  onProgress?: (progress: DRPDFirmwareUpdateProgress) => void
}

type Uf2PayloadBlock = {
  offset: number
  data: Uint8Array
}

/**
 * Parse a combined DRPD UF2 and return only application-region write chunks.
 */
export const parseDRPDFirmwareUF2 = (image: ArrayBuffer | Uint8Array): ParsedFirmwareImage => {
  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image)
  if (bytes.byteLength === 0 || bytes.byteLength % UF2_BLOCK_SIZE !== 0) {
    throw new Error('Firmware image is not a valid UF2 file')
  }

  const blocks: Uf2PayloadBlock[] = []
  for (let offset = 0; offset < bytes.byteLength; offset += UF2_BLOCK_SIZE) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, UF2_BLOCK_SIZE)
    if (
      view.getUint32(0, true) !== UF2_MAGIC_START0 ||
      view.getUint32(4, true) !== UF2_MAGIC_START1 ||
      view.getUint32(508, true) !== UF2_MAGIC_END
    ) {
      throw new Error('Firmware image contains an invalid UF2 block')
    }

    const targetAddress = view.getUint32(12, true)
    const payloadSize = view.getUint32(16, true)
    if (payloadSize === 0 || payloadSize > UF2_MAX_PAYLOAD_SIZE) {
      throw new Error('Firmware image contains an invalid UF2 payload size')
    }
    if (targetAddress < DRPD_APPLICATION_XIP_BASE) {
      continue
    }
    if (targetAddress >= 0x10000000 + DRPD_FLASH_SIZE_BYTES) {
      continue
    }
    const appOffset = targetAddress - 0x10000000
    const appEnd = appOffset + payloadSize
    if (
      appOffset < DRPD_APPLICATION_FLASH_OFFSET_BYTES ||
      appEnd > DRPD_APPLICATION_FLASH_OFFSET_BYTES + DRPD_APPLICATION_MAX_LENGTH_BYTES
    ) {
      throw new Error('Firmware image writes outside the DRPD application region')
    }
    blocks.push({
      offset: appOffset,
      data: bytes.slice(offset + UF2_PAYLOAD_OFFSET, offset + UF2_PAYLOAD_OFFSET + payloadSize),
    })
  }

  if (blocks.length === 0) {
    throw new Error('Firmware image does not contain DRPD application-region blocks')
  }

  blocks.sort((a, b) => a.offset - b.offset)
  const merged = mergeContiguousBlocks(blocks)
  const firstOffset = merged[0].offset
  const last = merged[merged.length - 1]
  const totalLength = last.offset + last.data.byteLength - firstOffset
  const imageBytes = new Uint8Array(totalLength)
  imageBytes.fill(0xff)
  for (const block of merged) {
    imageBytes.set(block.data, block.offset - firstOffset)
  }

  return {
    baseOffset: firstOffset,
    totalLength,
    crc32: crc32(imageBytes),
    chunks: merged,
  }
}

export const uploadDRPDFirmwareUF2 = async (
  transport: DRPDTransport,
  image: ArrayBuffer | Uint8Array,
  options: UploadFirmwareOptions = {},
): Promise<void> => {
  if (!transport.updateFirmware) {
    throw new Error('Firmware updates require a WinUSB DRPD transport')
  }
  const parsed = parseDRPDFirmwareUF2(image)
  const request: DRPDFirmwareUpdateRequest = {
    ...parsed,
    onProgress: options.onProgress,
  }
  await transport.updateFirmware(request)
}

const mergeContiguousBlocks = (blocks: Uf2PayloadBlock[]): Uf2PayloadBlock[] => {
  const merged: Uf2PayloadBlock[] = []
  for (const block of blocks) {
    const previous = merged[merged.length - 1]
    if (
      previous &&
      previous.offset + previous.data.byteLength === block.offset &&
      previous.data.byteLength + block.data.byteLength <= MAX_UPDATE_CHUNK_BYTES
    ) {
      const combined = new Uint8Array(previous.data.byteLength + block.data.byteLength)
      combined.set(previous.data, 0)
      combined.set(block.data, previous.data.byteLength)
      previous.data = combined
      continue
    }
    merged.push({ offset: block.offset, data: block.data })
  }
  return merged
}

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) !== 0 ? 0xedb88320 : 0)
    }
  }
  return (~crc) >>> 0
}
