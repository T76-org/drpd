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
    expect(ACTIVE_SOURCE_INQUIRIES).toEqual([
      expect.objectContaining({
        id: 'get-revision',
        type: SinkInquiryType.GET_REVISION,
        workflow: 'immediate',
        active: true,
      }),
    ])
    const definition = ACTIVE_SOURCE_INQUIRIES[0]
    expect(definition.parameters).toEqual([])
    expect(definition.sideEffects).toEqual([])
    expect(definition.applicability({ sinkMode: true, attached: true })).toBe(true)
    expect(definition.applicability({ sinkMode: true, attached: false })).toBe(false)
    expect(definition.buildRequest({})).toEqual({ type: SinkInquiryType.GET_REVISION })
    expect(new Set(ACTIVE_SOURCE_INQUIRIES.map(({ type }) => type)).size).toBe(
      ACTIVE_SOURCE_INQUIRIES.length,
    )
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
