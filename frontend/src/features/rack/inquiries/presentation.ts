import { SinkInquiryOutcome } from '../../../lib/device'

export const formatSinkInquiryOutcome = (outcome: SinkInquiryOutcome): string => ({
  [SinkInquiryOutcome.NONE]: 'No result',
  [SinkInquiryOutcome.PENDING]: 'Waiting for Source',
  [SinkInquiryOutcome.RESPONSE]: 'Response received',
  [SinkInquiryOutcome.NOT_SUPPORTED]: 'Not Supported',
  [SinkInquiryOutcome.REJECTED]: 'Rejected',
  [SinkInquiryOutcome.WAIT]: 'Wait',
  [SinkInquiryOutcome.GOODCRC_TIMEOUT]: 'GoodCRC timeout',
  [SinkInquiryOutcome.RESPONSE_TIMEOUT]: 'Response timeout',
  [SinkInquiryOutcome.PROTOCOL_ERROR]: 'Protocol error',
  [SinkInquiryOutcome.MALFORMED_RESPONSE]: 'Malformed response',
  [SinkInquiryOutcome.RESPONSE_TOO_LARGE]: 'Response too large',
  [SinkInquiryOutcome.NAK]: 'VDM NAK',
  [SinkInquiryOutcome.BUSY]: 'VDM Busy',
  [SinkInquiryOutcome.ABORTED]: 'Aborted',
})[outcome]
