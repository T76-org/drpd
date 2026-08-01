import { SinkInquiryType, type SinkInquiryRequest } from '../../../lib/device'

export type InquiryWorkflow = 'immediate' | 'parameterized' | 'guided'

export interface InquiryApplicabilityContext {
  sinkMode: boolean
  attached: boolean
  explicitContract?: boolean
  sprPpsContract?: boolean
  pdRevision3?: boolean
}

export type InquirySideEffect =
  | 'clears-source-status-events'
  | 'may-trigger-vendor-defined-processing'

export type InquiryParameterSchema =
  | { kind: 'integer'; name: string; label: string; min: number; max: number; unit?: string }
  | { kind: 'enum'; name: string; label: string; choices: readonly string[] }
  | { kind: 'country-code'; name: string; label: string }

export interface GuidedInquiryStep<TContext = Record<string, unknown>> {
  id: string
  label: string
  when?: (context: TContext) => boolean
  buildRequest: (context: TContext) => SinkInquiryRequest
  applyResult?: (context: TContext, rawResponse: Uint8Array) => TContext
}

export interface GuidedInquiryStepGraph<TContext = Record<string, unknown>> {
  initialContext: TContext
  steps: readonly GuidedInquiryStep<TContext>[]
}

export interface InquiryDefinition<TParameters = Record<string, never>> {
  id: string
  type: SinkInquiryType
  label: string
  description: string
  workflow: InquiryWorkflow
  parameters: readonly InquiryParameterSchema[]
  sideEffects: readonly InquirySideEffect[]
  applicability: (context: InquiryApplicabilityContext) => boolean
  buildRequest: (parameters: TParameters) => SinkInquiryRequest
  guided?: GuidedInquiryStepGraph
  active: boolean
  confirmation?: { title: string; body: string; confirmLabel: string }
}

