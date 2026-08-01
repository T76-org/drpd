#include "inquiry_descriptor.hpp"
#include "sink_types.hpp"

#include <array>

namespace T76::DRPD::Logic {

namespace {
constexpr uint8_t rev1 = 0;
constexpr uint8_t rev3 = 2;

const std::array<SinkInquiryDescriptor, 11> descriptors{{
    {SinkInquiryType::GetRevision, "GET_REVISION", InquiryMessageClass::Control,
        0x18, 0, {InquiryMessageClass::Data, 0x0c, 1, 1},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 4, 4, true, rev3, false, InquiryParameterKind::None,
        InquiryCacheKind::None, InquiryWarningNone},
    {SinkInquiryType::GetSourceCapabilities, "GET_SOURCE_CAP", InquiryMessageClass::Control,
        0x07, 0, {InquiryMessageClass::Data, 0x01, 1, 7},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 4, 28, true, rev1, false, InquiryParameterKind::None,
        InquiryCacheKind::SourceCapabilities, InquiryWarningNone},
    {SinkInquiryType::GetSourceCapabilitiesExtended, "GET_SOURCE_CAP_EXTENDED", InquiryMessageClass::Control,
        0x11, 0, {InquiryMessageClass::Extended, 0x01, 1, 7},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 24, 25, true, rev3, false, InquiryParameterKind::None,
        InquiryCacheKind::SourceCapabilitiesExtended, InquiryWarningNone},
    {SinkInquiryType::GetStatus, "GET_STATUS", InquiryMessageClass::Control,
        0x12, 0, {InquiryMessageClass::Extended, 0x02, 1, 7},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 6, 7, true, rev3, false, InquiryParameterKind::None,
        InquiryCacheKind::Status, InquiryWarningStatusReadClearsEvents},
    {SinkInquiryType::GetSourceInfo, "GET_SOURCE_INFO", InquiryMessageClass::Control,
        0x17, 0, {InquiryMessageClass::Data, 0x0b, 1, 1},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 4, 4, true, rev3, false, InquiryParameterKind::None,
        InquiryCacheKind::None, InquiryWarningNone},
    {SinkInquiryType::GetPPSStatus, "GET_PPS_STATUS", InquiryMessageClass::Control,
        0x14, 0, {InquiryMessageClass::Extended, 0x0c, 1, 7},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 4, 4, true, rev3, true, InquiryParameterKind::None,
        InquiryCacheKind::PPSStatus, InquiryWarningNone},
    {SinkInquiryType::GetManufacturerInfo, "GET_MANUFACTURER_INFO", InquiryMessageClass::Extended,
        0x06, 1, {InquiryMessageClass::Extended, 0x07, 1, 7},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 5, 26, true, rev3, false,
        InquiryParameterKind::ManufacturerInfo, InquiryCacheKind::None, InquiryWarningNone},
    {SinkInquiryType::GetCountryCodes, "GET_COUNTRY_CODES", InquiryMessageClass::Control,
        0x15, 0, {InquiryMessageClass::Extended, 0x0e, 1, 7},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 4, 26, true, rev3, false,
        InquiryParameterKind::None, InquiryCacheKind::None, InquiryWarningNone},
    {SinkInquiryType::GetCountryInfo, "GET_COUNTRY_INFO", InquiryMessageClass::Data,
        0x07, 1, {InquiryMessageClass::Extended, 0x0d, 1, 7},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 4, 26, true, rev3, false,
        InquiryParameterKind::CountryCode, InquiryCacheKind::None, InquiryWarningNone},
    {SinkInquiryType::GetBatteryCapabilities, "GET_BATTERY_CAP", InquiryMessageClass::Extended,
        0x03, 1, {InquiryMessageClass::Extended, 0x05, 1, 7},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 9, 9, true, rev3, false,
        InquiryParameterKind::BatteryReference, InquiryCacheKind::None, InquiryWarningNone},
    {SinkInquiryType::GetBatteryStatus, "GET_BATTERY_STATUS", InquiryMessageClass::Extended,
        0x04, 1, {InquiryMessageClass::Data, 0x05, 1, 1},
        LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, 4, 4, true, rev3, false,
        InquiryParameterKind::BatteryReference, InquiryCacheKind::None, InquiryWarningNone},
}};
}

std::optional<SinkInquiryDescriptor> sinkInquiryDescriptor(SinkInquiryType type) {
    for (const auto& descriptor : descriptors) {
        if (descriptor.type == type) return descriptor;
    }
    return std::nullopt;
}

std::optional<SinkInquiryDescriptor> sinkInquiryDescriptor(std::string_view token) {
    for (const auto& descriptor : descriptors) {
        if (token == descriptor.token) return descriptor;
    }
    return std::nullopt;
}

}
