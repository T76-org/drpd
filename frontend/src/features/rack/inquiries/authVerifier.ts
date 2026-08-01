import 'reflect-metadata'
import { BasicConstraintsExtension, ExtendedKeyUsageExtension, KeyUsageFlags, KeyUsagesExtension, X509Certificate } from '@peculiar/x509'
import { verifyChallengeSignature } from '../../../lib/device/drpd/authentication'
import type { AuthenticationVerification } from './authWorkflow'

const USB_AUTH_EKU = '2.23.145.1.1'
const USB_AUTH_ACD = '2.23.145.1.2'
const BASIC_CONSTRAINTS = '2.5.29.19'
const KEY_USAGE = '2.5.29.15'
const EXTENDED_KEY_USAGE = '2.5.29.37'
const KNOWN_CRITICAL = new Set([BASIC_CONSTRAINTS, KEY_USAGE, EXTENDED_KEY_USAGE, USB_AUTH_ACD])

export interface AuthenticationTrustAnchor {
  id: string
  rootCertificateDer: Uint8Array
  allowedSlots: readonly number[]
  disabled?: boolean
}

export interface AuthenticationVerifierPolicy {
  id: string
  anchors: readonly AuthenticationTrustAnchor[]
  deniedCertificateSha256?: readonly string[]
}

const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, index) => byte === b[index])
const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
const arrayBuffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer
const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest('SHA-256', arrayBuffer(bytes)))

const derObjectLength = (bytes: Uint8Array, offset: number): number => {
  if (bytes[offset] !== 0x30 || offset + 2 > bytes.length) throw new Error('Certificate is not a DER SEQUENCE')
  const first = bytes[offset + 1]
  if ((first & 0x80) === 0) return 2 + first
  const count = first & 0x7f
  if (count < 1 || count > 4 || offset + 2 + count > bytes.length || bytes[offset + 2] === 0) throw new Error('Certificate has non-canonical DER length')
  let content = 0
  for (let index = 0; index < count; index += 1) content = content * 256 + bytes[offset + 2 + index]
  if (content < 128) throw new Error('Certificate has non-canonical DER length')
  return 2 + count + content
}

export const splitUsbCertificateChain = (chain: Uint8Array): { rootHash: Uint8Array; certificates: X509Certificate[] } => {
  if (chain.length < 37 || chain.length > 4096 || (chain[0] | (chain[1] << 8)) !== chain.length || chain[2] !== 0 || chain[3] !== 0) throw new Error('Certificate chain header or length is invalid')
  const certificates: X509Certificate[] = []
  for (let offset = 36; offset < chain.length;) {
    const length = derObjectLength(chain, offset)
    if (offset + length > chain.length) throw new Error('Certificate extends past chain length')
    certificates.push(new X509Certificate(arrayBuffer(chain.slice(offset, offset + length))))
    offset += length
  }
  if (certificates.length === 0) throw new Error('Certificate chain has no leaf certificate')
  return { rootHash: chain.slice(4, 36), certificates }
}

interface UsbCertificateIdentity { vid?: string; pid?: string }

const validateProfile = (certificate: X509Certificate, leaf: boolean, root = false): UsbCertificateIdentity => {
  if (certificate.rawData.byteLength > (leaf ? 640 : 512)) throw new Error(`${leaf ? 'Leaf' : 'Intermediate'} certificate exceeds USB profile size`)
  if (certificate.signatureAlgorithm.name !== 'ECDSA' || certificate.signatureAlgorithm.hash?.name !== 'SHA-256') throw new Error('Certificate signature algorithm is not ECDSA with SHA-256')
  if (certificate.publicKey.algorithm.name !== 'ECDSA' || !('namedCurve' in certificate.publicKey.algorithm) || certificate.publicKey.algorithm.namedCurve !== 'P-256') throw new Error('Certificate public key is not uncompressed NIST P-256')
  const basic = certificate.getExtension(BasicConstraintsExtension)
  if (!basic?.critical || basic.ca === leaf || basic.pathLength !== undefined) throw new Error('Basic Constraints violate USB profile')
  const usage = certificate.getExtension(KeyUsagesExtension)
  const expected = leaf ? KeyUsageFlags.digitalSignature : KeyUsageFlags.keyCertSign
  const allowed = leaf ? expected : expected | KeyUsageFlags.cRLSign
  if (!usage || (usage.usages & expected) === 0 || (usage.usages & ~allowed) !== 0) throw new Error('Key Usage violates USB profile')
  const eku = certificate.getExtension(ExtendedKeyUsageExtension)
  if (!eku?.critical || !eku.usages.includes(USB_AUTH_EKU)) throw new Error('Critical USB-Auth Extended Key Usage is missing')
  const acd = certificate.getExtension(USB_AUTH_ACD)
  if ((leaf && !acd) || (!leaf && acd)) throw new Error('USB-IF ACD placement violates USB profile')
  if (certificate.extensions.some((extension) => extension.critical && !KNOWN_CRITICAL.has(extension.type))) throw new Error('Certificate contains an unknown critical extension')
  const commonName = certificate.subject.match(/(?:^|,\s*)CN=([^,]+)/)?.[1]
  if (!commonName || !(leaf ? /^USB:[0-9a-f]{4}:[0-9a-f]{4}$/ : /^USB:(?:(?:[0-9a-f]{4})?:?)$/).test(commonName)) throw new Error('Certificate common name violates USB VID/PID profile')
  if (root && !/(?:^|,\s*)O=[^,]+/.test(certificate.subject)) throw new Error('Root certificate organization name is missing')
  const [, vid, pid] = /^USB:(?:([0-9a-f]{4})?)?:(?:([0-9a-f]{4}))?$/.exec(commonName) ?? []
  return { vid: vid || undefined, pid: pid || undefined }
}

