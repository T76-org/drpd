/**
 * @file pd_message_types.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "pd_message_types.hpp"


using namespace T76::DRPD;
using namespace T76::DRPD::Proto;


std::string Proto::controlMessageTypeToString(ControlMessageType type) {
    switch (type) {
        case ControlMessageType::GoodCRC:
            return "GoodCRC";
        case ControlMessageType::GotoMin:
            return "GotoMin";
        case ControlMessageType::Accept:
            return "Accept";
        case ControlMessageType::Reject:
            return "Reject";
        case ControlMessageType::Ping:
            return "Ping";
        case ControlMessageType::PS_RDY:
            return "PS_RDY";
        case ControlMessageType::Get_Source_Cap:
            return "Get_Source_Cap";
        case ControlMessageType::Get_Sink_Cap:
            return "Get_Sink_Cap";
        case ControlMessageType::DR_Swap:
            return "DR_Swap";
        case ControlMessageType::PR_Swap:
            return "PR_Swap";
        case ControlMessageType::VCONN_Swap:
            return "VCONN_Swap";
        case ControlMessageType::Wait:
            return "Wait";
        case ControlMessageType::Soft_Reset:
            return "Soft_Reset";
        case ControlMessageType::Data_Reset:
            return "Data_Reset";
        case ControlMessageType::Data_Reset_Complete:
            return "Data_Reset_Complete";
        case ControlMessageType::Not_Supported:
            return "Not_Supported";
        case ControlMessageType::Get_Source_Cap_Extended:
            return "Get_Source_Cap_Extended";
        case ControlMessageType::Get_Status:
            return "Get_Status";
        case ControlMessageType::FR_Swap:
            return "FR_Swap";
        case ControlMessageType::Get_PPS_Status:
            return "Get_PPS_Status";
        case ControlMessageType::Get_Country_Codes:
            return "Get_Country_Codes";
        case ControlMessageType::Get_Sink_Cap_Extended:
            return "Get_Sink_Cap_Extended";
        case ControlMessageType::Get_Source_Info:
            return "Get_Source_Info";
        case ControlMessageType::Get_Revision:
            return "Get_Revision";
        default:
            return "Unknown_Control_Message_Type";
    }
}

std::string Proto::dataMessageTypeToString(DataMessageType type) {
    switch (type) {
        case DataMessageType::Source_Capabilities:
            return "Source_Capabilities";
        case DataMessageType::Request:
            return "Request";
        case DataMessageType::BIST:
            return "BIST";
        case DataMessageType::Sink_Capabilities:
            return "Sink_Capabilities";
        case DataMessageType::Battery_Status:
            return "Battery_Status";
        case DataMessageType::Alert:
            return "Alert";
        case DataMessageType::Get_Country_Info:
            return "Get_Country_Info";
        case DataMessageType::Enter_USB:
            return "Enter_USB";
        case DataMessageType::EPR_Request:
            return "EPR_Request";
        case DataMessageType::EPR_Mode:
            return "EPR_Mode";
        case DataMessageType::Source_Info:
            return "Source_Info";
        case DataMessageType::Revision:
            return "Revision";
        case DataMessageType::Vendor_Defined:
            return "Vendor_Defined";
        default:
            return "Unknown_Data_Message_Type";
    }
}

std::string Proto::extendedMessageTypeToString(ExtendedMessageType type) {
    switch (type) {
        case ExtendedMessageType::Source_Capabilities_Extended:
            return "Source_Capabilities_Extended";
        case ExtendedMessageType::Status:
            return "Status";
        case ExtendedMessageType::Get_Battery_Cap:
            return "Get_Battery_Cap";
        case ExtendedMessageType::Get_Battery_Status:
            return "Get_Battery_Status";
        case ExtendedMessageType::Battery_Capabilities:
            return "Battery_Capabilities";
        case ExtendedMessageType::Get_Manufacturer_Info:
            return "Get_Manufacturer_Info";
        case ExtendedMessageType::Manufacturer_Info:
            return "Manufacturer_Info";
        case ExtendedMessageType::Security_Request:
            return "Security_Request";
        case ExtendedMessageType::Security_Response:
            return "Security_Response";
        case ExtendedMessageType::Firmware_Update_Request:
            return "Firmware_Update_Request";
        case ExtendedMessageType::Firmware_Update_Response:
            return "Firmware_Update_Response";
        case ExtendedMessageType::PPS_Status:
            return "PPS_Status";
        case ExtendedMessageType::Country_Codes:
            return "Country_Codes";
        case ExtendedMessageType::Country_Info:
            return "Country_Info";
        case ExtendedMessageType::Sink_Capabilities_Extended:
            return "Sink_Capabilities_Extended";
        case ExtendedMessageType::Extended_Control:
            return "Extended_Control";
        case ExtendedMessageType::EPR_Source_Capabilities:
            return "EPR_Source_Capabilities";
        case ExtendedMessageType::EPR_Sink_Capabilities:
            return "EPR_Sink_Capabilities";
        case ExtendedMessageType::Vendor_Defined_Extended:
            return "Vendor_Defined_Extended";
        default:
            return "Unknown_Extended_Message_Type";
    }
}
