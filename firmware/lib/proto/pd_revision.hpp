/**
 * @file pd_revision.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include "pd_header.hpp"
#include "pd_message_types.hpp"

namespace T76::DRPD::Proto {

    constexpr PDHeader::SpecRevision negotiatedSpecRevision(
        PDHeader::SpecRevision partnerRevision,
        PDHeader::SpecRevision localMaximum = PDHeader::SpecRevision::Rev3_x) {
        return static_cast<uint8_t>(partnerRevision) < static_cast<uint8_t>(localMaximum)
            ? partnerRevision
            : localMaximum;
    }

    constexpr ControlMessageType unsupportedControlResponse(PDHeader::SpecRevision revision) {
        return revision == PDHeader::SpecRevision::Rev2_0
            ? ControlMessageType::Reject
            : ControlMessageType::Not_Supported;
    }

} // namespace T76::DRPD::Proto
