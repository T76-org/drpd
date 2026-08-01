/**
 * @file app_scpi_sink.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "app.hpp"
#include "../logic/sink/inquiry_descriptor.hpp"

#include <algorithm>
#include <cstdio>
#include <variant>


using namespace T76::DRPD;

namespace {

const char *sinkRequestOutcomeName(Logic::SinkRequestOutcome outcome) {
    switch (outcome) {
        case Logic::SinkRequestOutcome::None:
            return "NONE";
        case Logic::SinkRequestOutcome::Pending:
            return "PENDING";
        case Logic::SinkRequestOutcome::Accepted:
            return "ACCEPTED";
        case Logic::SinkRequestOutcome::Rejected:
            return "REJECTED";
        case Logic::SinkRequestOutcome::Wait:
            return "WAIT";
        case Logic::SinkRequestOutcome::NotSupported:
            return "NOT_SUPPORTED";
        case Logic::SinkRequestOutcome::Timeout:
            return "TIMEOUT";
    }

    return "UNKNOWN";
}

const char *sinkInquiryOutcomeName(Logic::SinkInquiryOutcome outcome) {
    switch (outcome) {
        case Logic::SinkInquiryOutcome::None: return "NONE";
        case Logic::SinkInquiryOutcome::Pending: return "PENDING";
        case Logic::SinkInquiryOutcome::Response: return "RESPONSE";
        case Logic::SinkInquiryOutcome::NotSupported: return "NOT_SUPPORTED";
        case Logic::SinkInquiryOutcome::Rejected: return "REJECTED";
        case Logic::SinkInquiryOutcome::Wait: return "WAIT";
        case Logic::SinkInquiryOutcome::GoodCRCTimeout: return "GOODCRC_TIMEOUT";
        case Logic::SinkInquiryOutcome::ResponseTimeout: return "RESPONSE_TIMEOUT";
        case Logic::SinkInquiryOutcome::ProtocolError: return "PROTOCOL_ERROR";
        case Logic::SinkInquiryOutcome::MalformedResponse: return "MALFORMED_RESPONSE";
        case Logic::SinkInquiryOutcome::ResponseTooLarge: return "RESPONSE_TOO_LARGE";
        case Logic::SinkInquiryOutcome::Aborted: return "ABORTED";
    }
    return "UNKNOWN";
}

} // namespace


void App::_querySinkAvailablePDOCount(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    size_t count = sink->pdoCount();
    _sendTransportTextResponse(std::to_string(count), true);
}

void App::_querySinkRequestedPDOAtIndex(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    // Get the PDO index parameter
    size_t index = static_cast<size_t>(params[0].numberValue);

    std::optional<Proto::PDOVariant> pdoOpt = sink->pdo(index);
    if (!pdoOpt.has_value()) {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value. PDO index out of range.");
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
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::VariableSupplyPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT
            std::string response = "VARIABLE,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f) + ",";
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::BatterySupplyPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "BATTERY,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f) + ",";
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::SPRPPSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT
            std::string response = "SPR_PPS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f) + ",";
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::SPRAVSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT_15V,MAX_CURRENT_20V
            std::string response = "SPR_AVS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrent15VMilliamps() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrent20VMilliamps() / 1000.0f) + ",";
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::EPRAVSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "EPR_AVS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f) + ",";
            _sendTransportTextResponse(response, true);
        }
    }, pdoOpt.value());
}

void App::_setSinkPDO(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    if (sink->state() != Logic::SinkState::Disconnected &&
        sink->state() != Logic::SinkState::PE_SNK_Ready &&
        sink->state() != Logic::SinkState::PE_SNK_EPR_Keepalive) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Sink not in a valid state (" + std::to_string(static_cast<int>(sink->state())) + ").");
        return;
    }

    // Get the PDO index parameter
    size_t pdoIndex = static_cast<size_t>(params[0].numberValue);
    
    // Request the PDO with the specified voltage and current
    
    uint32_t voltageMillivolts = static_cast<uint32_t>(params[1].numberValue);
    uint32_t currentMilliamps = static_cast<uint32_t>(params[2].numberValue);

    const Logic::SinkRequestResult result =
        sink->requestPDO(pdoIndex, voltageMillivolts, currentMilliamps);
    if (!result) {
        const char *error = result.error != nullptr ? result.error : "Unable to request PDO.";
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. " + std::string(error));
    }
}

void App::_querySinkRequestStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    (void)params;
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    const Logic::SinkRequestStatus status = sink->lastRequestStatus();
    std::string response = sinkRequestOutcomeName(status.outcome);
    response += ",";
    response += std::to_string(status.pdoIndex);
    response += ",";
    response += std::to_string(status.voltageMV);
    response += ",";
    response += std::to_string(status.currentMA);
    _sendTransportTextResponse(response, true);
}

void App::_setSinkInquiry(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }
    Logic::Sink *sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }
    std::string type = params[0].stringValue;
    std::transform(type.begin(), type.end(), type.begin(), ::toupper);
    const auto descriptor = Logic::sinkInquiryDescriptor(type);
    if (!descriptor.has_value()) {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value. Unsupported inquiry type.");
        return;
    }
    const auto result = sink->requestInquiry(descriptor->type);
    if (!result) {
        _interpreter.addError(_scpiErrorSettingsConflict,
            "Settings conflict. " + std::string(result.error));
    }
}

void App::_querySinkInquiryStatus(const std::vector<T76::SCPI::ParameterValue>&) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink || _ccBusController.sink() == nullptr) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }
    const auto status = _ccBusController.sink()->lastInquiryResult().status;
    std::string response = sinkInquiryOutcomeName(status.outcome);
    response += "," + std::to_string(status.id);
    const auto descriptor = Logic::sinkInquiryDescriptor(status.type);
    response += "," + std::string(descriptor.has_value() ? descriptor->token : "UNKNOWN") +
        "," + std::to_string(status.responseClass);
    response += "," + std::to_string(status.responseType);
    response += "," + std::to_string(status.responseLength);
    _sendTransportTextResponse(response, true);
}

void App::_querySinkInquiryResponse(const std::vector<T76::SCPI::ParameterValue>&) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink || _ccBusController.sink() == nullptr) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }
    const auto result = _ccBusController.sink()->lastInquiryResult();
    if (result.status.outcome != Logic::SinkInquiryOutcome::Response) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. No inquiry response is available.");
        return;
    }
    std::vector<uint8_t> block;
    const std::string preamble = _interpreter.abdPreamble(result.status.responseLength);
    block.insert(block.end(), preamble.begin(), preamble.end());
    block.insert(block.end(), result.response.begin(),
        result.response.begin() + result.status.responseLength);
    block.push_back('\n');
    _sendTransportBinaryResponse(block);
}

void App::_querySinkCapabilityCount(const std::vector<T76::SCPI::ParameterValue> &params) {
    (void)params;
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    _sendTransportTextResponse(std::to_string(sink->localSinkCapabilityCount()), true);
}

void App::_querySinkCapabilityPDO(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    const size_t index = static_cast<size_t>(params[0].numberValue);
    const auto rawPDO = sink->localSinkCapabilityPDO(index);
    if (!rawPDO.has_value()) {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value. Sink capability index out of range.");
        return;
    }

    _sendTransportTextResponse(std::to_string(rawPDO.value()), true);
}

void App::_setSinkCapabilityPDO(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    const size_t index = static_cast<size_t>(params[0].numberValue);
    const uint32_t rawPDO = static_cast<uint32_t>(params[1].numberValue);
    if (!sink->setLocalSinkCapabilityPDO(index, rawPDO)) {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value. Sink capabilities must keep at least one valid SPR PDO.");
    }
}

void App::_querySinkEPRCapabilityCount(const std::vector<T76::SCPI::ParameterValue> &params) {
    (void)params;
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    _sendTransportTextResponse(std::to_string(sink->localEPRSinkCapabilityCount()), true);
}

void App::_querySinkEPRCapabilityPDO(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    const size_t index = static_cast<size_t>(params[0].numberValue);
    const auto rawPDO = sink->localEPRSinkCapabilityPDO(index);
    if (!rawPDO.has_value()) {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value. EPR Sink capability index out of range.");
        return;
    }

    _sendTransportTextResponse(std::to_string(rawPDO.value()), true);
}

void App::_setSinkEPRCapabilityPDO(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    const size_t index = static_cast<size_t>(params[0].numberValue);
    const uint32_t rawPDO = static_cast<uint32_t>(params[1].numberValue);
    if (!sink->setLocalEPRSinkCapabilityPDO(index, rawPDO)) {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value. EPR Sink capability index out of range.");
    }
}

void App::_setSinkEPREntryState(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    std::string stateStr = params[0].stringValue;
    std::transform(stateStr.begin(), stateStr.end(), stateStr.begin(), ::toupper);

    if (stateStr == "ON") {
        sink->eprEntryEnabled(true);
    } else if (stateStr == "OFF") {
        sink->eprEntryEnabled(false);
    } else {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value");
        return;
    }

    _savePersistentConfig();
}

void App::_querySinkEPREntryState(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    _sendTransportTextResponse(sink->eprEntryEnabled() ? "ON" : "OFF", true);
}

void App::_setSinkPPSStatusQueryState(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    std::string stateStr = params[0].stringValue;
    std::transform(stateStr.begin(), stateStr.end(), stateStr.begin(), ::toupper);

    if (stateStr == "ON") {
        sink->ppsStatusQueryEnabled(true);
    } else if (stateStr == "OFF") {
        sink->ppsStatusQueryEnabled(false);
    } else {
        _interpreter.addError(_scpiErrorIllegalParameterValue, "Illegal parameter value");
        return;
    }

    _savePersistentConfig();
}

void App::_querySinkPPSStatusQueryState(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    _sendTransportTextResponse(sink->ppsStatusQueryEnabled() ? "ON" : "OFF", true);
}

void App::_querySinkStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    // Return the sink state
    Logic::SinkState state = sink->state();
    
    switch(state) {
        case Logic::SinkState::Disconnected:
            _sendTransportTextResponse("DISCONNECTED", true);
            break;
        case Logic::SinkState::PE_SNK_Startup:
            _sendTransportTextResponse("PE_SNK_STARTUP", true);
            break;
        case Logic::SinkState::PE_SNK_Discovery:
            _sendTransportTextResponse("PE_SNK_DISCOVERY", true);
            break;
        case Logic::SinkState::PE_SNK_Wait_for_Capabilities:
            _sendTransportTextResponse("PE_SNK_WAIT_FOR_CAPABILITIES", true);
            break;
        case Logic::SinkState::PE_SNK_Evaluate_Capability:
            _sendTransportTextResponse("PE_SNK_EVALUATE_CAPABILITY", true);
            break;
        case Logic::SinkState::PE_SNK_Select_Capability:
            _sendTransportTextResponse("PE_SNK_SELECT_CAPABILITY", true);
            break;
        case Logic::SinkState::PE_SNK_Transition_Sink:
            _sendTransportTextResponse("PE_SNK_TRANSITION_SINK", true);
            break;
        case Logic::SinkState::PE_SNK_Ready:
            _sendTransportTextResponse("PE_SNK_READY", true);
            break;
        case Logic::SinkState::PE_SNK_Send_EPR_Mode_Entry:
            _sendTransportTextResponse("PE_SNK_SEND_EPR_MODE_ENTRY", true);
            break;
        case Logic::SinkState::PE_SNK_EPR_Mode_Wait_For_Response:
            _sendTransportTextResponse("PE_SNK_EPR_MODE_WAIT_FOR_RESPONSE", true);
            break;
        case Logic::SinkState::PE_SNK_Send_EPR_Mode_Exit:
            _sendTransportTextResponse("PE_SNK_SEND_EPR_MODE_EXIT", true);
            break;
        case Logic::SinkState::PE_SNK_Give_Sink_Cap:
            _sendTransportTextResponse("PE_SNK_GIVE_SINK_CAP", true);
            break;
        case Logic::SinkState::PE_SNK_Send_Response:
            _sendTransportTextResponse("PE_SNK_SEND_RESPONSE", true);
            break;
        case Logic::SinkState::PE_SNK_Get_Source_Cap:
            _sendTransportTextResponse("PE_SNK_GET_SOURCE_CAP", true);
            break;
        case Logic::SinkState::PE_SNK_Get_PPS_Status:
            _sendTransportTextResponse("PE_SNK_GET_PPS_STATUS", true);
            break;
        case Logic::SinkState::PE_SNK_Inquiry:
            _sendTransportTextResponse("PE_SNK_INQUIRY", true);
            break;
        case Logic::SinkState::PE_SNK_EPR_Keepalive:
            _sendTransportTextResponse("PE_SNK_EPR_KEEPALIVE", true);
            break;
        case Logic::SinkState::PE_SNK_Hard_Reset:
            _sendTransportTextResponse("PE_SNK_HARD_RESET", true);
            break;
        case Logic::SinkState::PE_SNK_Transition_To_Default:
            _sendTransportTextResponse("PE_SNK_TRANSITION_TO_DEFAULT", true);
            break;
        case Logic::SinkState::Error:
            _sendTransportTextResponse("ERROR", true);
            break;
    }
}

void App::_querySinkNegotiatedPDO(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    std::optional<Proto::PDOVariant> pdoOpt = sink->negotiatedPDO();
    if (!pdoOpt.has_value()) {
        _sendTransportTextResponse("NONE", true);
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
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::VariableSupplyPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT
            std::string response = "VARIABLE,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f);
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::BatterySupplyPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "BATTERY,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f);
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::SPRPPSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT
            std::string response = "SPR_PPS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrentMilliamps() / 1000.0f);
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::SPRAVSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_CURRENT_15V,MAX_CURRENT_20V
            std::string response = "SPR_AVS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrent15VMilliamps() / 1000.0f) + ",";
            response += std::to_string(pdo.maxCurrent20VMilliamps() / 1000.0f);
            _sendTransportTextResponse(response, true);
        } else if constexpr (std::is_same_v<T, Proto::EPRAVSAPDO>) {
            // Format: TYPE,MIN_VOLTAGE,MAX_VOLTAGE,MAX_POWER
            std::string response = "EPR_AVS,";
            response += std::to_string(pdo.minVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxVoltageMillivolts() / 1000.0f) + ",";
            response += std::to_string(pdo.maxPowerMilliwatts() / 1000.0f);
            _sendTransportTextResponse(response, true);
        }
    }, pdoOpt.value());
}

void App::_querySinkNegotiatedVoltage(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    float voltage = sink->negotiatedVoltage();
    _sendTransportTextResponse(std::to_string(voltage), true);
}

void App::_querySinkNegotiatedCurrent(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    float current = sink->negotiatedCurrent();
    _sendTransportTextResponse(std::to_string(current), true);
}

void App::_querySinkErrorStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    // Check if device is in sink mode
    if (_ccBusController.role() != Logic::CCBusRole::Sink) {
        _interpreter.addError(_scpiErrorSettingsConflict, "Settings conflict. Not in sink mode.");
        return;
    }

    Logic::Sink* sink = _ccBusController.sink();
    if (sink == nullptr) {
        _interpreter.addError(_scpiErrorExecutionError, "Execution error. Unable to access sink policy engine.");
        return;
    }

    // Check if sink is in error state
    Logic::SinkState state = sink->state();
    if (state == Logic::SinkState::Error) {
        _sendTransportTextResponse("1", true);
    } else {
        _sendTransportTextResponse("0", true);
    }
}