export const verifyUsbAuthentication = async (input: {
  slot: number
  digest: Uint8Array
  certificateChain: Uint8Array
  nonce: Uint8Array
  challengeResponse: Uint8Array
  policy: AuthenticationVerifierPolicy
}): Promise<AuthenticationVerification> => {
  try {
    if (!equal(await sha256(input.certificateChain), input.digest)) return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: 'Certificate chain digest mismatch' } }
    const { rootHash, certificates } = splitUsbCertificateChain(input.certificateChain)
    const anchor = (await Promise.all(input.policy.anchors.filter((candidate) => !candidate.disabled && candidate.allowedSlots.includes(input.slot)).map(async (candidate) => ({ candidate, hash: await sha256(candidate.rootCertificateDer) })))).find(({ hash }) => equal(hash, rootHash))?.candidate
    if (!anchor) return { cryptographic: 'not-checked', trust: 'missing-anchor', policy: 'denied', failure: { layer: 'trust', message: 'No enabled configured anchor matches RootHash and slot' } }
    const root = new X509Certificate(arrayBuffer(anchor.rootCertificateDer))
    const identities = [validateProfile(root, false, true), ...certificates.map((certificate, index) => validateProfile(certificate, index === certificates.length - 1))]
    let requiredVid: string | undefined
    let requiredPid: string | undefined
    identities.forEach((identity) => {
      if (requiredVid && identity.vid !== requiredVid) throw new Error('Certificate chain VID continuity is invalid')
      if (requiredPid && identity.pid !== requiredPid) throw new Error('Certificate chain PID continuity is invalid')
      requiredVid ??= identity.vid
      requiredPid ??= identity.pid
    })
    for (let index = 0; index < certificates.length; index += 1) {
      const issuer = index === 0 ? root : certificates[index - 1]
      if (certificates[index].issuer !== issuer.subject) return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: 'Certificate issuer does not match wire-order issuer' } }
      if (!await certificates[index].verify({ publicKey: issuer.publicKey })) return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: 'Certificate signature chain verification failed' } }
    }
    const leaf = certificates[certificates.length - 1]
    if (input.policy.deniedCertificateSha256?.includes(hex(await sha256(new Uint8Array(leaf.rawData))))) return { cryptographic: 'verified', trust: 'untrusted', policy: 'denied', failure: { layer: 'policy', message: 'Leaf certificate is locally denied' } }
    const request = new Uint8Array([0x10, 0x83, input.slot, 0, ...input.nonce])
    const publicKey = await leaf.publicKey.export({ name: 'ECDSA', namedCurve: 'P-256' }, ['verify'])
    if (!await verifyChallengeSignature(publicKey, request, input.challengeResponse)) return { cryptographic: 'failed', trust: 'trusted', policy: 'denied', failure: { layer: 'cryptographic', message: 'Challenge signature verification failed' } }
    return { cryptographic: 'verified', trust: 'trusted', policy: 'allowed' }
  } catch (error) {
    return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: error instanceof Error ? error.message : String(error) } }
  }
}

/**
 * Verify all evidence that does not require a configured trust anchor.
 * The returned chain omits its root, so this deliberately leaves trust and
 * policy unevaluated even when the digest, returned chain, and challenge are
 * cryptographically self-consistent.
 */
export const inspectUsbAuthenticationEvidence = async (input: {
  slot: number
  digest: Uint8Array
  certificateChain: Uint8Array
  nonce: Uint8Array
  challengeResponse: Uint8Array
}): Promise<AuthenticationVerification> => {
  try {
    if (!equal(await sha256(input.certificateChain), input.digest)) return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: 'Certificate chain digest mismatch' } }
    const { certificates } = splitUsbCertificateChain(input.certificateChain)
    certificates.forEach((certificate, index) => validateProfile(certificate, index === certificates.length - 1))
    for (let index = 1; index < certificates.length; index += 1) {
      const issuer = certificates[index - 1]
      if (certificates[index].issuer !== issuer.subject) return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: 'Certificate issuer does not match wire-order issuer' } }
      if (!await certificates[index].verify({ publicKey: issuer.publicKey })) return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: 'Returned certificate signature chain verification failed' } }
    }
    const leaf = certificates[certificates.length - 1]
    const request = new Uint8Array([0x10, 0x83, input.slot, 0, ...input.nonce])
    const publicKey = await leaf.publicKey.export({ name: 'ECDSA', namedCurve: 'P-256' }, ['verify'])
    if (!await verifyChallengeSignature(publicKey, request, input.challengeResponse)) return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: 'Challenge signature verification failed' } }
    return { cryptographic: 'verified', trust: 'not-checked', policy: 'not-checked' }
  } catch (error) {
    return { cryptographic: 'failed', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'cryptographic', message: error instanceof Error ? error.message : String(error) } }
  }
}
