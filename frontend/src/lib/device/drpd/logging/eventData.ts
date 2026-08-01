import type { LoggedEventDataSection } from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** Validate optional structured event data while preserving section and entry order. */
export const parseLoggedEventData = (
  value: unknown,
  label = 'eventData',
): LoggedEventDataSection[] | null => {
  if (value == null) return null
  if (!Array.isArray(value)) throw new Error(`${label} must be an array or null.`)
  return value.map((section, sectionIndex) => {
    const sectionLabel = `${label}[${sectionIndex}]`
    if (!isRecord(section)) throw new Error(`${sectionLabel} must be an object.`)
    if (typeof section.title !== 'string') throw new Error(`${sectionLabel}.title must be a string.`)
    if (!Array.isArray(section.entries)) throw new Error(`${sectionLabel}.entries must be an array.`)
    return {
      title: section.title,
      entries: section.entries.map((entry, entryIndex) => {
        const entryLabel = `${sectionLabel}.entries[${entryIndex}]`
        if (!isRecord(entry)) throw new Error(`${entryLabel} must be an object.`)
        if (typeof entry.key !== 'string') throw new Error(`${entryLabel}.key must be a string.`)
        if (typeof entry.value !== 'string') throw new Error(`${entryLabel}.value must be a string.`)
        return { key: entry.key, value: entry.value }
      }),
    }
  })
}

/** Parse persisted JSON event data with a field-specific error. */
export const deserializeLoggedEventData = (value: unknown): LoggedEventDataSection[] | null => {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('captured_messages.event_data must be JSON text or null.')
  try {
    return parseLoggedEventData(JSON.parse(value), 'captured_messages.event_data')
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('captured_messages.event_data contains invalid JSON.')
    throw error
  }
}
