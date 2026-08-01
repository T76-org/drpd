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

#include <cstddef>
#include <array>
#include <cstdint>
#include <functional>
#include <optional>


namespace T76::DRPD::Logic {

    enum class SinkInquiryType : uint32_t {
        GetRevision = 0,
        GetSourceCapabilities,
        GetSourceCapabilitiesExtended,
        GetStatus,
        GetSourceInfo,
        GetPPSStatus,
        GetManufacturerInfo,
        GetCountryCodes,
        GetCountryInfo,
    };

    enum class SinkInquiryTarget : uint32_t {
        Port = 0,
        Battery = 1,
    };

    /** Fixed, queue-safe parameters shared by typed inquiry descriptors. */
    struct SinkInquiryParameters {
        uint32_t target = 0;
        uint32_t argument = 0;
        std::array<uint8_t, 4> selector = {};
    };

    enum class SinkInquiryOutcome : uint32_t {
        None, Pending, Response, NotSupported, Rejected, Wait,
        GoodCRCTimeout, ResponseTimeout, ProtocolError, MalformedResponse,
        ResponseTooLarge, Aborted
    };

    struct SinkInquiryRequest {
        uint32_t id = 0;
        SinkInquiryType type = SinkInquiryType::GetRevision;
        SinkInquiryParameters parameters;
    };

    struct SinkInquiryStatus {
        SinkInquiryOutcome outcome = SinkInquiryOutcome::None;
        uint32_t id = 0;
        SinkInquiryType type = SinkInquiryType::GetRevision;
        uint32_t responseClass = 0;
        uint32_t responseType = 0;
        uint32_t responseLength = 0;
        uint32_t warningFlags = 0;
    };

    struct SinkInquiryResult {
        SinkInquiryStatus status;
        SinkInquiryParameters parameters;
        std::array<uint8_t, LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES> response = {};
    };

    /**
     * @brief Sink information change notifications for higher-level consumers.
     */
    enum class SinkInfoChange : uint32_t {
        PDOListUpdated,     ///< Source/EPR PDO list changed.
        OtherInfoChanged,   ///< Non-PDO sink state changed.
        RequestOutcomeUpdated ///< Last Sink request outcome changed.
    };

    /**
     * @brief Host-visible outcome for the most recent Sink PDO request.
     */
    enum class SinkRequestOutcome : uint32_t {
        None,         ///< No Sink request has been attempted.
        Pending,      ///< Request has been dispatched and is awaiting Source response.
        Accepted,     ///< Source accepted the request.
        Rejected,     ///< Source rejected the request.
        Wait,         ///< Source replied Wait to the request.
        NotSupported, ///< Source replied Not_Supported to the request.
        Timeout       ///< Source did not respond before SenderResponseTimer expired.
    };

    /**
     * @brief Snapshot of the most recent Sink PDO request and Source outcome.
     */
    struct SinkRequestStatus {
        SinkRequestOutcome outcome = SinkRequestOutcome::None; ///< Latest request outcome.
        size_t pdoIndex = 0;                                   ///< Requested active-view PDO index.
        uint32_t voltageMV = 0;                                ///< Requested voltage in millivolts.
        uint32_t currentMA = 0;                                ///< Requested current in milliamps.
    };

