/**
 * @file sink_types.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Shared Sink logic enums live here so runtime state, context, handlers, and
 * orchestrator classes can depend on one canonical set of type definitions.
 *
 * Keeping these enums isolated avoids circular include pressure between Sink
 * policy modules while preserving readable type names in public/protected APIs.
 */

#pragma once

#include <cstdint>


namespace T76::DRPD::Logic {

    /**
     * @brief Sink information change notifications for higher-level consumers.
     */
    enum class SinkInfoChange : uint32_t {
        PDOListUpdated,     ///< Source/EPR PDO list changed.
        OtherInfoChanged    ///< Non-PDO sink state changed.
    };

    /**
     * @brief High-level policy engine states for Sink mode.
     */
    enum class SinkState : uint32_t {
        Unknown = 0xffffffff,               ///< Unknown/uninitialized state.
        Disconnected = 0,                   ///< No attach; idle policy behavior.

        PE_SNK_Startup,                     ///< PD startup state.
        PE_SNK_Discovery,                   ///< PD discovery state.
        PE_SNK_Wait_for_Capabilities,       ///< Wait for Source_Capabilities.
        PE_SNK_Evaluate_Capability,         ///< Evaluate received capabilities.
        PE_SNK_Select_Capability,           ///< Send Request for chosen PDO.
        PE_SNK_Transition_Sink,             ///< Wait for PS_RDY after Accept.
        PE_SNK_Ready,                       ///< Contract established and stable.
        PE_SNK_EPR_Mode_Entry,              ///< EPR mode entry handshake.
        PE_SNK_Give_Sink_Cap,               ///< Provide sink capabilities.
        PE_SNK_Get_Source_Cap,              ///< Request source capabilities.
        PE_SNK_EPR_Keepalive,               ///< EPR keepalive maintenance.
        PE_SNK_Hard_Reset,                  ///< Hard reset processing.
        PE_SNK_Transition_to_default,       ///< Transition to default state.

        Error,                              ///< Error/fault state.
    };

    /**
     * @brief Supported reset actions that can be initiated by Sink logic.
     */
    enum class SinkResetType : uint32_t {
        Internal,   ///< Internal software reset without protocol reset command.
        HardReset,  ///< Protocol hard reset sequence.
        SoftReset   ///< Protocol soft reset message.
    };

    /**
     * @brief Timeout events produced by Sink timer callbacks.
     */
    enum class SinkTimeoutEventType : uint32_t {
        GoodCRCTimeout,
        WaitForCapabilitiesTimeout,
        SelectCapabilityResponseTimeout,
        TransitionSinkTimeout,
        ReadySinkRequestTimeout,
        ReadyPdoRefreshTimeout,
        EprModeEntryTimeout,
        EprKeepaliveIntervalTimeout,
        EprSourceWatchdogTimeout
    };

    /**
     * @brief Envelope queued by timer callbacks for task-context handling.
     */
    struct SinkTimeoutEvent {
        SinkTimeoutEventType type;
    };

} // namespace T76::DRPD::Logic
