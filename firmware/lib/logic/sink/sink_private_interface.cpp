/**
 * @file sink_private_interface.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink.hpp"


using namespace T76::DRPD::Logic;


void Sink::_setState(SinkState newState) {
    if (_state != newState) {
        _state = newState;

        if (_currentStateHandler) {
            _currentStateHandler->reset();
        }

        switch (newState) {
            case SinkState::Disconnected:
                _currentStateHandler = &_disconnectedStateHandler;
                break;

            case SinkState::PE_SNK_Wait_for_Capabilities:
                _currentStateHandler = &_waitForCapabilitiesStateHandler;
                break;

            case SinkState::PE_SNK_Select_Capability:
                _currentStateHandler = &_selectCapabilityStateHandler;
                break;

            case SinkState::PE_SNK_Transition_Sink:
                _currentStateHandler = &_transitionSinkStateHandler;
                break;

            case SinkState::PE_SNK_Ready:
                _currentStateHandler = &_readySinkStateHandler;
                break;

            case SinkState::PE_SNK_EPR_Mode_Entry:
                _currentStateHandler = &_eprModeEntryStateHandler;
                break;

            case SinkState::PE_SNK_EPR_Keepalive:
                _currentStateHandler = &_eprKeepaliveStateHandler;
                break;

            default:
                _currentStateHandler = nullptr;
                break;
        }

        if (_currentStateHandler) {
            _currentStateHandler->enter();
        }

        if (_sinkInfoChangedCallback) {
            _sinkInfoChangedCallback(SinkInfoChange::OtherInfoChanged);
        }
    }
}

SinkState Sink::_getState() const {
    return _state;
}

void Sink::_setSourceCapabilities(const Proto::SourceCapabilities& sourceCapabilities) {
    _sourceCapabilities = sourceCapabilities;
    _sourceSupportsEpr = sourceEPRCapable();

    // New SPR capabilities invalidate any stale EPR cache until fetched again.
    _eprCapabilities.reset();

    if (_sinkInfoChangedCallback) {
        _sinkInfoChangedCallback(SinkInfoChange::PDOListUpdated);
    }
}

Proto::SourceCapabilities Sink::_getSourceCapabilities() const {
    return _sourceCapabilities.value();
}

void Sink::_setEPRSourceCapabilities(const Proto::EPRSourceCapabilities& sourceCapabilities) {
    _eprCapabilities = sourceCapabilities;

    if (_sinkInfoChangedCallback) {
        _sinkInfoChangedCallback(SinkInfoChange::PDOListUpdated);
    }
}

void Sink::_clearEPRSourceCapabilities() {
    if (_eprCapabilities.has_value()) {
        _eprCapabilities.reset();

        if (_sinkInfoChangedCallback) {
            _sinkInfoChangedCallback(SinkInfoChange::PDOListUpdated);
        }
    }
}

void Sink::_setNegotiatedValues(const Proto::PDOVariant pdoVariant, float voltage, float current) {
    _negotiatedPDO = pdoVariant;
    _negotiatedVoltage = voltage;
    _negotiatedCurrent = current;

    if (_sinkInfoChangedCallback) {
        _sinkInfoChangedCallback(SinkInfoChange::OtherInfoChanged);
    }
}

void Sink::_setEPRModeActive(bool active) {
    _eprModeActive = active;
    _eprEntryAttempted = _eprEntryAttempted || active;

    if (!active) {
        _eprModeActive = false;
    }

    if (_sinkInfoChangedCallback) {
        _sinkInfoChangedCallback(SinkInfoChange::OtherInfoChanged);
    }
}

size_t Sink::_totalPDOCount() const {
    if (_eprCapabilities.has_value()) {
        return _eprCapabilities->pdoCount();
    }

    if (_sourceCapabilities.has_value()) {
        return _sourceCapabilities->pdoCount();
    }

    return 0;
}

std::optional<Proto::PDOVariant> Sink::_pdoAtIndex(size_t index) const {
    if (_eprCapabilities.has_value()) {
        if (index < _eprCapabilities->pdoCount()) {
            return _eprCapabilities->pdo(index);
        }
        return std::nullopt;
    }

    if (_sourceCapabilities.has_value() && index < _sourceCapabilities->pdoCount()) {
        return _sourceCapabilities->pdo(index);
    }

    return std::nullopt;
}

std::optional<uint8_t> Sink::_requestObjectPositionAtIndex(size_t index) const {
    if (_eprCapabilities.has_value()) {
        if (index < _eprCapabilities->pdoCount()) {
            return _eprCapabilities->objectPosition(index);
        }

        return std::nullopt;
    }

    if (_sourceCapabilities.has_value() && index < _sourceCapabilities->pdoCount()) {
        return static_cast<uint8_t>(index + 1);
    }

    return std::nullopt;
}
