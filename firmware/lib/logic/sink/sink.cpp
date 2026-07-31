/**
 * @file sink.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "sink.hpp"

#include "../cc_bus_controller.hpp"


using namespace T76::DRPD;
using namespace T76::DRPD::Logic;


Sink::Sink(CCBusController& ccBusController, T76::DRPD::PHY::BMCDecoder& bmcDecoder,
           T76::DRPD::PHY::BMCEncoder& bmcEncoder) :
    _ccBusController(ccBusController),
    _bmcDecoder(bmcDecoder),
    _bmcEncoder(bmcEncoder),
    _disconnectedStateHandler(),
    _discoveryStateHandler(),
    _eprKeepaliveStateHandler(),
    _eprModeExitStateHandler(),
    _eprModeEntryStateHandler(),
    _getPPSStatusStateHandler(),
    _inquiryStateHandler(),
    _readySinkStateHandler(),
    _sendResponseStateHandler(),
    _sendSoftResetStateHandler(),
    _selectCapabilityStateHandler(),
    _startupStateHandler(),
    _transitionSinkStateHandler(),
    _transitionToDefaultStateHandler(),
    _waitForCapabilitiesStateHandler(),
    _alarmService(),
    _messageSender(
        bmcEncoder,
        _alarmService,
        std::bind(&Sink::_onMessageSenderStateChanged, this, std::placeholders::_1)),
    _timeoutEventCallback(std::bind(&Sink::_enqueueTimeoutEvent, this, std::placeholders::_1)),
    _context(
        _runtimeState,
        _alarmService,
        _messageSender,
        _ccBusController,
        _disconnectedStateHandler,
        _discoveryStateHandler,
        _eprKeepaliveStateHandler,
        _eprModeExitStateHandler,
        _eprModeEntryStateHandler,
        _getPPSStatusStateHandler,
        _inquiryStateHandler,
        _readySinkStateHandler,
        _sendResponseStateHandler,
        _sendSoftResetStateHandler,
        _selectCapabilityStateHandler,
        _startupStateHandler,
        _transitionSinkStateHandler,
        _transitionToDefaultStateHandler,
        _waitForCapabilitiesStateHandler,
        _sinkInfoChangedCallback,
        _sinkErrorCallback,
        _timeoutEventCallback) {

    queue_init(&_messageQueue, sizeof(const PHY::BMCDecodedMessage*), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);
    queue_init(&_timeoutEventQueue, sizeof(SinkTimeoutEvent), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);
    queue_init(&_pendingRequestQueue, sizeof(PendingPDORequest), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);
    queue_init(&_pendingInquiryQueue, sizeof(SinkInquiryRequest), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);

    reset();
}

void Sink::initCore1() {
    _alarmService.initCore1();
}

void Sink::loopCore1() {
    _processPendingPolicyRequests();
    _processPendingRequests();
    _processPendingInquiries();

    if (_ccBusResetPending.exchange(false, std::memory_order_acq_rel)) {
        reset();
    }

    const PHY::BMCDecodedMessage* messagePtr = nullptr;
    _processTimeoutEvents();

    while (queue_try_remove(&_messageQueue, &messagePtr)) {
        const auto decodedHeader = messagePtr->decodedHeader();
        _discardPendingOutgoingForReceivedSOP();

        if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Extended) {
            const auto maybeType = decodedHeader.extendedMessageType();
            if (!maybeType.has_value()) {
                reset(SinkResetType::SoftReset);
                continue;
            }

            Proto::ExtendedMessageType completedType = maybeType.value();
            const auto result = _handleExtendedMessageFragment(messagePtr, completedType);

            if (result == ExtendedFragmentResult::RecoveredMalformed) {
                _context.reportWarning(
                    "malformed PPS_Status declared Data Size 1; decoded 4-byte PPSSDB from packet payload"
                );
            }

            if (result == ExtendedFragmentResult::Malformed) {
                reset(SinkResetType::SoftReset);
                continue;
            }

            if (result == ExtendedFragmentResult::UnsupportedType) {
                if (_runtimeState._state == SinkState::PE_SNK_Ready) {
                    _context.sendNotSupportedResponse();
                } else {
                    reset(SinkResetType::SoftReset);
                }
                continue;
            }

            if (result == ExtendedFragmentResult::UnsupportedChunk) {
                if (_runtimeState._state == SinkState::PE_SNK_Ready) {
                    _startChunkingNotSupportedTimer();
                } else {
                    reset(SinkResetType::SoftReset);
                }
                continue;
            }

            if (result == ExtendedFragmentResult::InProgress) {
                continue;
            }
        }

        if ((_runtimeState._state == SinkState::PE_SNK_Startup ||
             _runtimeState._state == SinkState::PE_SNK_Discovery ||
             _runtimeState._state == SinkState::PE_SNK_Transition_To_Default) &&
            decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
            const auto dataType = decodedHeader.dataMessageType();
            if (dataType.has_value() &&
                dataType.value() == Proto::DataMessageType::Source_Capabilities) {
                // A valid Source_Capabilities packet proves VBUS recovery may
                // have completed ahead of the filtered local measurement.
                _context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
            }
        }

        if (_runtimeState._currentStateHandler) {
            _runtimeState._currentStateHandler->handleMessage(_context, messagePtr);
        }

        _processTimeoutEvents();
    }

    if (_runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->run(_context);
    }
}

void Sink::_discardPendingOutgoingForReceivedSOP() {
    if (!_messageSender.hasPendingMessage()) {
        return;
    }

    // USB-PD 3.2 section 6.11 requires a received SOP message to discard any
    // pending outgoing SOP message instead of continuing to retry it.
    _context.abandonPendingMessage();

    if (_runtimeState._state == SinkState::PE_SNK_Send_Response) {
        _context.transitionTo(SinkState::PE_SNK_Ready);
    }
}

Sink::~Sink() {
    disable();

    reset();

    queue_free(&_messageQueue);
    queue_free(&_timeoutEventQueue);
    queue_free(&_pendingRequestQueue);
    queue_free(&_pendingInquiryQueue);
}

void Sink::enable() {
    if (_enabled.load()) {
        return;
    }

    reset();
    _ccBusResetPending.store(false, std::memory_order_release);

    // Register callbacks only after queue initialization.
    _bmcDecoder.messageReceivedCallbackCore1(std::bind(&Sink::_onMessageReceived, this,
        std::placeholders::_1));
    _stateChangedCallbackId = _ccBusController.addStateChangedCallback(
        std::bind(&Sink::_onCCBusStateChanged, this, std::placeholders::_1)
    );
    _enabled.store(true);
}

void Sink::disable() {
    if (!_enabled.load()) {
        return;
    }

    // Unregister callbacks first so no new work is queued during teardown.
    _bmcDecoder.messageReceivedCallbackCore1(nullptr);
    _ccBusController.removeStateChangedCallback(_stateChangedCallbackId);
    _stateChangedCallbackId = 0;
    _enabled.store(false);

    const PHY::BMCDecodedMessage* dropped = nullptr;
    while (queue_try_remove(&_messageQueue, &dropped)) {
    }
    SinkTimeoutEvent droppedEvent{};
    while (queue_try_remove(&_timeoutEventQueue, &droppedEvent)) {
    }
    PendingPDORequest droppedRequest{};
    while (queue_try_remove(&_pendingRequestQueue, &droppedRequest)) {
    }
    SinkInquiryRequest droppedInquiry{};
    while (queue_try_remove(&_pendingInquiryQueue, &droppedInquiry)) {
    }
    _inquiryQueued.store(false, std::memory_order_release);
    _ccBusResetPending.store(false, std::memory_order_release);
    _eprExitPending.store(false, std::memory_order_release);

    reset();
}

bool Sink::enabled() const {
    return _enabled.load();
}

void Sink::_processTimeoutEvents() {
    SinkTimeoutEvent event{};
    while (queue_try_remove(&_timeoutEventQueue, &event)) {
        if (!_enabled.load()) {
            continue;
        }

        if (event.type == SinkTimeoutEventType::InquiryResponseTimeout ||
            event.type == SinkTimeoutEventType::InquirySinkTxOKRetryTimeout) {
            const SinkInquiryStatus status = _runtimeState.inquiryResult().status;
            if (_runtimeState._state != SinkState::PE_SNK_Inquiry ||
                status.outcome != SinkInquiryOutcome::Pending ||
                status.id != event.inquiryId) {
                continue;
            }
        }

        if (event.type == SinkTimeoutEventType::GoodCRCTimeout) {
            _handleMessageSenderStateChangedPolicyContext(SinkMessageSenderState::GoodCRCTimeout);
            continue;
        }

        if (event.type == SinkTimeoutEventType::ChunkingNotSupportedTimeout) {
            if (_chunkingNotSupportedPending &&
                _runtimeState._state == SinkState::PE_SNK_Ready) {
                _chunkingNotSupportedPending = false;
                _context.sendNotSupportedResponse();
            }
            continue;
        }

        if (_runtimeState._currentStateHandler) {
            _runtimeState._currentStateHandler->handleTimeoutEvent(_context, event.type);
        }
    }
}

int64_t Sink::_onChunkingNotSupportedTimeout(alarm_id_t id, void *userData) {
    (void)id;
    auto *sink = static_cast<Sink *>(userData);
    sink->_chunkingNotSupportedAlarmId = -1;
    if (sink->_chunkingNotSupportedPending) {
        sink->_enqueueTimeoutEvent(SinkTimeoutEvent{SinkTimeoutEventType::ChunkingNotSupportedTimeout});
    }
    return 0;
}

void Sink::_startChunkingNotSupportedTimer() {
    if (_chunkingNotSupportedAlarmId != -1) {
        _alarmService.cancelAlarm(_chunkingNotSupportedAlarmId);
    }

    _chunkingNotSupportedPending = true;
    _chunkingNotSupportedAlarmId = _alarmService.addAlarmInUs(
        LOGIC_SINK_CHUNKING_NOT_SUPPORTED_TIMEOUT_US,
        _onChunkingNotSupportedTimeout,
        this,
        true
    );
}

void Sink::_onCCBusStateChanged(CCBusState newState) {
    (void)newState;

    if (!_enabled.load()) {
        return;
    }

    _ccBusResetPending.store(true, std::memory_order_release);
}

void Sink::_enqueueTimeoutEvent(SinkTimeoutEvent event) {
    (void)queue_try_add(&_timeoutEventQueue, &event);
}

void Sink::_processPendingRequests() {
    if (_runtimeState._state == SinkState::PE_SNK_Send_EPR_Mode_Exit) {
        return;
    }

    PendingPDORequest request{};
    while (queue_try_remove(&_pendingRequestQueue, &request)) {
        if (!_enabled.load()) {
            continue;
        }

        (void)_context.requestPDO(request.pdoIndex, request.voltageMV, request.currentMA);
    }
}

void Sink::_processPendingPolicyRequests() {
    if (!_eprExitPending.exchange(false, std::memory_order_acq_rel)) {
        return;
    }

    if (!_enabled.load()) {
        return;
    }

    if (!_runtimeState._eprModeActive) {
        return;
    }

    if (!_context.eprExitContractReady()) {
        _runtimeState._eprSourceExitRequested = true;
        (void)_context.requestPDO(0, 0, 0);
        return;
    }

    _context.transitionTo(SinkState::PE_SNK_Send_EPR_Mode_Exit);
}

void Sink::_processPendingInquiries() {
    if (!_enabled.load() || _ccBusResetPending.load(std::memory_order_acquire) ||
        _runtimeState._state != SinkState::PE_SNK_Ready) {
        return;
    }
    SinkInquiryRequest request{};
    if (!queue_try_remove(&_pendingInquiryQueue, &request)) {
        return;
    }
    _inquiryQueued.store(false, std::memory_order_release);
    _runtimeState.beginInquiry(request);
    _context.transitionTo(SinkState::PE_SNK_Inquiry);
}
