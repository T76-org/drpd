#include "cable_test_controller.hpp"
#include "cable_test_policy.hpp"
#include "../proto/pd_messages/structured_vdm.hpp"
#include <algorithm>
#include <pico/time.h>

using namespace T76::DRPD;
using namespace T76::DRPD::Logic;

CableTestController::CableTestController(PHY::AnalogMonitor& analog,
    PHY::CCRoleManager& roles, PHY::CCBusManager& bus, PHY::BMCDecoder& decoder,
    PHY::BMCEncoder& encoder) :
    _analog(analog), _roles(roles), _bus(bus), _decoder(decoder), _encoder(encoder) {
    critical_section_init(&_snapshotLock);
}

void CableTestController::initCore1() { _ready.store(true); }

void CableTestController::enabled(bool enabled) {
    _leaseMs.store(static_cast<uint32_t>(time_us_64() / 1000));
    const auto stopSequence = enabled ? _stopSequence.load() : ++_stopSequence;
    _requested.store(enabled);
    if (!enabled && _ready.load()) {
        const uint64_t until = time_us_64() + 100000;
        while (_stopAck.load() != stopSequence) {
            if (time_us_64() > until) {
                _roles.cc1Role(PHY::CCRole::Off);
                _roles.cc2Role(PHY::CCRole::Off);
                panic("Cable Test core-1 shutdown timeout");
            }
            tight_loop_contents();
        }
    }
}

CableTestResult CableTestController::result() {
    _leaseMs.store(static_cast<uint32_t>(time_us_64() / 1000));
    return snapshot();
}

CableTestResult CableTestController::snapshot() {
    critical_section_enter_blocking(&_snapshotLock);
    const auto result = _snapshot;
    critical_section_exit(&_snapshotLock);
    return result;
}

void CableTestController::_publish() {
    critical_section_enter_blocking(&_snapshotLock);
    _snapshot = _result;
    critical_section_exit(&_snapshotLock);
}

void CableTestController::_probe() {
    _roles.cc1Role(PHY::CCRole::Off);
    _roles.cc2Role(PHY::CCRole::Off);
    _powered = false;
    _roles.cc1Role(PHY::CCRole::SourceDefault);
    _roles.cc2Role(PHY::CCRole::SourceDefault);
    _scanAt = time_us_64() + 100000;
    _candidate = 0;
    _debounce = 0;
}

void CableTestController::_sendIdentity() {
    // USB-PD 3.2 section 6.2.1.1.6: 3.x first, optional 2.0 fallback.
    const Proto::StructuredVDM vdm(_legacy ? 0xff008001u : 0xff00a801u);
    _pending.emplace(Proto::SOP::SOPType::SOPPrime, vdm);
    auto& header = _pending->header();
    header.specRevision(_legacy ? Proto::PDHeader::SpecRevision::Rev2_0 :
        Proto::PDHeader::SpecRevision::Rev3_x);
    // For SOP-prime these are reserved/cable-plug fields, both zero for a port.
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.messageId(_transport.begin(1));
    _result.revision = _legacy ? 1 : 2;
    _encoder.encodeAndSendMessage(*_pending);
    ++_attempts;
    _waitingResponse = false;
    _deadline = time_us_64() + LOGIC_SINK_GOODCRC_TIMEOUT_US;
    _retryAt = time_us_64() + 50000;
    _publish();
}

void CableTestController::_finish(CableTestOutcome outcome) {
    _result.outcome = outcome;
    _pending.reset();
    _transport.abandon(1);
    _waitingResponse = false;
    _encoder.cancelTransmission();
    _probe();
    _publish();
}

void CableTestController::_retry() {
    _pending.reset();
    _transport.abandon(1);
    _waitingResponse = false;
    if (_attempts >= 3) {
        if (!_legacy) {
            _legacy = true;
            _attempts = 0;
            _transport.reset(1);
        } else {
            _finish(_result.goodCRC ? CableTestOutcome::ResponseTimeout :
                CableTestOutcome::NoResponse);
            return;
        }
    }
    _deadline = std::max(time_us_64() + 50000, _retryAt);
}

