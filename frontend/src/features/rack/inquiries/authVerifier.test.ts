import { describe, expect, it } from 'vitest'
import { splitUsbCertificateChain, verifyUsbAuthentication } from './authVerifier'

const bytes = (value: string): Uint8Array => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
const ROOT_DER = bytes('MIIBmDCCAT2gAwIBAgIBATAKBggqhkjOPQQDAjApMQ4wDAYDVQQDDAVVU0I6OjEXMBUGA1UECgwORFJQRCBUZXN0IFJvb3QwIBcNMjYwODAxMDIzMzUwWhgPMjEyNjA3MDgwMjMzNTBaMCkxDjAMBgNVBAMMBVVTQjo6MRcwFQYDVQQKDA5EUlBEIFRlc3QgUm9vdDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABBJWHNB/bExr6RnD7aw44KrXYdDZpTNrFpWBoFZOhVFiijnSBBL2pWuCu69C9bQKpnrD/NXI/gVXd4X8B6Br2MqjVDBSMA8GA1UdEwEB/wQFMAMBAf8wCwYDVR0PBAQDAgEGMBMGA1UdJQEB/wQJMAcGBWeBEQEBMB0GA1UdDgQWBBRuJHm5vDzr9PWzr4OZvC3P8yxl7jAKBggqhkjOPQQDAgNJADBGAiEA53XeSt7wpPWMu6GI3Jfekf3gkw/OxeW/Gvcp10MGZ44CIQC7XNk2g62r26aBgOoGYoZwFnRYWZJikCgrUhPpxo5h7A==')
const CHAIN = bytes('EAUAAHZDpG5358Qc5c4vTaKNn0uCU8S5OwMt65AEIPXSQ48IMIIBozCCAUmgAwIBAgIBAjAKBggqhkjOPQQDAjApMQ4wDAYDVQQDDAVVU0I6OjEXMBUGA1UECgwORFJQRCBUZXN0IFJvb3QwIBcNMjYwODAxMDIzMzUwWhgPMjEyNjA3MDgwMjMzNTBaMBQxEjAQBgNVBAMMCVVTQjoxMjM0OjBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABBZvAmu0dmOejLUoI4YhTpXh04+O8Ws68tIzrltETMY/9pz5Eh2pTVIIn5Ou7fv0OjP+/ySmACaldbrdRr9m8LmjdTBzMA8GA1UdEwEB/wQFMAMBAf8wCwYDVR0PBAQDAgIEMBMGA1UdJQEB/wQJMAcGBWeBEQEBMB0GA1UdDgQWBBS2x8SkICGzc50ayWlbQ49gcAuWyjAfBgNVHSMEGDAWgBRuJHm5vDzr9PWzr4OZvC3P8yxl7jAKBggqhkjOPQQDAgNIADBFAiEAggoMXwkiGE1MjmHeoB43r2Pxz4pNoqChqfVTd4PxPxgCIFTww1G9DoESkcv8fz2tXKAfI2Gn4Teg87e+9sbVqTsaMIIBjTCCATSgAwIBAgIBAzAKBggqhkjOPQQDAjAUMRIwEAYDVQQDDAlVU0I6MTIzNDowIBcNMjYwODAxMDIzMzUwWhgPMjEyNjA3MDgwMjMzNTBaMBQxEjAQBgNVBAMMCVVTQjoxMjM0OjBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABF+4xSxNf+7UumyGcxC76XqR7vvPrC7IgyxjbTCgBaoP9CKIqFEeHmAukz12Ir0lqHl2rpIJUF6mFHqKpdnv7vWjdTBzMA8GA1UdEwEB/wQFMAMBAf8wCwYDVR0PBAQDAgIEMBMGA1UdJQEB/wQJMAcGBWeBEQEBMB0GA1UdDgQWBBTgz1GpkPFdeqdmfdZyobcQ34hnKTAfBgNVHSMEGDAWgBS2x8SkICGzc50ayWlbQ49gcAuWyjAKBggqhkjOPQQDAgNHADBEAiA/ugnzFq1ijma/tFdP2B9WVOyGYbSsSsMeilzgLJyVIAIgflQ3+vdFOdWqSznKPDuxwqBxv3hjIG/e1JMeMnjIH/gwggGwMIIBV6ADAgECAgEEMAoGCCqGSM49BAMCMBQxEjAQBgNVBAMMCVVTQjoxMjM0OjAgFw0yNjA4MDEwMjMzNTBaGA8yMTI2MDcwODAyMzM1MFowJzEWMBQGA1UEAwwNVVNCOjEyMzQ6YWJjZDENMAsGA1UEBRMEMDAwMTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABFLSIQpMd/SCvB49LrlGHykAYF7j/Nvsu7NCmEcQb8DH0DBl7eY8lIFp7rVydWf891vGCSW9lnL9zzvQGqksaSejgYQwgYEwDAYDVR0TAQH/BAIwADALBgNVHQ8EBAMCB4AwEwYDVR0lAQH/BAkwBwYFZ4ERAQEwDwYFZ4ERAQIEBgQEAQIDBDAdBgNVHQ4EFgQUs2E9ozNjT098vwzq4dujb73+E/8wHwYDVR0jBBgwFoAU4M9RqZDxXXqnZn3WcqG3EN+IZykwCgYIKoZIzj0EAwIDRwAwRAIgYN6WVWylO+ZXqTCEDOZNkYHSXDWVo134Yivk2DdErR4CIDPuLgcXs7h0LtHdVHJvvZpvXG0qEL7728xk4UvGZUkT')
const DIGEST = bytes('SmiwFwJOyZ26hpVQDXTbrTeweZX40bR21VBZDpmYWZU=')
const NONCE = bytes('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=')
const RESPONSE = bytes('EAMAAQEBAQAICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJ0posBcCTsmduoaVUA102603sHmV+NG0dtVQWQ6ZmFmVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJ/MgqVyFg3MASdQhQ47t9DmK7QNv3d6e13Ft2Lt4lNYwG558YBA9QUU0PkOlyhTGXQ/501bkjZ4OWNwC+aLhX')

describe('USB authentication verifier golden vectors', () => {
  it('accepts root -> wire-order intermediates -> leaf and exact challenge signature', async () => {
    const split = splitUsbCertificateChain(CHAIN)
    expect(split.certificates.map((certificate) => certificate.subject)).toEqual(['CN=USB:1234:', 'CN=USB:1234:', 'CN=USB:1234:abcd, 2.5.4.5=0001'])
    expect(new Uint8Array(split.certificates[2].getExtension('2.23.145.1.2')!.value)).toEqual(new Uint8Array([4, 4, 1, 2, 3, 4]))
    await expect(verifyUsbAuthentication({ slot: 0, digest: DIGEST, certificateChain: CHAIN, nonce: NONCE, challengeResponse: RESPONSE, policy: { id: 'golden', anchors: [{ id: 'root', rootCertificateDer: ROOT_DER, allowedSlots: [0] }] } })).resolves.toEqual({ cryptographic: 'verified', trust: 'trusted', policy: 'allowed' })
  })

  it('rejects a modified signed challenge transcript', async () => {
    const response = RESPONSE.slice(); response[40] ^= 1
    const result = await verifyUsbAuthentication({ slot: 0, digest: DIGEST, certificateChain: CHAIN, nonce: NONCE, challengeResponse: response, policy: { id: 'golden', anchors: [{ id: 'root', rootCertificateDer: ROOT_DER, allowedSlots: [0] }] } })
    expect(result.failure?.message).toBe('Challenge signature verification failed')
  })
})
