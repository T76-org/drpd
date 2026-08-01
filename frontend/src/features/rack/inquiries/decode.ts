import { SinkInquiryType, type SinkInquiryStatus } from '../../../lib/device'
import {
  parsePDO,
  parsePPSStatusDataBlock,
  parseRevisionDataObject,
  parseSOPStatusDataBlock,
  parseSourceCapabilitiesExtendedDataBlock,
  parseSourceInfoDataObject,
  readDataObjects,
} from '../../../lib/device/drpd/usb-pd/DataObjects'

export interface DecodedInquiryResponse { summary: string; messageTypeName: string }

const RESPONSE_TYPES: Record<SinkInquiryType, { responseClass: number; responseType: number; name: string }> = {
  [SinkInquiryType.GET_SOURCE_CAP]: { responseClass: 2, responseType: 0x01, name: 'Source_Capabilities' },
  [SinkInquiryType.GET_SOURCE_CAP_EXTENDED]: { responseClass: 0, responseType: 0x01, name: 'Source_Capabilities_Extended' },
  [SinkInquiryType.GET_STATUS]: { responseClass: 0, responseType: 0x02, name: 'Status' },
  [SinkInquiryType.GET_SOURCE_INFO]: { responseClass: 2, responseType: 0x0b, name: 'Source_Info' },
  [SinkInquiryType.GET_PPS_STATUS]: { responseClass: 0, responseType: 0x0c, name: 'PPS_Status' },
  [SinkInquiryType.GET_REVISION]: { responseClass: 2, responseType: 0x0c, name: 'Revision' },
}

const oneDataObject = (body: Uint8Array, name: string): number => {
  if (body.length !== 4) throw new Error(`${name} response must contain exactly 4 bytes`)
  return readDataObjects(body, 0, 1)[0]
}

/** Decode only the firmware-provided logical body; no packet fields are fabricated. */
export const decodeInquiryResponse = (
  status: SinkInquiryStatus,
  rawBody: Uint8Array,
): DecodedInquiryResponse => {
  const expected = RESPONSE_TYPES[status.type]
  if (status.responseLength !== rawBody.length) throw new Error('Response length does not match body')
  if (status.responseClass !== expected.responseClass || status.responseType !== expected.responseType) {
    throw new Error(`Unexpected response class/type ${status.responseClass}/${status.responseType}; expected ${expected.responseClass}/${expected.responseType}`)
  }
  let decoded: unknown
  switch (status.type) {
    case SinkInquiryType.GET_SOURCE_CAP:
      if (rawBody.length < 4 || rawBody.length > 28 || rawBody.length % 4 !== 0) throw new Error('Source_Capabilities body must contain 1 to 7 PDOs')
      decoded = readDataObjects(rawBody, 0, rawBody.length / 4).map((pdo) => parsePDO(pdo, 'source'))
      break
    case SinkInquiryType.GET_SOURCE_CAP_EXTENDED:
      if (rawBody.length !== 24 && rawBody.length !== 25) throw new Error('Source_Capabilities_Extended body must contain exactly 24 or 25 bytes')
      decoded = parseSourceCapabilitiesExtendedDataBlock(rawBody)
      break
    case SinkInquiryType.GET_STATUS:
      if (rawBody.length !== 6 && rawBody.length !== 7) throw new Error('Status body must contain exactly 6 or 7 bytes')
      decoded = parseSOPStatusDataBlock(rawBody)
      break
    case SinkInquiryType.GET_SOURCE_INFO:
      decoded = parseSourceInfoDataObject(oneDataObject(rawBody, 'Source_Info'))
      break
    case SinkInquiryType.GET_PPS_STATUS:
      if (rawBody.length !== 4) throw new Error('PPS_Status response must contain exactly 4 bytes')
      decoded = parsePPSStatusDataBlock(rawBody)
      break
    case SinkInquiryType.GET_REVISION:
      decoded = parseRevisionDataObject(oneDataObject(rawBody, 'Revision'))
      break
  }
  return { messageTypeName: expected.name, summary: JSON.stringify(decoded, null, 2) }
}
