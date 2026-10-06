/**
 * @file cable_test_controller.hpp
 * Single-ended Port 1 e-marker identity discovery, independent of Sink policy.
 * Core 1 owns GPIO sequencing, protocol delivery and copied response storage.
 * Core 0 requests start/stop and reads coherent snapshots. Stop waits for core 1
 * to cancel traffic before another role may take over. A three-second poll lease
 * shuts down abandoned sessions. Results retain advertised ratings only; Ra and
 * timeout never prove the absence of a marker. VCONN is removed after discovery
 * and Ra monitoring resumes for removal detection. Extend identity validation and
 * the public snapshot together when adding protocol capabilities.
 */
#pragma once
#include <array>
#include <atomic>
#include <optional>
#include <pico/critical_section.h>
#include "../phy/analog_monitor.hpp"
#include "../phy/cc_role_manager.hpp"
#include "../phy/cc_bus_manager.hpp"
#include "../phy/bmc_decoder.hpp"
#include "../phy/bmc_encoder.hpp"
#include "sink/message_transport_state.hpp"

namespace T76::DRPD::Logic {
    /** Current single-ended discovery state. */
    enum class CableTestOutcome {
        Disabled, Waiting, Discovering, Identity, NoResponse, ResponseTimeout,
        NAK, Malformed, PowerFault, UnsupportedConnection
    };
    /** Fixed-size coherent snapshot shared with SCPI. */
    struct CableTestResult {
        uint32_t generation = 0; ///< Insertion/session identifier.
        CableTestOutcome outcome = CableTestOutcome::Disabled; ///< Diagnostic evidence.
        uint8_t vconnContact = 0; ///< VCONN contact (1/2), zero without Ra evidence.
        bool goodCRC = false; ///< At least one matching GoodCRC received.
        uint8_t revision = 2; ///< PD header revision encoding (1=2.0, 2=3.x).
        uint8_t length = 0; ///< Response body length.
        std::array<uint8_t, 28> body = {}; ///< Owned response, including VDM header.
    };
    /** Own transient cable test hardware and protocol operation. */
    class CableTestController {
    public:
        /** Construct controller; no electrical changes occur here.
         * @param analog Existing ADC readings.
         * @param roles CC termination and VCONN manager.
         * @param bus DUT communication route and Port 2 isolation.
         * @param decoder Shared PD receiver.
         * @param encoder Shared PD transmitter.
         */
        CableTestController(PHY::AnalogMonitor& analog, PHY::CCRoleManager& roles,
            PHY::CCBusManager& bus, PHY::BMCDecoder& decoder, PHY::BMCEncoder& encoder);
        /** Mark core-1 loop ready for synchronized shutdown. */
        void initCore1();
        /** Start or synchronously stop the transient test.
         * @param enabled Desired operation state.
         */
        void enabled(bool enabled);
        /** Query desired session state.
         * @return True while host requests Cable Test.
         */
        bool requested() const { return _requested.load(); }
        /** Service electrical detection and protocol deadlines on core 1. */
        void loopCore1();
        /** Renew the host lease and copy a coherent result.
         * @return Complete current insertion result.
         */
        CableTestResult result();
        /** Read snapshot without renewing host lease.
         * @return Current published result.
         */
        CableTestResult snapshot();
        /** Convert outcome to the stable SCPI token.
         * @param outcome Diagnostic outcome.
         * @return Uppercase public token.
         */
        static const char* outcomeName(CableTestOutcome outcome);
    protected:
        PHY::AnalogMonitor& _analog; ///< ADC source.
        PHY::CCRoleManager& _roles; ///< CC hardware.
        PHY::CCBusManager& _bus; ///< Routing hardware.
        PHY::BMCDecoder& _decoder; ///< Shared decoder.
        PHY::BMCEncoder& _encoder; ///< Shared encoder.
        std::atomic<bool> _requested{false}; ///< Core-0 requested state.
        std::atomic<bool> _running{false}; ///< Core-1 shutdown acknowledgement.
        std::atomic<uint32_t> _stopSequence{0}; ///< Requested shutdown generation.
        std::atomic<uint32_t> _stopAck{0}; ///< Completed shutdown generation.
        std::atomic<bool> _ready{false}; ///< Core-1 initialized flag.
        std::atomic<uint32_t> _leaseMs{0}; ///< Last host poll timestamp, wrap safe.
        critical_section_t _snapshotLock; ///< Cross-core result copy lock.
        CableTestResult _result; ///< Core-1 owned mutable result.
        CableTestResult _snapshot; ///< Published result.
        SinkMessageTransportState _transport; ///< SOP-prime MessageID and retries.
        std::optional<PHY::BMCEncodedMessage> _pending; ///< Copied outgoing request.
        uint64_t _deadline = 0; ///< Next protocol deadline.
        uint64_t _scanAt = 0; ///< Next ADC probe deadline.
        uint64_t _retryAt = 0; ///< Earliest permitted identity retry.
        uint8_t _candidate = 0; ///< Debounced VCONN contact.
        uint8_t _debounce = 0; ///< Stable Ra probe count.
        uint8_t _attempts = 0; ///< Bounded identity attempts per revision.
        bool _powered = false; ///< VCONN is presently enabled.
        bool _waitingResponse = false; ///< Request delivery confirmed.
        bool _legacy = false; ///< PD 2.0 fallback selected.
        int _lastMessageId = -1; ///< Duplicate receive suppression.
        /** Publish a short, bounded snapshot. */
        void _publish();
        /** Put both contacts under Rp after removing VCONN. */
        void _probe();
        /** Build/send Discover Identity on SOP-prime. */
        void _sendIdentity();
        /** Complete discovery and resume unpowered Ra monitoring.
         * @param outcome Diagnostic terminal state.
         */
        void _finish(CableTestOutcome outcome);
        /** Retry discovery or finish after bounded attempts. */
        void _retry();
        /** Process a valid message immediately on core 1.
         * @param message Decoder-owned incoming packet; payload copied before returning.
         */
        void _received(const PHY::BMCDecodedMessage* message);
    };
}
