import type { SinkInquiryRequest, SinkInquiryStatus, SinkInquiryType } from '../types'

export interface WorkerSinkInquiryApi {
  sendInquiry: (type: SinkInquiryType) => Promise<void>
  sendInquiryRequest: (request: SinkInquiryRequest) => Promise<void>
  getInquiryStatus: () => Promise<SinkInquiryStatus>
  getInquiryResponse: () => Promise<Uint8Array>
}

export const dispatchSinkInquiryRpc = async (
  sink: WorkerSinkInquiryApi,
  method: string,
  args: unknown[],
): Promise<{ handled: boolean; value?: unknown }> => {
  if (method === 'sendInquiry') {
    await sink.sendInquiry(args[0] as SinkInquiryType)
    return { handled: true, value: null }
  }
  if (method === 'sendInquiryRequest') {
    await sink.sendInquiryRequest(args[0] as SinkInquiryRequest)
    return { handled: true, value: null }
  }
  if (method === 'getInquiryStatus') {
    return { handled: true, value: await sink.getInquiryStatus() }
  }
  if (method === 'getInquiryResponse') {
    return { handled: true, value: await sink.getInquiryResponse() }
  }
  return { handled: false }
}
