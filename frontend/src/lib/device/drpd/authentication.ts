/** USB Type-C Authentication logical Security body helpers. */

export const AuthenticationMessageType = {
  DIGESTS: 0x01,
  CERTIFICATE: 0x02,
  CHALLENGE_AUTH: 0x03,
  ERROR: 0x7f,
} as const

export type AuthenticationFailureLayer = 'transport' | 'parse' | 'signature' | 'chain' | 'trust' | 'policy'

export class AuthenticationError extends Error {
  public readonly layer: AuthenticationFailureLayer
  public constructor(layer: AuthenticationFailureLayer, message: string) { super(message); this.layer = layer }
}

export interface AuthenticationHeader { version: number; type: number; parameter1: number; parameter2: number }

export const parseAuthenticationHeader = (body: Uint8Array): AuthenticationHeader => {
  if (body.length < 4) throw new AuthenticationError('parse', 'Authentication body must contain a four-byte header')
  if (body[0] !== 0x10 && body[0] !== 0x01) throw new AuthenticationError('parse', `Unsupported authentication protocol version ${body[0]}`)
  return { version: body[0], type: body[1], parameter1: body[2], parameter2: body[3] }
}

export const parseAuthenticationErrorResponse = (body: Uint8Array): { code: number; data: number } => {
  const header = parseAuthenticationHeader(body)
  if (body.length !== 4 || header.type !== AuthenticationMessageType.ERROR) throw new AuthenticationError('parse', 'Authentication ERROR response must contain exactly four bytes')
  return { code: header.parameter1, data: header.parameter2 }
}

export const parseDigestsResponse = (body: Uint8Array): { slotMask: number; digests: ReadonlyMap<number, Uint8Array> } => {
  const header = parseAuthenticationHeader(body)
  if (header.type !== AuthenticationMessageType.DIGESTS || header.parameter1 !== 0x01) throw new AuthenticationError('parse', 'Malformed DIGESTS capabilities')
  const slots = Array.from({ length: 8 }, (_, slot) => slot).filter((slot) => (header.parameter2 & (1 << slot)) !== 0)
  if (body.length !== 4 + slots.length * 32) throw new AuthenticationError('parse', 'DIGESTS length does not match populated slot mask')
  const digests = new Map<number, Uint8Array>()
  slots.forEach((slot, index) => digests.set(slot, body.slice(4 + index * 32, 36 + index * 32)))
  return { slotMask: header.parameter2, digests }
}

export const parseCertificateResponse = (body: Uint8Array, slot: number, offset: number): { slot: number; offset: number; certificatePart: Uint8Array } => {
  const header = parseAuthenticationHeader(body)
  if (header.type !== AuthenticationMessageType.CERTIFICATE || header.parameter1 !== slot || header.parameter2 !== 0) throw new AuthenticationError('parse', 'CERTIFICATE response does not correlate with requested slot')
  if (offset < 0 || offset > 4095 || body.length <= 4 || body.length > 260 || offset + body.length - 4 > 4096) throw new AuthenticationError('parse', 'CERTIFICATE part violates chain bounds or makes no progress')
  return { slot, offset, certificatePart: body.slice(4) }
}

export const parseChallengeAuthResponse = (body: Uint8Array, slot: number): { authenticatedSlot: number; signedResponse: Uint8Array; signatureLittleEndian: Uint8Array } => {
  const header = parseAuthenticationHeader(body)
  if (header.type !== AuthenticationMessageType.CHALLENGE_AUTH || header.parameter1 !== slot) throw new AuthenticationError('parse', 'CHALLENGE_AUTH response does not correlate with requested slot')
  if (body.length !== 168) throw new AuthenticationError('parse', 'CHALLENGE_AUTH response must contain exactly 168 bytes')
  if ((header.parameter2 & (1 << slot)) === 0) throw new AuthenticationError('parse', 'CHALLENGE_AUTH slot mask omits selected slot')
  if (body[4] !== 1 || body[5] !== 1 || body[6] !== 1 || body[7] !== 0) throw new AuthenticationError('parse', 'CHALLENGE_AUTH version, capabilities, or reserved fields are invalid')
  if (body.subarray(72, 104).some((byte) => byte !== 0)) throw new AuthenticationError('parse', 'CHALLENGE_AUTH PD Source context hash must be all zero')
  return { authenticatedSlot: slot, signedResponse: body.slice(0, 104), signatureLittleEndian: body.slice(104) }
}

/** Convert USB Auth little-endian r||s into WebCrypto big-endian P1363 form. */
export const authenticationSignatureToP1363 = (signature: Uint8Array): Uint8Array => {
  if (signature.length !== 64) throw new AuthenticationError('signature', 'ECDSA P-256 signature must contain 64 bytes')
  return new Uint8Array([...signature.slice(0, 32)].reverse().concat([...signature.slice(32)].reverse()))
}

export const verifyChallengeSignature = async (
  publicKey: CryptoKey,
  requestBody: Uint8Array,
  responseBody: Uint8Array,
): Promise<boolean> => {
  if (requestBody.length !== 36) throw new AuthenticationError('parse', 'CHALLENGE request body must contain exactly 36 bytes')
  const parsed = parseChallengeAuthResponse(responseBody, requestBody[2])
  const transcript = new Uint8Array(requestBody.length + parsed.signedResponse.length)
  transcript.set(requestBody); transcript.set(parsed.signedResponse, requestBody.length)
  const signature = new Uint8Array(authenticationSignatureToP1363(parsed.signatureLittleEndian)).buffer as ArrayBuffer
  const signedData = new Uint8Array(transcript).buffer as ArrayBuffer
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, signedData)
}
