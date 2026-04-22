import { describe, expect, it } from 'vitest'

import {
  compareFirmwareVersions,
  parseFirmwareVersion,
} from './version'

const compare = (left: string, right: string): number =>
  compareFirmwareVersions(parseFirmwareVersion(left), parseFirmwareVersion(right))

describe('firmware version parsing', () => {
  it('parses stable versions', () => {
    const version = parseFirmwareVersion('1.2.3')

    expect(version).toMatchObject({
      major: 1,
      minor: 2,
      patch: 3,
      isStable: true,
      isBeta: false,
      text: '1.2.3',
    })
    expect(version.betaNumber).toBeUndefined()
  })

  it('parses beta versions', () => {
    const version = parseFirmwareVersion('1.2.3-beta.1')

    expect(version).toMatchObject({
      major: 1,
      minor: 2,
      patch: 3,
      isStable: false,
      isBeta: true,
      betaNumber: 1,
      text: '1.2.3-beta.1',
    })
  })

  it('normalizes leading v tags', () => {
    expect(parseFirmwareVersion('v2.0.1').text).toBe('2.0.1')
  })

  it('rejects malformed versions', () => {
    expect(() => parseFirmwareVersion('1.2')).toThrow('Invalid firmware version')
    expect(() => parseFirmwareVersion('1.2.3-beta.0')).toThrow('Invalid firmware version')
    expect(() => parseFirmwareVersion('1.2.3-alpha.1')).toThrow('Invalid firmware version')
  })
})

describe('firmware version comparison', () => {
  it('treats equal versions as equal', () => {
    expect(compare('1.0.0', '1.0.0')).toBe(0)
  })

  it('orders beta numbers for the same base version', () => {
    expect(compare('1.0.0-beta.1', '1.0.0-beta.2')).toBeLessThan(0)
  })

  it('orders stable newer than beta for the same base version', () => {
    expect(compare('1.0.0-beta.9', '1.0.0')).toBeLessThan(0)
  })

  it('compares patch before prerelease status', () => {
    expect(compare('1.0.1-beta.1', '1.0.0')).toBeGreaterThan(0)
  })

  it('compares major/minor/patch before beta status', () => {
    expect(compare('2.0.0-beta.1', '1.99.99')).toBeGreaterThan(0)
  })

  it('matches the required beta-to-stable ordering example', () => {
    expect(compare('1.5.0-beta.1', '1.5.0-beta.2')).toBeLessThan(0)
    expect(compare('1.5.0-beta.2', '1.5.0')).toBeLessThan(0)
  })
})
