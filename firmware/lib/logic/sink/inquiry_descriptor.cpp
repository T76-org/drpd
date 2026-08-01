#include "inquiry_descriptor.hpp"
#include "sink_types.hpp"

namespace T76::DRPD::Logic {

std::optional<SinkInquiryDescriptor> sinkInquiryDescriptor(SinkInquiryType type) {
    switch (type) {
        case SinkInquiryType::GetRevision:
            return SinkInquiryDescriptor{
                .type = type,
                .token = "GET_REVISION",
                .requestClass = InquiryMessageClass::Control,
                .requestMessageType = 0x18,
                .requestDataObjects = 0,
                .response = {InquiryMessageClass::Data, 0x0c, 1, 1},
                .responseTimeoutUs = LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US,
                .requiresExplicitContract = true,
                .acceptsParameters = false,
            };
    }
    return std::nullopt;
}

std::optional<SinkInquiryDescriptor> sinkInquiryDescriptor(std::string_view token) {
    const auto getRevision = sinkInquiryDescriptor(SinkInquiryType::GetRevision);
    if (getRevision.has_value() && token == getRevision->token) {
        return getRevision;
    }
    return std::nullopt;
}

}
