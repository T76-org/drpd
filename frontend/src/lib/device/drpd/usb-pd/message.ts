import type { MessageTypeDefinition } from './types'
import {
  ControlMessage,
  DataMessage,
  ExtendedMessage,
  Message,
  type MessageClass,
} from './messageBase'
import {
  AcceptMessage,
  DataResetCompleteMessage,
  DataResetMessage,
  DRSwapMessage,
  FRSwapMessage,
  GetCountryCodesMessage,
  GetPPSStatusMessage,
  GetRevisionMessage,
  GetSinkCapExtendedMessage,
  GetSinkCapMessage,
  GetSourceCapExtendedMessage,
  GetSourceCapMessage,
  GetSourceInfoMessage,
  GetStatusMessage,
  GoodCRCMessage,
  GotoMinMessage,
  NotSupportedMessage,
  PingMessage,
  PRSwapMessage,
  PSRDYMessage,
  RejectMessage,
  ReservedControlMessage,
  SoftResetMessage,
  VCONNSwapMessage,
  WaitMessage,
} from './messages/ControlMessages'
import { AlertMessage } from './messages/AlertMessage'
import { BISTMessage } from './messages/BISTMessage'
import { BatteryStatusMessage } from './messages/BatteryStatusMessage'
import { EPRModeMessage } from './messages/EPRModeMessage'
import { EPRRequestMessage } from './messages/EPRRequestMessage'
import { EnterUSBMessage } from './messages/EnterUSBMessage'
import { GetCountryInfoMessage } from './messages/GetCountryInfoMessage'
import { RequestMessage } from './messages/RequestMessage'
import { ReservedDataMessage } from './messages/ReservedDataMessage'
import { RevisionMessage } from './messages/RevisionMessage'
import { SinkCapabilitiesMessage } from './messages/SinkCapabilitiesMessage'
import { SourceCapabilitiesMessage } from './messages/SourceCapabilitiesMessage'
import { SourceInfoMessage } from './messages/SourceInfoMessage'
import { VendorDefinedMessage } from './messages/VendorDefinedMessage'
import { BatteryCapabilitiesMessage } from './messages/BatteryCapabilitiesMessage'
import { CountryCodesMessage } from './messages/CountryCodesMessage'
import { CountryInfoMessage } from './messages/CountryInfoMessage'
import { EPRSinkCapabilitiesMessage } from './messages/EPRSinkCapabilitiesMessage'
import { EPRSourceCapabilitiesMessage } from './messages/EPRSourceCapabilitiesMessage'
import { ExtendedControlMessage } from './messages/ExtendedControlMessage'
import { FirmwareUpdateRequestMessage } from './messages/FirmwareUpdateRequestMessage'
import { FirmwareUpdateResponseMessage } from './messages/FirmwareUpdateResponseMessage'
import { GetBatteryCapMessage } from './messages/GetBatteryCapMessage'
import { GetBatteryStatusMessage } from './messages/GetBatteryStatusMessage'
import { GetManufacturerInfoMessage } from './messages/GetManufacturerInfoMessage'
import { ManufacturerInfoMessage } from './messages/ManufacturerInfoMessage'
import { PPSStatusMessage } from './messages/PPSStatusMessage'
import { ReservedExtendedMessage } from './messages/ReservedExtendedMessage'
import { SecurityRequestMessage } from './messages/SecurityRequestMessage'
import { SecurityResponseMessage } from './messages/SecurityResponseMessage'
import { SinkCapabilitiesExtendedMessage } from './messages/SinkCapabilitiesExtendedMessage'
import { SourceCapabilitiesExtendedMessage } from './messages/SourceCapabilitiesExtendedMessage'
import { StatusMessage } from './messages/StatusMessage'
import { VendorDefinedExtendedMessage } from './messages/VendorDefinedExtendedMessage'

/**
 * Definition of a message type mapping entry.
 */
