/**
 * @file sink_runtime_state.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This header defines the mutable runtime state container for Sink policy.
 *
 * It intentionally contains only data (plus reset defaults) and no protocol
 * orchestration logic. The goal is to keep state ownership explicit and easy
 * to audit:
 * - current policy state and active handler pointer,
 * - source/EPR capabilities caches,
 * - pending/negotiated request tracking,
 * - EPR and explicit-contract flags,
 * - message deduplication state,
 * - extended-message chunk reassembly buffers.
 */

#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <span>

#include <pico/time.h>

#include "sink_types.hpp"

#include "../../proto/pd_messages/epr_source_capabilities.hpp"
#include "../../proto/pd_messages/source_capabilities.hpp"
#include "../../proto/pd_message_types.hpp"


namespace T76::DRPD::Logic {

    class SinkStateHandler;

    class SinkRuntimeState {
    public:
        /**
         * @brief Static byte buffer used for extended payload storage.
         */
        struct ExtendedPayloadBuffer {
            std::array<uint8_t, LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES> bytes = {};
            size_t length = 0;

            [[nodiscard]] std::span<const uint8_t> span() const;
            void clear();
        };

        /**
         * @brief Tracked extended message types for static reassembly storage.
         */
        enum class TrackedExtendedType : uint8_t {
            EPRSourceCapabilities = 0,
            ExtendedControl = 1
        };

        /**
         * @brief One in-flight reassembly tracker for a specific extended message type.
         */
        struct ExtendedReassemblyState {
            bool active = false; ///< True while chunk reassembly is active
            uint16_t expectedPayloadBytes = 0;                  ///< Expected payload bytes.
            size_t contiguousPayloadBytes = 0;                  ///< Bytes assembled so far.
            uint8_t lastAcceptedChunkNumber = 0;                ///< Last accepted chunk number.
            absolute_time_t lastChunkTimestamp = {0};           ///< Last accepted chunk timestamp.
            ExtendedPayloadBuffer payload;                      ///< Reassembly payload bytes.
        };

        /**
         * @brief Construct runtime state with default values.
         */
        SinkRuntimeState();

        /**
         * @brief Reset all sink runtime fields to defaults.
         */
        void reset();

        /**
         * @brief Resolve tracked slot index for supported extended message type.
         * @param type Extended message type to map.
         * @return Slot index if tracked; otherwise std::nullopt.
         */
        [[nodiscard]] static std::optional<size_t> trackedTypeIndex(Proto::ExtendedMessageType type);

        SinkState _state;                                         ///< Current policy state.
        SinkStateHandler* _currentStateHandler;                   ///< Active state handler pointer.

        std::optional<Proto::SourceCapabilities> _sourceCapabilities;      ///< Cached SPR capabilities.
        std::optional<Proto::EPRSourceCapabilities> _eprCapabilities;      ///< Cached EPR capabilities.

        std::optional<Proto::PDOVariant> _pendingRequestedPDO;    ///< Pending request PDO.
        float _pendingVoltage = 0.0f;                             ///< Pending request voltage (mV context).
        float _pendingCurrent = 0.0f;                             ///< Pending request current (mA context).

        std::optional<Proto::PDOVariant> _negotiatedPDO;          ///< Current negotiated PDO.
        float _negotiatedVoltage = 0.0f;                          ///< Negotiated voltage.
        float _negotiatedCurrent = 0.0f;                          ///< Negotiated current.

        bool _hasExplicitContract = false;                        ///< True after first explicit contract.
        bool _eprModeActive = false;                              ///< True while in EPR mode.
        bool _eprEntryAttempted = false;                          ///< True once EPR entry attempted.
        bool _sourceSupportsEpr = false;                          ///< Source SPR advertises EPR support.

        bool _hasLastReceivedMessageId = false;                   ///< Dedup state flag for message ID.
        uint8_t _lastReceivedMessageId = 0;                       ///< Last processed message ID.

        std::array<ExtendedReassemblyState, 2> _extendedReassemblyStates; ///< Per-type reassembly.
        std::array<std::optional<ExtendedPayloadBuffer>, 2> _completedExtendedPayloads; ///< Completed payloads.
    };

} // namespace T76::DRPD::Logic