    /**
     * @brief Source Rp collision-avoidance permission observed by a Sink.
     */
    enum class SinkTransmitPermission : uint32_t {
        Unknown,  ///< No attached Source/current Rp classification is available.
        SinkTxNG, ///< Source advertises Sink transmit no-go.
        SinkTxOK  ///< Source advertises Sink transmit OK.
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
        PE_SNK_Send_Soft_Reset,             ///< Send Soft_Reset and wait for Accept.
        PE_SNK_Evaluate_Capability,         ///< Evaluate received capabilities.
        PE_SNK_Select_Capability,           ///< Send Request for chosen PDO.
        PE_SNK_Transition_Sink,             ///< Wait for PS_RDY after Accept.
        PE_SNK_Ready,                       ///< Contract established and stable.
        PE_SNK_Send_EPR_Mode_Entry,         ///< Send EPR mode entry request.
        PE_SNK_EPR_Mode_Wait_For_Response,  ///< Wait for EPR mode entry result.
        PE_SNK_Send_EPR_Mode_Exit,          ///< Send EPR mode exit request.
        PE_SNK_Give_Sink_Cap,               ///< Provide sink capabilities.
        PE_SNK_Get_Source_Cap,              ///< Request source capabilities.
        PE_SNK_Get_PPS_Status,              ///< Request Source PPS status.
        PE_SNK_EPR_Keepalive,               ///< EPR keepalive maintenance.
        PE_SNK_Hard_Reset,                  ///< Hard reset processing.
        PE_SNK_Transition_To_Default,       ///< Transition to default state.
        PE_SNK_Send_Response,               ///< Send Ready-originated response and wait for GoodCRC.
        PE_SNK_Inquiry,                     ///< Host-requested Source inquiry.

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

    enum class SinkDiagnosticSeverity : uint8_t {
        Error,
        Warning
    };

    /**
     * @brief Sink-originated error notification for higher-level event publishers.
     */
    struct SinkErrorEvent {
        const char *reason = nullptr;                       ///< Static diagnostic reason.
        SinkState state = SinkState::Unknown;               ///< State when the error was observed.
        std::optional<SinkResetType> resetType = std::nullopt; ///< Reset caused by the error, if any.
        SinkDiagnosticSeverity severity = SinkDiagnosticSeverity::Error; ///< Diagnostic severity.
    };

    /**
     * @brief Callback used to publish Sink-originated errors.
     */
    using SinkErrorCallback = std::function<void(const SinkErrorEvent&)>;

    /**
     * @brief Timeout events produced by Sink timer callbacks.
     */
    enum class SinkTimeoutEventType : uint32_t {
        GoodCRCTimeout,
        WaitForCapabilitiesTimeout,
        SoftResetResponseTimeout,
        SelectCapabilityResponseTimeout,
        TransitionSinkTimeout,
        ReadySinkRequestTimeout,
        ReadyPDORefreshTimeout,
        GetPPSStatusResponseTimeout,
        EPRModeEntrySenderResponseTimeout,
        EPRModeEntryTimeout,
        EPRKeepaliveIntervalTimeout,
        EPRKeepaliveResponseTimeout,
        EPRSourceWatchdogTimeout,
        ChunkingNotSupportedTimeout,
        SinkTxOKRetryTimeout,
        InquiryResponseTimeout,
        InquirySinkTxOKRetryTimeout
    };

    /**
     * @brief Envelope queued by timer callbacks for task-context handling.
     */
    struct SinkTimeoutEvent {
        SinkTimeoutEventType type;
        uint32_t inquiryId = 0; ///< Inquiry generation for inquiry-owned timers.
    };

    /**
     * @brief Result for host/policy Sink PDO request attempts.
     *
     * Request APIs use this lightweight result instead of a bare boolean so
     * callers can preserve simple success checks while surfacing a static
     * diagnostic string for rejected requests.
     */
    struct SinkRequestResult {
        bool success = false;          ///< True when the request was accepted or dispatched.
        const char *error = nullptr;   ///< Static error description when success is false.

        /**
         * @brief Construct a successful request result.
         * @return Successful SinkRequestResult.
         */
        static constexpr SinkRequestResult ok() {
            return SinkRequestResult{true, nullptr};
        }

        /**
         * @brief Construct a failed request result.
         * @param message Static error message describing the rejection.
         * @return Failed SinkRequestResult with diagnostic text.
         */
        static constexpr SinkRequestResult failure(const char *message) {
            return SinkRequestResult{false, message};
        }

        /**
         * @brief Allow result objects to be used in boolean checks.
         * @return True when the request succeeded.
         */
        explicit constexpr operator bool() const {
            return success;
        }
    };

} // namespace T76::DRPD::Logic
