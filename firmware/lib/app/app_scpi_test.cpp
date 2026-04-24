/**
 * @file app_scpi_testsuite.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <algorithm>


using namespace T76::DRPD;

#if DRPD_ENABLE_TEST_SCPI_COMMANDS
#define BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED()
#else
#define BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED() \
    _interpreter.addError(_scpiErrorCommandProtected, "Command protected"); \
    return;
#endif



void App::_setVBusManagerState(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    std::string value = params[0].stringValue;
    std::transform(value.begin(), value.end(), value.begin(), ::toupper);
    
    if (value == "ON") {
        _vbusManager.enabled(true);
    } else if (value == "OFF") {
        _vbusManager.enabled(false);
    } else {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value");
    }
}

void App::_queryVBusManagerState(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();
    
    if (_vbusManager.enabled()) {
        _sendTransportTextResponse("ON");
    } else {
        _sendTransportTextResponse("OFF");
    }
}

void App::_setCC1Role(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    std::string value = params[0].stringValue;

    std::transform(value.begin(), value.end(), value.begin(), ::toupper);    

    if (value == "OFF") {
        _ccRoleManager.cc1Role(PHY::CCRole::Off);
    } else if (value == "SINK") {
        _ccRoleManager.cc1Role(PHY::CCRole::Sink);
    } else if (value == "EMARKER") {
        _ccRoleManager.cc1Role(PHY::CCRole::EMarker);
    } else if (value == "SOURCE_DEFAULT") {
        _ccRoleManager.cc1Role(PHY::CCRole::SourceDefault);
    } else if (value == "SOURCE_1_5A" || value == "SOURCE_15") {
        _ccRoleManager.cc1Role(PHY::CCRole::Source1_5A);
    } else if (value == "SOURCE_3_0A" || value == "SOURCE_30") {
        _ccRoleManager.cc1Role(PHY::CCRole::Source3_0A);
    } else if (value == "VCONN") {
        _ccRoleManager.cc1Role(PHY::CCRole::VConn);
    } else {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value");
    }
}

void App::_queryCC1Role(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    PHY::CCRole role = _ccRoleManager.cc1Role();

    switch(role) {
        case PHY::CCRole::Off:
            _sendTransportTextResponse("OFF");
            break;

        case PHY::CCRole::Sink:
            _sendTransportTextResponse("SINK");
            break;

        case PHY::CCRole::EMarker:
            _sendTransportTextResponse("EMARKER");
            break;

        case PHY::CCRole::SourceDefault:
            _sendTransportTextResponse("SOURCE_DEFAULT");
            break;

        case PHY::CCRole::Source1_5A:
            _sendTransportTextResponse("SOURCE_1_5A");
            break;

        case PHY::CCRole::Source3_0A:
            _sendTransportTextResponse("SOURCE_3_0A");
            break;

        case PHY::CCRole::VConn:
            _sendTransportTextResponse("VCONN");
            break;

        default:
            _sendTransportTextResponse("UNKNOWN");
            break;
    }
}

void App::_setCC2Role(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    std::string value = params[0].stringValue;

    std::transform(value.begin(), value.end(), value.begin(), ::toupper);    

    if (value == "OFF") {
        _ccRoleManager.cc2Role(PHY::CCRole::Off);
    } else if (value == "SINK") {
        _ccRoleManager.cc2Role(PHY::CCRole::Sink);
    } else if (value == "EMARKER") {
        _ccRoleManager.cc2Role(PHY::CCRole::EMarker);
    } else if (value == "SOURCE_DEFAULT") {
        _ccRoleManager.cc2Role(PHY::CCRole::SourceDefault);
    } else if (value == "SOURCE_1_5A" || value == "SOURCE_15") {
        _ccRoleManager.cc2Role(PHY::CCRole::Source1_5A);
    } else if (value == "SOURCE_3_0A" || value == "SOURCE_30") {
        _ccRoleManager.cc2Role(PHY::CCRole::Source3_0A);
    } else if (value == "VCONN") {
        _ccRoleManager.cc2Role(PHY::CCRole::VConn);
    } else {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value");
    }
}

void App::_queryCC2Role(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    PHY::CCRole role = _ccRoleManager.cc2Role();

    switch(role) {
        case PHY::CCRole::Off:
            _sendTransportTextResponse("OFF");
            break;

        case PHY::CCRole::Sink:
            _sendTransportTextResponse("SINK");
            break;

        case PHY::CCRole::EMarker:
            _sendTransportTextResponse("EMARKER");
            break;

        case PHY::CCRole::SourceDefault:
            _sendTransportTextResponse("SOURCE_DEFAULT");
            break;

        case PHY::CCRole::Source1_5A:
            _sendTransportTextResponse("SOURCE_1_5A");
            break;

        case PHY::CCRole::Source3_0A:
            _sendTransportTextResponse("SOURCE_3_0A");
            break;

        case PHY::CCRole::VConn:
            _sendTransportTextResponse("VCONN");
            break;

        default:
            _sendTransportTextResponse("UNKNOWN");
            break;
    }
}

void App::_setDUTChannel(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    std::string value = params[0].stringValue;

    std::transform(value.begin(), value.end(), value.begin(), ::toupper);    

    if (value == "CC1") {
        _ccBusManager.dutChannel(PHY::CCChannel::CC1);
    } else if (value == "CC2") {
        _ccBusManager.dutChannel(PHY::CCChannel::CC2);
    } else {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value");
    }
}

void App::_queryDUTChannel(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    PHY::CCChannel channel = _ccBusManager.dutChannel();

    switch(channel) {
        case PHY::CCChannel::CC1:
            _sendTransportTextResponse("CC1");
            break;

        case PHY::CCChannel::CC2:
            _sendTransportTextResponse("CC2");
            break;

        default:
            _sendTransportTextResponse("UNKNOWN");
            break;
    }
}

void App::_setUSDSChannel(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    std::string value = params[0].stringValue;

    std::transform(value.begin(), value.end(), value.begin(), ::toupper);    

    if (value == "CC1") {
        _ccBusManager.usdsChannel(PHY::CCChannel::CC1);
    } else if (value == "CC2") {
        _ccBusManager.usdsChannel(PHY::CCChannel::CC2);
    } else {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value");
    }
}

void App::_queryUSDSChannel(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    PHY::CCChannel channel = _ccBusManager.usdsChannel();

    switch(channel) {
        case PHY::CCChannel::CC1:
            _sendTransportTextResponse("CC1");
            break;

        case PHY::CCChannel::CC2:
            _sendTransportTextResponse("CC2");
            break;

        default:
            _sendTransportTextResponse("UNKNOWN");
            break;
    }
}

void App::_setCCMuxState(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    std::string value = params[0].stringValue;
    std::transform(value.begin(), value.end(), value.begin(), ::toupper);
    
    if (value == "ON") {
        _ccBusManager.muxActive(true);
    } else if (value == "OFF") {
        _ccBusManager.muxActive(false);
    } else {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value");
    }
}

void App::_queryCCMuxState(const std::vector<T76::SCPI::ParameterValue> &params) {
    BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED();

    if (_ccBusManager.muxActive()) {
        _sendTransportTextResponse("ON");
    } else {
        _sendTransportTextResponse("OFF");
    }
}

#undef BAIL_IF_TEST_SCPI_COMMANDS_NOT_ENABLED
