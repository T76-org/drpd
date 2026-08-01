import { describe, expect, it } from 'vitest'
import { SinkInquiryType } from '../../../lib/device'
import {
  ACTIVE_SOURCE_INQUIRIES,
  SOURCE_INQUIRY_CATALOG,
  validateInquiryParameters,
  type InquiryDefinition,
} from './catalog'

describe('source inquiry catalog', () => {
  it('contains unique definitions and exposes only implemented inquiries', () => {
    expect(new Set(SOURCE_INQUIRY_CATALOG.map(({ id }) => id)).size).toBe(
      SOURCE_INQUIRY_CATALOG.length,
    )
    expect(new Set(ACTIVE_SOURCE_INQUIRIES.map(({ type }) => type))).toEqual(new Set(Object.values(SinkInquiryType)))
    const definition = ACTIVE_SOURCE_INQUIRIES.find(({ type }) => type === SinkInquiryType.GET_REVISION)!
    expect(ACTIVE_SOURCE_INQUIRIES.every(({ active }) => active)).toBe(true)
    expect(ACTIVE_SOURCE_INQUIRIES.find(({ type }) => type === SinkInquiryType.GET_MANUFACTURER_INFO)?.workflow).toBe('parameterized')
    expect(ACTIVE_SOURCE_INQUIRIES.find(({ type }) => type === SinkInquiryType.GET_COUNTRY_INFO)?.workflow).toBe('guided')
    expect(definition.applicability({ sinkMode: true, attached: true })).toBe(true)
    expect(definition.applicability({ sinkMode: true, attached: false })).toBe(false)
    expect(definition.buildRequest({})).toEqual({ type: SinkInquiryType.GET_REVISION })
    const pps = ACTIVE_SOURCE_INQUIRIES.find(({ type }) => type === SinkInquiryType.GET_PPS_STATUS)!
    expect(pps.applicability({ sinkMode: true, attached: true, sprPpsContract: false })).toBe(false)
    expect(pps.applicability({ sinkMode: true, attached: true, sprPpsContract: true, pdRevision3: true })).toBe(true)
    expect(pps.applicability({ sinkMode: true, attached: true, sprPpsContract: true })).toBe(true)
    expect(pps.applicability({ sinkMode: true, attached: true, sprPpsContract: true, pdRevision3: false })).toBe(false)
    const status = ACTIVE_SOURCE_INQUIRIES.find(({ type }) => type === SinkInquiryType.GET_STATUS)!
    expect(status.sideEffects).toContain('clears-source-status-events')
    expect(status.confirmation?.body).toContain('OCP, OVP, and OTP')
  })

  it('validates typed integer, enum, and country-code parameters', () => {
    const definition: InquiryDefinition<Record<string, unknown>> = {
      id: 'test',
      type: SinkInquiryType.GET_REVISION,
      label: 'Test',
      description: 'Test schema',
      workflow: 'parameterized',
      parameters: [
        { kind: 'integer', name: 'battery', label: 'Battery', min: 0, max: 7 },
        { kind: 'enum', name: 'target', label: 'Target', choices: ['PORT', 'BATTERY'] },
        { kind: 'country-code', name: 'country', label: 'Country' },
      ],
      sideEffects: [],
      applicability: () => true,
      buildRequest: () => ({ type: SinkInquiryType.GET_REVISION }),
      active: false,
    }
    expect(validateInquiryParameters(definition, {
      battery: 3,
      target: 'PORT',
      country: 'CA',
    })).toEqual({ valid: true, errors: {} })
    expect(validateInquiryParameters(definition, {
      battery: 8,
      target: 'CABLE',
      country: 'Canada',
    })).toMatchObject({
      valid: false,
      errors: { battery: expect.any(String), target: expect.any(String), country: expect.any(String) },
    })
  })
})
