/**
 * @file pd_message_types.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The pd_message_types.hpp file defines enumerations for the various
 * USB Power Delivery (USB-PD) message types, including Control,
 * Data, and Extended message types as specified in the USB-PD 3.2
 * specification.
 */

#pragma once


#include <cstdint>
#include <string>


namespace T76::DRPD::Proto {
    
    /**
     * @brief USB-PD 3.2 Control Message Types
     * 
     * Control messages have no Data Objects.
     * Reference: USB Power Delivery Specification Rev 3.2, Section 6.3 - Control Message; Table 6.5 (Control Message Types)
     */
    enum class ControlMessageType : uint32_t {
        GoodCRC = 0x01,                    ///< See Section 6.3.1 - GoodCRC Message
        GotoMin = 0x02,                    ///< See Section 6.3.2 - GotoMin Message (Deprecated)
        Accept = 0x03,                     ///< See Section 6.3.3 - Accept Message
        Reject = 0x04,                     ///< See Section 6.3.4 - Reject Message
        Ping = 0x05,                       ///< See Section 6.3.5 - Ping Message (Deprecated)
        PS_RDY = 0x06,                     ///< See Section 6.3.6 - PS_RDY Message
        Get_Source_Cap = 0x07,             ///< See Section 6.3.7 - Get_Source_Cap Message
        Get_Sink_Cap = 0x08,               ///< See Section 6.3.8 - Get_Sink_Cap Message
        DR_Swap = 0x09,                    ///< See Section 6.3.9 - DR_Swap Message
        PR_Swap = 0x0A,                    ///< See Section 6.3.10 - PR_Swap Message
        VCONN_Swap = 0x0B,                 ///< See Section 6.3.11 - VCONN_Swap Message
        Wait = 0x0C,                       ///< See Section 6.3.12 - Wait Message
        Soft_Reset = 0x0D,                 ///< See Section 6.3.13 - Soft_Reset Message
        Data_Reset = 0x0E,                 ///< See Section 6.3.14 - Data_Reset Message
        Data_Reset_Complete = 0x0F,        ///< See Section 6.3.15 - Data_Reset_Complete Message
        Not_Supported = 0x10,              ///< See Section 6.3.16 - Not_Supported Message
        Get_Source_Cap_Extended = 0x11,    ///< See Section 6.3.17 - Get_Source_Cap_Extended Message
        Get_Status = 0x12,                 ///< See Section 6.3.18 - Get_Status Message
        FR_Swap = 0x13,                    ///< See Section 6.3.19 - FR_Swap Message
        Get_PPS_Status = 0x14,             ///< See Section 6.3.20 - Get_PPS_Status Message
        Get_Country_Codes = 0x15,          ///< See Section 6.3.21 - Get_Country_Codes Message
        Get_Sink_Cap_Extended = 0x16,      ///< See Section 6.3.22 - Get_Sink_Cap_Extended Message
        Get_Source_Info = 0x17,            ///< See Section 6.3.23 - Get_Source_Info Message
        Get_Revision = 0x18,               ///< See Section 6.3.24 - Get_Revision Message
    };
    
    /**
     * @brief USB-PD 3.2 Data Message Types
     * 
     * Data messages contain one or more 32-bit Data Objects.
     * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4 - Data Message; Table 6.6 (Data Message Types)
     */
    enum class DataMessageType : uint32_t {
        Source_Capabilities = 0x01,        ///< See Section 6.4.1.5 - SPR Source_Capabilities Message
        Request = 0x02,                    ///< See Section 6.4.2 - Request Message
        BIST = 0x03,                       ///< See Section 6.4.3 - BIST Message
        Sink_Capabilities = 0x04,          ///< See Section 6.4.2 - Sink_Capabilities Message
        Battery_Status = 0x05,             ///< See Section 6.4.5 - Battery_Status Message
        Alert = 0x06,                      ///< See Section 6.4.6 - Alert Message
        Get_Country_Info = 0x07,           ///< See Section 6.4.7 - Get_Country_Info Message
        Enter_USB = 0x08,                  ///< See Section 6.4.8 - Enter_USB Message
        EPR_Request = 0x09,                ///< See Section 6.4.9 - EPR_Request Message
        EPR_Mode = 0x0A,                   ///< See Section 6.4.10 - EPR_Mode Message
        Source_Info = 0x0B,                ///< See Section 6.4.11 - Source_Info Message
        Revision = 0x0C,                   ///< See Section 6.4.12 - Revision Message
        // Reserved for future use: 0x0D - 0x0E
        Vendor_Defined = 0x0F,             ///< See Section 6.4.4 - Vendor_Defined Message (VDM)
    };
    
    /**
     * @brief Extended Message Types
     * 
     * Extended messages are indicated by the Extended bit in the message header.
     * Reference: USB Power Delivery Specification Rev 3.2, Section 6.5 - Extended Message; Table 6.53 (Extended Message Types)
     */
    enum class ExtendedMessageType : uint32_t {
        Source_Capabilities_Extended = 0x01,  ///< See Section 6.5.1 - Source_Capabilities_Extended Message
        Status = 0x02,                        ///< See Section 6.5.2 - Status Message
        Get_Battery_Cap = 0x03,               ///< See Section 6.5.3 - Get_Battery_Cap Message
        Get_Battery_Status = 0x04,            ///< See Section 6.5.4 - Get_Battery_Status Message
        Battery_Capabilities = 0x05,          ///< See Section 6.5.5 - Battery_Capabilities Message
        Get_Manufacturer_Info = 0x06,         ///< See Section 6.5.6 - Get_Manufacturer_Info Message
        Manufacturer_Info = 0x07,             ///< See Section 6.5.7 - Manufacturer_Info Message
        Security_Request = 0x08,              ///< See Section 6.5.8.1 - Security_Request Message
        Security_Response = 0x09,             ///< See Section 6.5.8.2 - Security_Response Message
        Firmware_Update_Request = 0x0A,       ///< See Section 6.5.9.1 - Firmware_Update_Request Message
        Firmware_Update_Response = 0x0B,      ///< See Section 6.5.9.2 - Firmware_Update_Response Message
        PPS_Status = 0x0C,                    ///< See Section 6.5.10 - PPS_Status Message
        Country_Codes = 0x0E,                 ///< See Section 6.5.11 - Country_Codes Message
        Country_Info = 0x0D,                  ///< See Section 6.5.12 - Country_Info Message
        Sink_Capabilities_Extended = 0x0F,    ///< See Section 6.5.13 - Sink_Capabilities_Extended Message
        Extended_Control = 0x10,              ///< See Section 6.5.14 - Extended_Control Message
        EPR_Source_Capabilities = 0x11,       ///< See Section 6.5.15.2 - EPR_Source_Capabilities Message
        EPR_Sink_Capabilities = 0x12,         ///< See Section 6.5.15.3 - EPR_Sink_Capabilities Message
        // Reserved: 0x13 - 0x1D
        Vendor_Defined_Extended = 0x1E,       ///< See Section 6.5.16 - Vendor_Defined_Extended Message
        // Reserved: 0x1F
    };

    std::string controlMessageTypeToString(ControlMessageType type);
    std::string dataMessageTypeToString(DataMessageType type);
    std::string extendedMessageTypeToString(ExtendedMessageType type);
    
} // namespace T76::DRPD::Proto
