/** Coherent single-ended cable identity results. No response alone proves no fault. */
export const cableTestOutcomes = [
  'DISABLED', 'WAITING', 'DISCOVERING', 'IDENTITY', 'NO_RESPONSE',
  'RESPONSE_TIMEOUT', 'NAK', 'MALFORMED', 'POWER_FAULT', 'UNSUPPORTED_CONNECTION',
] as const
export type CableTestOutcome = typeof cableTestOutcomes[number]
export interface CableTestResult {
  generation: number ///< Firmware insertion/session generation.
  outcome: CableTestOutcome ///< Evidence-based diagnostic state.
  vconnContact: 0 | 1 | 2 ///< VCONN contact; zero means no proven orientation.
  goodCRC: boolean ///< Matching request delivery acknowledgement observed.
  revision: 1 | 2 ///< PD message header revision encoding.
  body: Uint8Array ///< Complete identity response body, including VDM header.
}
/** Parse the atomic snapshot; reject malformed or inconsistent transport data. */
export const parseCableTestResult = (values: string[]): CableTestResult => {
  const [generationText, outcomeText, contactText, crcText, revisionText, bodyText = ''] = values
  const generation = Number(generationText)
  const vconnContact = Number(contactText)
  const revision = Number(revisionText)
  if (values.length < 5 || values.length > 6 || !/^\d+$/.test(generationText ?? '') ||
      !Number.isSafeInteger(generation) || generation < 0 ||
      !cableTestOutcomes.includes(outcomeText as CableTestOutcome) ||
      !['0', '1', '2'].includes(contactText) || !['0', '1'].includes(crcText) ||
      !['1', '2'].includes(revisionText) || !/^(?:[0-9a-fA-F]{2}){0,28}$/.test(bodyText)) {
    throw new Error(`Invalid Cable Test snapshot: ${JSON.stringify(values)}`)
  }
  const body = Uint8Array.from(bodyText.match(/../g) ?? [], (hex) => Number.parseInt(hex, 16))
  if ((outcomeText === 'IDENTITY' && (body.length < 20 || body.length % 4 !== 0 || vconnContact === 0)) ||
      (outcomeText !== 'IDENTITY' && body.length !== 0)) {
    throw new Error('Inconsistent Cable Test identity')
  }
  return { generation, outcome: outcomeText as CableTestOutcome,
    vconnContact: vconnContact as 0 | 1 | 2, goodCRC: crcText === '1',
    revision: revision as 1 | 2, body }
}