export const SOURCE_INQUIRY_CATALOG: readonly InquiryDefinition[] = [
  {
    id: 'get-source-capabilities', type: SinkInquiryType.GET_SOURCE_CAP,
    label: 'Get source capabilities', description: 'Ask the attached Source to resend its advertised power capabilities.',
    workflow: 'immediate', parameters: [], sideEffects: [],
    applicability: ({ sinkMode, attached }) => sinkMode && attached,
    buildRequest: () => ({ type: SinkInquiryType.GET_SOURCE_CAP }), active: true,
  },
  {
    id: 'get-extended-source-capabilities', type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED,
    label: 'Get extended source capabilities', description: 'Ask the attached PD 3.x Source for its extended capabilities.',
    workflow: 'immediate', parameters: [], sideEffects: [],
    applicability: ({ sinkMode, attached, pdRevision3 }) => sinkMode && attached && pdRevision3 !== false,
    buildRequest: () => ({ type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED }), active: true,
  },
  {
    id: 'get-status', type: SinkInquiryType.GET_STATUS,
    label: 'Get status', description: 'Ask the attached PD 3.x Source for its current status.',
    workflow: 'immediate', parameters: [], sideEffects: ['clears-source-status-events'],
    applicability: ({ sinkMode, attached, pdRevision3 }) => sinkMode && attached && pdRevision3 !== false,
    buildRequest: () => ({ type: SinkInquiryType.GET_STATUS }), active: true,
    confirmation: {
      title: 'Send Get_Status?',
      body: 'Reading Status clears the Source’s latched OCP, OVP, and OTP event flags.',
      confirmLabel: 'Send Get_Status',
    },
  },
  {
    id: 'get-source-information', type: SinkInquiryType.GET_SOURCE_INFO,
    label: 'Get source information', description: 'Ask the attached PD 3.x Source for identifying and capability information.',
    workflow: 'immediate', parameters: [], sideEffects: [],
    applicability: ({ sinkMode, attached, pdRevision3 }) => sinkMode && attached && pdRevision3 !== false,
    buildRequest: () => ({ type: SinkInquiryType.GET_SOURCE_INFO }), active: true,
  },
  {
    id: 'get-pps-status', type: SinkInquiryType.GET_PPS_STATUS,
    label: 'Get PPS status', description: 'Ask the attached Source for status of the active SPR PPS contract.',
    workflow: 'immediate', parameters: [], sideEffects: [],
    applicability: ({ sinkMode, attached, sprPpsContract, pdRevision3 }) => sinkMode && attached && sprPpsContract === true && pdRevision3 !== false,
    buildRequest: () => ({ type: SinkInquiryType.GET_PPS_STATUS }), active: true,
  },
  {
    id: 'get-revision',
    type: SinkInquiryType.GET_REVISION,
    label: 'Get revision',
    description: 'Ask the attached Source which USB Power Delivery revision it supports.',
    workflow: 'immediate',
    parameters: [],
    sideEffects: [],
    applicability: ({ sinkMode, attached }) => sinkMode && attached,
    buildRequest: () => ({ type: SinkInquiryType.GET_REVISION }),
    active: true,
  },
  {
    id: 'get-manufacturer-info', type: SinkInquiryType.GET_MANUFACTURER_INFO,
    label: 'Get manufacturer info…', description: 'Ask for manufacturer identity for the Port or a battery reference.',
    workflow: 'parameterized',
    parameters: [
      { kind: 'enum', name: 'target', label: 'Target', choices: ['PORT', 'BATTERY'] },
      { kind: 'integer', name: 'batteryReference', label: 'Battery reference', min: 0, max: 7 },
    ], sideEffects: [], applicability: ({ sinkMode, attached, pdRevision3 }) => sinkMode && attached && pdRevision3 !== false,
    buildRequest: (values: Record<string, unknown>) => values.target === 'BATTERY'
      ? { type: SinkInquiryType.GET_MANUFACTURER_INFO, target: 'BATTERY', batteryReference: values.batteryReference as number }
      : { type: SinkInquiryType.GET_MANUFACTURER_INFO, target: 'PORT' },
    active: true,
  } as InquiryDefinition<Record<string, unknown>>,
  {
    id: 'get-country-codes', type: SinkInquiryType.GET_COUNTRY_CODES,
    label: 'Get country codes', description: 'Ask the attached Source which country information records it supports.',
    workflow: 'immediate', parameters: [], sideEffects: [], applicability: ({ sinkMode, attached, pdRevision3 }) => sinkMode && attached && pdRevision3 !== false,
    buildRequest: () => ({ type: SinkInquiryType.GET_COUNTRY_CODES }), active: true,
  },
  {
    id: 'get-country-information', type: SinkInquiryType.GET_COUNTRY_INFO,
    label: 'Get country information…', description: 'Discover supported country codes, then request one selected record or all records.',
    workflow: 'guided', parameters: [{ kind: 'country-code', name: 'countryCode', label: 'Country code' }], sideEffects: [],
    applicability: ({ sinkMode, attached, pdRevision3 }) => sinkMode && attached && pdRevision3 !== false,
    buildRequest: (values: Record<string, unknown>) => ({ type: SinkInquiryType.GET_COUNTRY_INFO, countryCode: String(values.countryCode).toUpperCase() }),
    guided: { initialContext: {}, steps: [{ id: 'country-codes', label: 'Discover country codes', buildRequest: () => ({ type: SinkInquiryType.GET_COUNTRY_CODES }) }] },
    active: true,
  } as InquiryDefinition<Record<string, unknown>>,
]

export const ACTIVE_SOURCE_INQUIRIES = SOURCE_INQUIRY_CATALOG.filter(
  (definition) => definition.active,
)

export interface InquiryParameterValidationResult {
  valid: boolean
  errors: Readonly<Record<string, string>>
}

export const validateInquiryParameters = (
  definition: InquiryDefinition<Record<string, unknown>>,
  values: Readonly<Record<string, unknown>>,
): InquiryParameterValidationResult => {
  const errors: Record<string, string> = {}
  for (const schema of definition.parameters) {
    const value = values[schema.name]
    if (schema.kind === 'integer') {
      if (!Number.isInteger(value) || (value as number) < schema.min || (value as number) > schema.max) {
        errors[schema.name] = `${schema.label} must be an integer from ${schema.min} to ${schema.max}.`
      }
    } else if (schema.kind === 'enum') {
      if (typeof value !== 'string' || !schema.choices.includes(value)) {
        errors[schema.name] = `${schema.label} must be one of: ${schema.choices.join(', ')}.`
      }
    } else if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) {
      errors[schema.name] = `${schema.label} must be an uppercase ISO alpha-2 country code.`
    }
  }
  return { valid: Object.keys(errors).length === 0, errors }
}
