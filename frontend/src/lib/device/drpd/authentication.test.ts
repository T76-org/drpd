import { describe, expect, it } from 'vitest'
import { AuthenticationError, authenticationSignatureToP1363, parseAuthenticationErrorResponse, parseCertificateResponse, parseChallengeAuthResponse, parseDigestsResponse } from './authentication'

describe('authentication logical body helpers', () => {
  it('correlates populated DIGESTS slots in wire order', () => {
    const body = new Uint8Array(68); body.set([0x10, 1, 1, 0b1001]); body.fill(0x11, 4, 36); body.fill(0x33, 36)
    const parsed = parseDigestsResponse(body)
    expect([...parsed.digests.keys()]).toEqual([0, 3])
    expect(parsed.digests.get(3)?.[0]).toBe(0x33)
  })

  it('accepts canonical V1.0 and legacy alias but parses ERROR as exactly four bytes', () => {
    expect(parseAuthenticationErrorResponse(new Uint8Array([0x10, 0x7f, 5, 9]))).toEqual({ code: 5, data: 9 })
    expect(parseAuthenticationErrorResponse(new Uint8Array([0x01, 0x7f, 5, 9]))).toEqual({ code: 5, data: 9 })
    expect(() => parseAuthenticationErrorResponse(new Uint8Array([0x10, 0x7f, 5, 9, 0]))).toThrow('exactly four')
  })

  it('rejects malformed digest lengths and certificate no-progress/overflow', () => {
    expect(() => parseDigestsResponse(new Uint8Array([1, 1, 1, 1]))).toThrow(AuthenticationError)
    expect(() => parseCertificateResponse(new Uint8Array([1, 2, 1, 0]), 1, 0)).toThrow('makes no progress')
    const overflow = new Uint8Array(10); overflow.set([1, 2, 1, 0])
    expect(() => parseCertificateResponse(overflow, 1, 4095)).toThrow()
  })

  it('uses the first 104 response bytes and converts little-endian r and s independently', () => {
    const body = new Uint8Array(168); body.set([0x10, 3, 2, 4, 1, 1, 1, 0])
    expect(parseChallengeAuthResponse(body, 2).signatureLittleEndian).toHaveLength(64)
    const signature = new Uint8Array(64); signature[0] = 1; signature[32] = 2
    const converted = authenticationSignatureToP1363(signature)
    expect(converted[31]).toBe(1); expect(converted[63]).toBe(2)
  })
})
