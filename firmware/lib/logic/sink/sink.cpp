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
        _sinkInfoChangedCallback) {

    queue_init(&_messageQueue, sizeof(const PHY::BMCDecodedMessage*), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);

    xTaskCreate(
        [](void *param) {
            static_cast<Sink*>(param)->_processTaskHandler();
        },
        "SinkProcessTask",
        LOGIC_SINK_MESSAGE_TASK_STACK_SIZE,
        this,
        LOGIC_SINK_MESSAGE_TASK_PRIORITY,
        &_messagingTaskHandle
    );

    reset();
}

void Sink::initCore1() {
    _alarmService.initCore1();
}

Sink::~Sink() {
    disable();

    reset();

    if (_messagingTaskHandle != nullptr) {
        vTaskDelete(_messagingTaskHandle);
        _messagingTaskHandle = nullptr;
    }

    vTaskDelay(pdMS_TO_TICKS(100));

    queue_free(&_messageQueue);
}

void Sink::enable() {
    if (_enabled.load()) {
        return;
    }

    reset();

    // Register callbacks only after queue/task are initialized.
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

    reset();
}

bool Sink::enabled() const {
    return _enabled.load();
}

void Sink::_processTaskHandler() {
    const PHY::BMCDecodedMessage* messagePtr = nullptr;

    while (true) {
        queue_remove_blocking(&_messageQueue, &messagePtr);

        if (messagePtr == nullptr) {
            continue;
        }

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
    }
}

void Sink::_onCCBusStateChanged(CCBusState newState) {
    (void)newState;

    if (!_enabled.load()) {
        return;
    }

    reset();
}
