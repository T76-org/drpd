/**
 * @file app_scpi_sink.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <algorithm>
#include <cstdio>
#include <variant>


using namespace T76::DRPD;


void App::_querySinkAvailablePDOCount(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(300, "Device is not in Sink mode");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(301, "Sink not available");
        return;
    }

    size_t count = sink->pdoCount();
    _usbInterface.sendUSBTMCBulkData(std::to_string(count), true);
}

void App::_querySinkRequestedPDOAtIndex(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(300, "Device is not in Sink mode");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(301, "Sink not available");
        return;
    }

    // Get the PDO index parameter
    size_t index = static_cast<size_t>(params[0].numberValue);

    std::optional<Proto::PDOVariant> pdoOpt = sink->pdo(index);
    if (!pdoOpt.has_value()) {
        _interpreter.addError(302, "PDO index out of bounds");
        return;
    }

    // Format the PDO based on its type
    std::visit([this](auto&& pdo) {
        using T = std::decay_t<decltype(pdo)>;
        
        if constexpr (std::is_same_v<T, Proto::FixedSupplyPDO>) {
            // Format: TYPE,VOLTAGE,MAX_CURRENT
            std::string response = "FIXED,";
            response += std::to_string(pdo.voltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f) + ",";
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::VariableSupplyPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT
            std::string response = "VARIABLE,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f) + ",";
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::BatterySupplyPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "BATTERY,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f) + ",";
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::SPRPPSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT
            std::string response = "SPR_PPS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f) + ",";
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::SPRAVSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "SPR_AVS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f) + ",";
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::EPRAVSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "EPR_AVS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f) + ",";
            _usbInterface.sendUSBTMCBulkData(response, true);
        }
    }, pdoOpt.value());
}

void App::_setSinkPDO(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(300, "Device is not in Sink mode");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(301, "Sink not available");
        return;
    }

    if (sink->state() != Logic::SinkState::Disconnected &&
        sink->state() != Logic::SinkState::PE_SNK_Ready &&
        sink->state() != Logic::SinkState::PE_SNK_EPR_Keepalive) {
        _interpreter.addError(304, "Cannot request PDO in current sink state");
        return;
    }

    // Get the PDO index parameter
    size_t pdoIndex = static_cast<size_t>(params[0].numberValue);
    
    // Request the PDO with the specified voltage and current
    
    uint32_t voltageMillivolts = static_cast<uint32_t>(params[1].numberValue);
    uint32_t currentMilliamps = static_cast<uint32_t>(params[2].numberValue);

    if (!sink->requestPDO(pdoIndex, voltageMillivolts, currentMilliamps)) {
        _interpreter.addError(305, "PDO request rejected by sink policy");
    }
}

void App::_querySinkStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(300, "Device is not in Sink mode");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(301, "Sink not available");
        return;
    }

    // Return the sink state
    Logic::SinkState state = sink->state();
    
    switch(state) {
        case Logic::SinkState::Disconnected:
            _usbInterface.sendUSBTMCBulkData("DISCONNECTED", true);
            break;
        case Logic::SinkState::PE_SNK_Startup:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_STARTUP", true);
            break;
        case Logic::SinkState::PE_SNK_Discovery:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_DISCOVERY", true);
            break;
        case Logic::SinkState::PE_SNK_Wait_for_Capabilities:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_WAIT_FOR_CAPABILITIES", true);
            break;
        case Logic::SinkState::PE_SNK_Evaluate_Capability:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_EVALUATE_CAPABILITY", true);
            break;
        case Logic::SinkState::PE_SNK_Select_Capability:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_SELECT_CAPABILITY", true);
            break;
        case Logic::SinkState::PE_SNK_Transition_Sink:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_TRANSITION_SINK", true);
            break;
        case Logic::SinkState::PE_SNK_Ready:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_READY", true);
            break;
        case Logic::SinkState::PE_SNK_EPR_Mode_Entry:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_EPR_MODE_ENTRY", true);
            break;
        case Logic::SinkState::PE_SNK_Give_Sink_Cap:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_GIVE_SINK_CAP", true);
            break;
        case Logic::SinkState::PE_SNK_Get_Source_Cap:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_GET_SOURCE_CAP", true);
            break;
        case Logic::SinkState::PE_SNK_EPR_Keepalive:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_EPR_KEEPALIVE", true);
            break;
        case Logic::SinkState::PE_SNK_Hard_Reset:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_HARD_RESET", true);
            break;
        case Logic::SinkState::PE_SNK_Transition_To_Default:
            _usbInterface.sendUSBTMCBulkData("PE_SNK_TRANSITION_TO_DEFAULT", true);
            break;
        case Logic::SinkState::Error:
            _usbInterface.sendUSBTMCBulkData("ERROR", true);
            break;
    }
}

void App::_querySinkNegotiatedPDO(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(300, "Device is not in Sink mode");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(301, "Sink not available");
        return;
    }

    std::optional<Proto::PDOVariant> pdoOpt = sink->negotiatedPDO();
    if (!pdoOpt.has_value()) {
        _usbInterface.sendUSBTMCBulkData("NONE", true);
        return;
    }

    // Format the PDO based on its type
    std::visit([this](auto&& pdo) {
        using T = std::decay_t<decltype(pdo)>;
        
        if constexpr (std::is_same_v<T, Proto::FixedSupplyPDO>) {
            // Format: TYPE,VOLTAGE,MAX_CURRENT
            std::string response = "FIXED,";
            response += std::to_string(pdo.voltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f);
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::VariableSupplyPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT
            std::string response = "VARIABLE,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f);
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::BatterySupplyPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "BATTERY,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f);
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::SPRPPSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT
            std::string response = "SPR_PPS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f);
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::SPRAVSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "SPR_AVS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f);
            _usbInterface.sendUSBTMCBulkData(response, true);
        } else if constexpr (std::is_same_v<T, Proto::EPRAVSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "EPR_AVS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f);
            _usbInterface.sendUSBTMCBulkData(response, true);
        }
    }, pdoOpt.value());
}

void App::_querySinkNegotiatedVoltage(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(300, "Device is not in Sink mode");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(301, "Sink not available");
        return;
    }

    float voltage = sink->negotiatedVoltage();
    _usbInterface.sendUSBTMCBulkData(std::to_string(voltage), true);
}

void App::_querySinkNegotiatedCurrent(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(300, "Device is not in Sink mode");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(301, "Sink not available");
        return;
    }

    float current = sink->negotiatedCurrent();
    _usbInterface.sendUSBTMCBulkData(std::to_string(current), true);
}

void App::_querySinkErrorStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(300, "Device is not in Sink mode");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(301, "Sink not available");
        return;
    }

    // Check if sink is in error state
    Logic::SinkState state = sink->state();
    if (state == Logic::SinkState::Error) {
        _usbInterface.sendUSBTMCBulkData("1", true);
    } else {
        _usbInterface.sendUSBTMCBulkData("0", true);
    }
}
