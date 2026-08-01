import { SinkInquiryType, type SinkInquiryRequest, type SinkInquiryStatus } from '../../../lib/device'
import {
  parsePDO,
  parsePPSStatusDataBlock,
  parseManufacturerInfoDataBlock,
  parseCountryCodesDataBlock,
  parseCountryInfoDataBlock,
  parseBatteryCapabilitiesDataBlock,
  parseBatteryStatusDataObject,
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
  [SinkInquiryType.GET_MANUFACTURER_INFO]: { responseClass: 0, responseType: 0x07, name: 'Manufacturer_Info' },
  [SinkInquiryType.GET_COUNTRY_CODES]: { responseClass: 0, responseType: 0x0e, name: 'Country_Codes' },
  [SinkInquiryType.GET_COUNTRY_INFO]: { responseClass: 0, responseType: 0x0d, name: 'Country_Info' },
  [SinkInquiryType.GET_BATTERY_CAP]: { responseClass: 0, responseType: 0x05, name: 'Battery_Capabilities' },
  [SinkInquiryType.GET_BATTERY_STATUS]: { responseClass: 2, responseType: 0x05, name: 'Battery_Status' },
}

const isUpperAlpha = (byte: number): boolean => byte >= 0x41 && byte <= 0x5a

const oneDataObject = (body: Uint8Array, name: string): number => {
  if (body.length !== 4) throw new Error(`${name} response must contain exactly 4 bytes`)
  return readDataObjects(body, 0, 1)[0]
}

/** Decode only the firmware-provided logical body; no packet fields are fabricated. */
export const decodeInquiryResponse = (
  status: SinkInquiryStatus,
  rawBody: Uint8Array,
  request?: SinkInquiryRequest,
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
    case SinkInquiryType.GET_MANUFACTURER_INFO: {
      if (rawBody.length < 5 || rawBody.length > 260) throw new Error('Manufacturer_Info body must contain VID, PID, and a null-terminated string')
      const terminator = rawBody.indexOf(0, 4)
      if (terminator < 4 || terminator !== rawBody.length - 1) throw new Error('Manufacturer_Info string must have one trailing null terminator')
      for (const byte of rawBody.subarray(4, terminator)) {
        if (byte < 0x20 || byte > 0x7e) throw new Error('Manufacturer_Info string must be printable ASCII')
      }
      decoded = parseManufacturerInfoDataBlock(rawBody)
      break
    }
    case SinkInquiryType.GET_COUNTRY_CODES: {
      if (rawBody.length < 4 || rawBody.length > 26 || rawBody[0] < 1 || rawBody[0] > 12 || rawBody[1] !== 0 || rawBody.length !== 2 + rawBody[0] * 2) throw new Error('Country_Codes count/reserved/length fields are malformed')
      for (let index = 2; index < rawBody.length; index += 1) {
        if (!isUpperAlpha(rawBody[index])) throw new Error('Country_Codes entries must be uppercase ASCII alpha-2')
      }
      decoded = parseCountryCodesDataBlock(rawBody)
      break
    }
    case SinkInquiryType.GET_COUNTRY_INFO: {
      if (rawBody.length < 4 || rawBody.length > 26 || rawBody[2] !== 0 || rawBody[3] !== 0 || !isUpperAlpha(rawBody[0]) || !isUpperAlpha(rawBody[1])) throw new Error('Country_Info code or reserved bytes are malformed')
      if (!request || request.type !== SinkInquiryType.GET_COUNTRY_INFO) throw new Error('Country_Info decoding requires its semantic request')
      const echoedCode = String.fromCharCode(rawBody[0], rawBody[1])
      if (echoedCode !== request.countryCode) throw new Error(`Country_Info echoed ${echoedCode}, expected ${request.countryCode}`)
      decoded = parseCountryInfoDataBlock(rawBody)
      break
    }
    case SinkInquiryType.GET_BATTERY_CAP: {
      if (rawBody.length !== 9) throw new Error('Battery_Capabilities response must contain exactly 9 bytes')
      if (!request || request.type !== SinkInquiryType.GET_BATTERY_CAP) throw new Error('Battery_Capabilities decoding requires its semantic request')
      if ((rawBody[8] & 0xfe) !== 0) throw new Error('Battery_Capabilities reserved bits must be zero')
      const block = parseBatteryCapabilitiesDataBlock(rawBody)
      const invalidBatteryReference = (block.batteryType & 0x01) !== 0
      decoded = {
        ...block,
        batteryReference: request.batteryReference,
        invalidBatteryReference,
        designCapacityMeaning: block.batteryDesignCapacity === 0 ? 'battery not present' : block.batteryDesignCapacity === 0xffff ? 'unknown' : 'known',
        lastFullChargeCapacityMeaning: block.batteryLastFullChargeCapacity === 0 ? 'battery not present' : block.batteryLastFullChargeCapacity === 0xffff ? 'unknown' : 'known',
        designCapacityWh: block.batteryDesignCapacity === 0 || block.batteryDesignCapacity === 0xffff ? null : block.batteryDesignCapacity / 10,
        lastFullChargeCapacityWh: block.batteryLastFullChargeCapacity === 0 || block.batteryLastFullChargeCapacity === 0xffff ? null : block.batteryLastFullChargeCapacity / 10,
        batteryPresent: !invalidBatteryReference && block.batteryDesignCapacity !== 0,
      }
      break
    }
    case SinkInquiryType.GET_BATTERY_STATUS: {
      if (!request || request.type !== SinkInquiryType.GET_BATTERY_STATUS) throw new Error('Battery_Status decoding requires its semantic request')
      const block = parseBatteryStatusDataObject(oneDataObject(rawBody, 'Battery_Status'))
      if ((block.raw & 0x0000f0ff) !== 0) throw new Error('Battery_Status reserved bits must be zero')
      if (block.batteryChargingStatus === 3) throw new Error('Battery_Status charge state is reserved')
      decoded = {
        ...block,
        batteryReference: request.batteryReference,
        presentCapacityMeaning: block.batteryPresentCapacity === 0xffff ? 'unknown' : !block.batteryPresent ? 'battery not present' : 'known',
        presentCapacityWh: block.batteryPresentCapacity === 0xffff || !block.batteryPresent ? null : block.batteryPresentCapacity / 10,
        chargeState: ['charging', 'discharging', 'idle', 'reserved'][block.batteryChargingStatus],
      }
      break
    }
  }
  return { messageTypeName: expected.name, summary: JSON.stringify(decoded, null, 2) }
}
