/**
 * @file sink_runtime_state.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <vector>

#include <pico/time.h>

#include "sink_types.hpp"

#include "../../proto/pd_messages/epr_source_capabilities.hpp"
#include "../../proto/pd_messages/source_capabilities.hpp"


namespace T76::DRPD::Logic {

    class SinkStateHandler;

    class SinkRuntimeState {
    public:
        struct ExtendedReassemblyState {
            bool active = false; ///< True while chunk reassembly is active
            uint16_t expectedPayloadBytes = 0;                  ///< Expected payload bytes.
            size_t contiguousPayloadBytes = 0;                  ///< Bytes assembled so far.
            uint8_t lastAcceptedChunkNumber = 0;                ///< Last accepted chunk number.
            absolute_time_t lastChunkTimestamp = {0};           ///< Last accepted chunk timestamp.
            std::vector<uint8_t> payload;                       ///< Reassembly payload bytes.
        };

        SinkRuntimeState();

        void reset();

        SinkState _state;
        SinkStateHandler* _currentStateHandler;

        std::optional<Proto::SourceCapabilities> _sourceCapabilities;
        std::optional<Proto::EPRSourceCapabilities> _eprCapabilities;

        std::optional<Proto::PDOVariant> _pendingRequestedPDO;
        float _pendingVoltage = 0.0f;
        float _pendingCurrent = 0.0f;

        std::optional<Proto::PDOVariant> _negotiatedPDO;
        float _negotiatedVoltage = 0.0f;
        float _negotiatedCurrent = 0.0f;

        bool _hasExplicitContract = false;
        bool _eprModeActive = false;
        bool _eprEntryAttempted = false;
        bool _sourceSupportsEpr = false;

        bool _hasLastReceivedMessageId = false;
        uint8_t _lastReceivedMessageId = 0;

        std::array<ExtendedReassemblyState, 32> _extendedReassemblyStates;
        std::array<std::optional<std::vector<uint8_t>>, 32> _completedExtendedPayloads;
    };

} // namespace T76::DRPD::Logic
