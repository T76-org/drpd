import { SinkInquiryType, type SinkInquiryRequest } from '../../../lib/device'

export type InquiryWorkflow = 'immediate' | 'parameterized' | 'guided'

export interface InquiryApplicabilityContext {
  sinkMode: boolean
  attached: boolean
  explicitContract?: boolean
  sprPpsContract?: boolean
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
}

export const SOURCE_INQUIRY_CATALOG: readonly InquiryDefinition[] = [
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
    } else if (typeof value !== 'string' || !/^[A-Za-z]{2}$/.test(value)) {
      errors[schema.name] = `${schema.label} must be a two-letter country code.`
    }
  }
  return { valid: Object.keys(errors).length === 0, errors }
}
