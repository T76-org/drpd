/**
 * @file serialization.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Serialization helpers for worker messaging.
 */

import type { SerializedWorkerError } from './protocol'

/**
 * Convert an unknown error into a structured-clone-safe payload.
 *
 * @param error - Unknown thrown value.
 * @returns Serialized error object.
 */
export const serializeWorkerError = (error: unknown): SerializedWorkerError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    name: 'Error',
    message: String(error),
  }
}

/**
 * Convert a serialized worker error into an Error instance.
 *
 * @param error - Serialized worker error.
 * @returns Error instance for local rejection paths.
 */
export const deserializeWorkerError = (error: SerializedWorkerError): Error => {
  const instance = new Error(error.message)
  instance.name = error.name
  if (error.stack) {
    instance.stack = error.stack
  }
  return instance
}

