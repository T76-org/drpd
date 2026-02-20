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
    _eprKeepaliveStateHandler(),
    _eprModeEntryStateHandler(),
    _readySinkStateHandler(),
    _selectCapabilityStateHandler(),
    _transitionSinkStateHandler(),
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
        _eprKeepaliveStateHandler,
        _eprModeEntryStateHandler,
        _readySinkStateHandler,
        _selectCapabilityStateHandler,
        _transitionSinkStateHandler,
        _waitForCapabilitiesStateHandler,
        _sinkInfoChangedCallback,
        _timeoutEventCallback) {

    queue_init(&_messageQueue, sizeof(const PHY::BMCDecodedMessage*), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);
    queue_init(&_timeoutEventQueue, sizeof(SinkTimeoutEvent), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);
    queue_init(&_pendingRequestQueue, sizeof(PendingPDORequest), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);

    reset();
}

void Sink::initCore1() {
    _alarmService.initCore1();
}

void Sink::loopCore1() {
    _processPendingRequests();

    if (_ccBusResetPending.exchange(false, std::memory_order_acq_rel)) {
        reset();
    }

    const PHY::BMCDecodedMessage* messagePtr = nullptr;
    _processTimeoutEvents();

    while (queue_try_remove(&_messageQueue, &messagePtr)) {
        const auto decodedHeader = messagePtr->decodedHeader();

        if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Extended) {
            const auto maybeType = decodedHeader.extendedMessageType();
            if (!maybeType.has_value()) {
                reset(SinkResetType::SoftReset);
                continue;
            }

            Proto::ExtendedMessageType completedType = maybeType.value();
            const auto result = _handleExtendedMessageFragment(messagePtr, completedType);

            if (result == ExtendedFragmentResult::Malformed) {
                reset(SinkResetType::SoftReset);
                continue;
            }

            if (result == ExtendedFragmentResult::UnsupportedType) {
                _context.sendNotSupportedMessage();
                continue;
            }

            if (result == ExtendedFragmentResult::InProgress) {
                continue;
            }
        }

        if (_runtimeState._currentStateHandler) {
            _runtimeState._currentStateHandler->handleMessage(_context, messagePtr);
        }

        _processTimeoutEvents();
    }
}

Sink::~Sink() {
    disable();

    reset();

    queue_free(&_messageQueue);
    queue_free(&_timeoutEventQueue);
    queue_free(&_pendingRequestQueue);
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
    _ccBusResetPending.store(false, std::memory_order_release);

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

        if (event.type == SinkTimeoutEventType::GoodCRCTimeout) {
            _handleMessageSenderStateChangedPolicyContext(SinkMessageSenderState::GoodCRCTimeout);
            continue;
        }

        if (_runtimeState._currentStateHandler) {
            _runtimeState._currentStateHandler->handleTimeoutEvent(_context, event.type);
        }
    }
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
    PendingPDORequest request{};
    while (queue_try_remove(&_pendingRequestQueue, &request)) {
        if (!_enabled.load()) {
            continue;
        }

        (void)_context.requestPDO(request.pdoIndex, request.voltageMV, request.currentMA);
    }
}