export interface MessageTypeMapping extends MessageTypeDefinition {
  ///< Message class to construct.
  messageClass: MessageClass
}

/**
 * Control message type mapping.
 */
export const CONTROL_MESSAGE_TYPES: Record<number, MessageTypeMapping> = {
  0x00: { name: 'Reserved', messageClass: ReservedControlMessage },
  0x01: { name: 'GoodCRC', messageClass: GoodCRCMessage },
  0x02: { name: 'GotoMin', messageClass: GotoMinMessage },
  0x03: { name: 'Accept', messageClass: AcceptMessage },
  0x04: { name: 'Reject', messageClass: RejectMessage },
  0x05: { name: 'Ping', messageClass: PingMessage },
  0x06: { name: 'PS_RDY', messageClass: PSRDYMessage },
  0x07: { name: 'Get_Source_Cap', messageClass: GetSourceCapMessage },
  0x08: { name: 'Get_Sink_Cap', messageClass: GetSinkCapMessage },
  0x09: { name: 'DR_Swap', messageClass: DRSwapMessage },
  0x0a: { name: 'PR_Swap', messageClass: PRSwapMessage },
  0x0b: { name: 'VCONN_Swap', messageClass: VCONNSwapMessage },
  0x0c: { name: 'Wait', messageClass: WaitMessage },
  0x0d: { name: 'Soft_Reset', messageClass: SoftResetMessage },
  0x0e: { name: 'Data_Reset', messageClass: DataResetMessage },
  0x0f: { name: 'Data_Reset_Complete', messageClass: DataResetCompleteMessage },
  0x10: { name: 'Not_Supported', messageClass: NotSupportedMessage },
  0x11: { name: 'Get_Source_Cap_Extended', messageClass: GetSourceCapExtendedMessage },
  0x12: { name: 'Get_Status', messageClass: GetStatusMessage },
  0x13: { name: 'FR_Swap', messageClass: FRSwapMessage },
  0x14: { name: 'Get_PPS_Status', messageClass: GetPPSStatusMessage },
  0x15: { name: 'Get_Country_Codes', messageClass: GetCountryCodesMessage },
  0x16: { name: 'Get_Sink_Cap_Extended', messageClass: GetSinkCapExtendedMessage },
  0x17: { name: 'Get_Source_Info', messageClass: GetSourceInfoMessage },
  0x18: { name: 'Get_Revision', messageClass: GetRevisionMessage },
}

/**
 * Data message type mapping.
 */
export const DATA_MESSAGE_TYPES: Record<number, MessageTypeMapping> = {
  0x00: { name: 'Reserved', messageClass: ReservedDataMessage },
  0x01: { name: 'Source_Capabilities', messageClass: SourceCapabilitiesMessage },
  0x02: { name: 'Request', messageClass: RequestMessage },
  0x03: { name: 'BIST', messageClass: BISTMessage },
  0x04: { name: 'Sink_Capabilities', messageClass: SinkCapabilitiesMessage },
  0x05: { name: 'Battery_Status', messageClass: BatteryStatusMessage },
  0x06: { name: 'Alert', messageClass: AlertMessage },
  0x07: { name: 'Get_Country_Info', messageClass: GetCountryInfoMessage },
  0x08: { name: 'Enter_USB', messageClass: EnterUSBMessage },
  0x09: { name: 'EPR_Request', messageClass: EPRRequestMessage },
  0x0a: { name: 'EPR_Mode', messageClass: EPRModeMessage },
  0x0b: { name: 'Source_Info', messageClass: SourceInfoMessage },
  0x0c: { name: 'Revision', messageClass: RevisionMessage },
  0x0f: { name: 'Vendor_Defined', messageClass: VendorDefinedMessage },
}

/**
 * Extended message type mapping.
 */
