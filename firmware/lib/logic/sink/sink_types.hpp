/**
 * @file sink_types.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include <cstdint>


namespace T76::DRPD::Logic {

    enum class SinkInfoChange : uint32_t {
        PDOListUpdated,
        OtherInfoChanged
    };

    enum class SinkState : uint32_t {
        Unknown = 0xffffffff,
        Disconnected = 0,

        PE_SNK_Startup,
        PE_SNK_Discovery,
        PE_SNK_Wait_for_Capabilities,
        PE_SNK_Evaluate_Capability,
        PE_SNK_Select_Capability,
        PE_SNK_Transition_Sink,
        PE_SNK_Ready,
        PE_SNK_EPR_Mode_Entry,
        PE_SNK_Give_Sink_Cap,
        PE_SNK_Get_Source_Cap,
        PE_SNK_EPR_Keepalive,
        PE_SNK_Hard_Reset,
        PE_SNK_Transition_to_default,

        Error,
    };

    enum class SinkResetType : uint32_t {
        Internal,
        HardReset,
        SoftReset
    };

} // namespace T76::DRPD::Logic