void CableTestController::loopCore1() {
    const uint32_t lastPollMs = _leaseMs.load();
    const uint64_t now = time_us_64();
    const uint32_t nowMs = static_cast<uint32_t>(now / 1000);
    if (_running.load() && cableTestLeaseExpired(nowMs, lastPollMs)) _requested.store(false);
    if (!_requested.load()) {
        if (_running.load()) {
            _decoder.messageReceivedCallbackCore1(nullptr);
            _encoder.cancelTransmission();
            _roles.cc1Role(PHY::CCRole::Off);
            _roles.cc2Role(PHY::CCRole::Off);
            _pending.reset();
            _powered = false;
            _result = CableTestResult{.generation = _result.generation + 1};
            _publish();
            _running.store(false);
        }
        _stopAck.store(_stopSequence.load());
        return;
    }
    if (!_running.load()) {
        _running.store(true);
        _result = CableTestResult{.generation = _result.generation + 1,
            .outcome = CableTestOutcome::Waiting};
        _bus.muxActive(false);
        _decoder.enabled(true);
        _decoder.messageReceivedCallbackCore1(
            [this](const PHY::BMCDecodedMessage* message) { _received(message); });
        _probe();
        _publish();
    }
    if (_powered) {
        if (now < _deadline) return;
        if (_result.outcome != CableTestOutcome::Discovering) {
            _finish(_result.outcome);
            return;
        }
        const float vconn = _result.vconnContact == 1 ?
            _analog.dutCC1Voltage() : _analog.dutCC2Voltage();
        if (vconn < 2.7f) { _finish(CableTestOutcome::PowerFault); return; }
        if (!_pending) { _sendIdentity(); return; }
        if (_waitingResponse) { _retry(); return; }
        if (_transport.retry(1) <= (_legacy ? 3 : 2)) {
            _encoder.encodeAndSendMessage(*_pending);
            _deadline = now + LOGIC_SINK_GOODCRC_TIMEOUT_US;
        } else _retry();
        return;
    }
    if (now < _scanAt) return;
    _scanAt = now + 10000;
    const float cc1 = _analog.dutCC1Voltage();
    const float cc2 = _analog.dutCC2Voltage();
    const uint8_t contact = cableTestContact(cc1, cc2);
    if (contact != _candidate) { _candidate = contact; _debounce = 0; }
    if (++_debounce < 10) return;
    _debounce = 10;
    if (contact == 0) {
        const auto outcome = cc1 >= 2.6f && cc2 >= 2.6f ?
            CableTestOutcome::Waiting : CableTestOutcome::UnsupportedConnection;
        if (_result.outcome != outcome || _result.vconnContact != 0) {
            _result = CableTestResult{.generation = _result.generation + 1,
                .outcome = outcome};
            _publish();
        }
        return;
    }
    if (_result.vconnContact == contact) return;
    _result = CableTestResult{.generation = _result.generation + 1,
        .outcome = CableTestOutcome::Discovering, .vconnContact = contact};
    _legacy = false;
    _attempts = 0;
    _lastMessageId = -1;
    _transport.reset();
    _pending.reset();
    _bus.dutChannel(contact == 1 ? PHY::CCChannel::CC2 : PHY::CCChannel::CC1);
    if (contact == 1) _roles.cc1Role(PHY::CCRole::VConn);
    else _roles.cc2Role(PHY::CCRole::VConn);
    _powered = true;
    _deadline = now + 60000; // Wait beyond tVCONNStable (50 ms).
    _publish();
}

void CableTestController::_received(const PHY::BMCDecodedMessage* message) {
    if (!_requested.load() || !_powered ||
        _result.outcome != CableTestOutcome::Discovering ||
        message->decodingResult() != PHY::BMCDecodedMessageResult::Success ||
        message->decodedSOP().type() != Proto::SOP::SOPType::SOPPrime) return;
    const auto header = message->decodedHeader();
    if (!cableTestResponderHeader(header.raw())) return;
    if (header.messageClass() == Proto::PDHeader::MessageClass::Control &&
        header.controlMessageType() == Proto::ControlMessageType::GoodCRC) {
        if (_transport.acknowledge(1, header.messageId())) {
            _result.goodCRC = true;
            _waitingResponse = true;
            _deadline = time_us_64() + 33000;
            _publish();
        }
        return;
    }
    // ACK immediately on the decoder path; copy result before decoder recycles it.
    auto ack = PHY::BMCEncodedMessage::goodCRCMessageForMessage(*message);
    ack.header().raw(ack.header().raw() & ~0x0120u);
    _encoder.encodeAndSendMessage(ack);
    if (_lastMessageId == static_cast<int>(header.messageId())) return;
    _lastMessageId = header.messageId();
    if (header.messageClass() != Proto::PDHeader::MessageClass::Data ||
        header.dataMessageType() != Proto::DataMessageType::Vendor_Defined || !_pending) return;
    const auto body = message->rawBody();
    const auto vdm = Proto::StructuredVDM::decode(body);
    if (!vdm || !vdm->structured() || vdm->svid() != 0xff00 ||
        vdm->command() != 1 || vdm->commandType() == Proto::StructuredVDM::CommandType::Request)
        return;
    _result.revision = static_cast<uint8_t>(header.specRevision());
    if (vdm->commandType() == Proto::StructuredVDM::CommandType::BUSY) { _retry(); return; }
    if (vdm->commandType() == Proto::StructuredVDM::CommandType::NAK) {
        // Let queued GoodCRC transmit before removing VCONN.
        _result.outcome = CableTestOutcome::NAK;
    } else if (body.size() != header.numDataObjects() * 4 ||
        !cableTestIdentityValid(body, _result.revision == 2)) {
        _result.outcome = CableTestOutcome::Malformed;
    } else {
        _result.length = body.size();
        std::copy(body.begin(), body.end(), _result.body.begin());
        _result.outcome = CableTestOutcome::Identity;
    }
    _pending.reset();
    _transport.abandon(1);
    _deadline = time_us_64() + 5000;
    _publish();
}

const char* CableTestController::outcomeName(CableTestOutcome outcome) {
    switch (outcome) {
        case CableTestOutcome::Disabled: return "DISABLED";
        case CableTestOutcome::Waiting: return "WAITING";
        case CableTestOutcome::Discovering: return "DISCOVERING";
        case CableTestOutcome::Identity: return "IDENTITY";
        case CableTestOutcome::NoResponse: return "NO_RESPONSE";
        case CableTestOutcome::ResponseTimeout: return "RESPONSE_TIMEOUT";
        case CableTestOutcome::NAK: return "NAK";
        case CableTestOutcome::Malformed: return "MALFORMED";
        case CableTestOutcome::PowerFault: return "POWER_FAULT";
        case CableTestOutcome::UnsupportedConnection: return "UNSUPPORTED_CONNECTION";
    }
    return "DISABLED";
}