export const EXTENDED_MESSAGE_TYPES: Record<number, MessageTypeMapping> = {
  0x00: { name: 'Reserved', messageClass: ReservedExtendedMessage },
  0x01: { name: 'Source_Capabilities_Extended', messageClass: SourceCapabilitiesExtendedMessage },
  0x02: { name: 'Status', messageClass: StatusMessage },
  0x03: { name: 'Get_Battery_Cap', messageClass: GetBatteryCapMessage },
  0x04: { name: 'Get_Battery_Status', messageClass: GetBatteryStatusMessage },
  0x05: { name: 'Battery_Capabilities', messageClass: BatteryCapabilitiesMessage },
  0x06: { name: 'Get_Manufacturer_Info', messageClass: GetManufacturerInfoMessage },
  0x07: { name: 'Manufacturer_Info', messageClass: ManufacturerInfoMessage },
  0x08: { name: 'Security_Request', messageClass: SecurityRequestMessage },
  0x09: { name: 'Security_Response', messageClass: SecurityResponseMessage },
  0x0a: { name: 'Firmware_Update_Request', messageClass: FirmwareUpdateRequestMessage },
  0x0b: { name: 'Firmware_Update_Response', messageClass: FirmwareUpdateResponseMessage },
  0x0c: { name: 'PPS_Status', messageClass: PPSStatusMessage },
  0x0d: { name: 'Country_Info', messageClass: CountryInfoMessage },
  0x0e: { name: 'Country_Codes', messageClass: CountryCodesMessage },
  0x0f: { name: 'Sink_Capabilities_Extended', messageClass: SinkCapabilitiesExtendedMessage },
  0x10: { name: 'Extended_Control', messageClass: ExtendedControlMessage },
  0x11: { name: 'EPR_Source_Capabilities', messageClass: EPRSourceCapabilitiesMessage },
  0x12: { name: 'EPR_Sink_Capabilities', messageClass: EPRSinkCapabilitiesMessage },
  0x1e: { name: 'Vendor_Defined_Extended', messageClass: VendorDefinedExtendedMessage },
}

export {
  AcceptMessage,
  AlertMessage,
  BatteryCapabilitiesMessage,
  BatteryStatusMessage,
  BISTMessage,
  ControlMessage,
  CountryCodesMessage,
  CountryInfoMessage,
  DataMessage,
  DataResetCompleteMessage,
  DataResetMessage,
  DRSwapMessage,
  EPRModeMessage,
  EPRRequestMessage,
  EPRSinkCapabilitiesMessage,
  EPRSourceCapabilitiesMessage,
  EnterUSBMessage,
  ExtendedControlMessage,
  ExtendedMessage,
  FirmwareUpdateRequestMessage,
  FirmwareUpdateResponseMessage,
  FRSwapMessage,
  GetBatteryCapMessage,
  GetBatteryStatusMessage,
  GetCountryCodesMessage,
  GetCountryInfoMessage,
  GetManufacturerInfoMessage,
  GetPPSStatusMessage,
  GetRevisionMessage,
  GetSinkCapExtendedMessage,
  GetSinkCapMessage,
  GetSourceCapExtendedMessage,
  GetSourceCapMessage,
  GetSourceInfoMessage,
  GetStatusMessage,
  GoodCRCMessage,
  GotoMinMessage,
  ManufacturerInfoMessage,
  Message,
  type MessageClass,
  NotSupportedMessage,
  PingMessage,
  PPSStatusMessage,
  PRSwapMessage,
  PSRDYMessage,
  RejectMessage,
  RequestMessage,
  ReservedControlMessage,
  ReservedDataMessage,
  ReservedExtendedMessage,
  RevisionMessage,
  SecurityRequestMessage,
  SecurityResponseMessage,
  SinkCapabilitiesExtendedMessage,
  SinkCapabilitiesMessage,
  SoftResetMessage,
  SourceCapabilitiesExtendedMessage,
  SourceCapabilitiesMessage,
  SourceInfoMessage,
  StatusMessage,
  VCONNSwapMessage,
  VendorDefinedExtendedMessage,
  VendorDefinedMessage,
  WaitMessage,
}
