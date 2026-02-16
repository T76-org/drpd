/**
 * @file app_scpi_bus.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <algorithm>


using namespace T76::DRPD;


void App::_queryCCBusControllerRole(const std::vector<T76::SCPI::ParameterValue> &params) {
    switch(_ccBusController.role()) {
        case Logic::CCBusRole::Disabled:
            _usbInterface.sendUSBTMCBulkData("DISABLED,", false);
            break;
        case Logic::CCBusRole::Observer:
            _usbInterface.sendUSBTMCBulkData("OBSERVER,", false);
            break;
        case Logic::CCBusRole::Source:
            _usbInterface.sendUSBTMCBulkData("SOURCE,", false);
            break;
        case Logic::CCBusRole::Sink:
            _usbInterface.sendUSBTMCBulkData("SINK,", false);
            break;
    }

    switch(_ccBusController.state()) {
        case Logic::CCBusState::Unattached:
            _usbInterface.sendUSBTMCBulkData("UNATTACHED,", false);
            break;
        case Logic::CCBusState::SourceFound:
            _usbInterface.sendUSBTMCBulkData("SOURCE_FOUND,", false);
            break;
        case Logic::CCBusState::Attached:
            _usbInterface.sendUSBTMCBulkData("ATTACHED,", false);
            break;
    }

    switch(_ccBusController.sourcePort()) {
        case Logic::CCBusPort::DUT:
            _usbInterface.sendUSBTMCBulkData("DUT,", false);
            break;
        case Logic::CCBusPort::USDS:
            _usbInterface.sendUSBTMCBulkData("USDS,", false);
            break;
    }

    switch(_ccBusController.sourceChannel()) {
        case PHY::CCChannel::CC1:
            _usbInterface.sendUSBTMCBulkData("CC1,", false);
            break;
        case PHY::CCChannel::CC2:
            _usbInterface.sendUSBTMCBulkData("CC2,", false);
            break;
    }

    switch(_ccBusController.sinkPort()) {
        case Logic::CCBusPort::DUT:
            _usbInterface.sendUSBTMCBulkData("DUT,", false);
            break;

        case Logic::CCBusPort::USDS:
            _usbInterface.sendUSBTMCBulkData("USDS,", false);
            break;
    }

    switch(_ccBusController.sinkChannel()) {
        case PHY::CCChannel::CC1:
            _usbInterface.sendUSBTMCBulkData("CC1", true);
            break;
        case PHY::CCChannel::CC2:
            _usbInterface.sendUSBTMCBulkData("CC2", true);
            break;
    }
}

void App::_setCCBusControllerRole(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (params.size() < 1 || params[0].type != T76::SCPI::ParameterType::Enum) {
        _interpreter.addError(-100, "Invalid or missing parameter for BUS:CC:ROLE command");
        return;
    }

    std::string roleStr = params[0].stringValue;
    std::transform(roleStr.begin(), roleStr.end(), roleStr.begin(), ::toupper);

    if (roleStr == "DISABLED") {
        _ccBusController.role(Logic::CCBusRole::Disabled);
    } else if (roleStr == "OBSERVER") {
        _ccBusController.role(Logic::CCBusRole::Observer);
    } else if (roleStr == "SOURCE") {
        _ccBusController.role(Logic::CCBusRole::Source);
    } else if (roleStr == "SINK") {
        _ccBusController.role(Logic::CCBusRole::Sink);
    } else {
        _interpreter.addError(-101, "Invalid role parameter for BUS:CC:ROLE command");
    }
}

void App::_queryCCBusControllerRoleStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    switch(_ccBusController.state()) {
        case Logic::CCBusState::Unattached:
            _usbInterface.sendUSBTMCBulkData("UNATTACHED", true);
            break;
        case Logic::CCBusState::SourceFound:
            _usbInterface.sendUSBTMCBulkData("SOURCE_FOUND", true);
            break;
        case Logic::CCBusState::Attached:
            _usbInterface.sendUSBTMCBulkData("ATTACHED", true);
            break;
    }
}

void App::_queryCCBusCaptureCycleTime(const std::vector<T76::SCPI::ParameterValue> &params) {
    _usbInterface.sendUSBTMCBulkData(std::to_string(_bmcDecoder.nsPerPulseWidthPIOCycle()), true);
}

void App::_queryCCBusCapturedMessageCount(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint32_t count = _receivedMessages.size();
    
    _usbInterface.sendUSBTMCBulkData(std::to_string(count), true);
}

void App::_queryCCBusNextCapturedMessage(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (_receivedMessages.size() == 0) {
        _interpreter.addError(-200, "No captured CC bus messages available");
        return;
    }

    CapturedMessage message = _receivedMessages.pop();

    // Output the message data as an arbitrary data block
    // The format is:
    //
    //   64-bit start timestamp
    //   64-bit end timestamp
    //   32-bit decoding result
    //   4 bytes of SOP
    //   32-bit pulse buffer length (nPulse)
    //   nPulse bytes of pulse buffer
    //   32-bit data length (nData)
    //   nData bytes of data

    uint64_t startTimestamp = message.startTimestamp;
    uint64_t endTimestamp = message.endTimestamp;

    std::vector<uint8_t> messageBytes;

    uint32_t totalSize = 
        sizeof(uint64_t) +                          // start timestamp
        sizeof(uint64_t) +                          // end timestamp
        sizeof(uint32_t) +                          // decoding result
        4 +                                         // SOP
        sizeof(uint32_t) +                          // pulse buffer length
        message.pulseBuffer.size() * sizeof(uint16_t) +     // pulse buffer
        sizeof(uint32_t) +                          // data length
        message.data.size();                        // data


    std::string header = _interpreter.abdPreamble(totalSize);
    messageBytes.insert(messageBytes.end(),  header.begin(), header.end());

    // Timestamp

    const uint8_t* startTimestampBytes = reinterpret_cast<const uint8_t*>(&startTimestamp);
    messageBytes.insert(messageBytes.end(), startTimestampBytes, startTimestampBytes + sizeof(startTimestamp));

    const uint8_t* endTimestampBytes = reinterpret_cast<const uint8_t*>(&endTimestamp);
    messageBytes.insert(messageBytes.end(), endTimestampBytes, endTimestampBytes + sizeof(endTimestamp));
    
    // Decoding result
    uint32_t decodingResult = static_cast<uint32_t>(message.decodingResult);
    const uint8_t* resultBytes = reinterpret_cast<const uint8_t*>(&decodingResult);
    messageBytes.insert(messageBytes.end(), resultBytes, resultBytes + sizeof(decodingResult));

    // SOP
    const uint8_t* sopBytes = message.sop.data();
    messageBytes.insert(messageBytes.end(), sopBytes, sopBytes + 4);

    // Pulse buffer length
    uint32_t pulseBufferLength = static_cast<uint32_t>(message.pulseBuffer.size());
    const uint8_t* pulseBufferLengthBytes = reinterpret_cast<const uint8_t*>(&pulseBufferLength);
    messageBytes.insert(messageBytes.end(), pulseBufferLengthBytes, pulseBufferLengthBytes + sizeof(pulseBufferLength));

    // Pulse buffer
    messageBytes.insert(
        messageBytes.end(),
        reinterpret_cast<const uint8_t*>(message.pulseBuffer.data()),
        reinterpret_cast<const uint8_t*>(message.pulseBuffer.data()) + message.pulseBuffer.size() * sizeof(uint16_t)
    );

    // Data length
    uint32_t dataLength = static_cast<uint32_t>(message.data.size());
    const uint8_t* dataLengthBytes = reinterpret_cast<const uint8_t*>(&dataLength);
    messageBytes.insert(messageBytes.end(), dataLengthBytes, dataLengthBytes + sizeof(dataLength));

    // Data
    messageBytes.insert(messageBytes.end(), message.data.data(), message.data.data() + message.data.size());

    // Newline to terminate the block
    messageBytes.push_back('\n');

    _usbInterface.sendUSBTMCBulkData(messageBytes);
}

void App::_setCCBusMessageCaptureState(const std::vector<T76::SCPI::ParameterValue> &params) {
    std::string stateStr = params[0].stringValue;
    std::transform(stateStr.begin(), stateStr.end(), stateStr.begin(), ::toupper);

    if (stateStr == "ON") {
        _captureEnabled.store(true, std::memory_order_relaxed);
        _bmcDecoder.enabled(true);
    } else if (stateStr == "OFF") {
        _captureEnabled.store(false, std::memory_order_relaxed);
    } else {
        _interpreter.addError(-111, "Invalid state parameter for BUS:CC:CAPTURE:STATE command");
        return;
    }

    deviceStatus(DeviceStatusFlag::CaptureStatusChanged);
}

void App::_queryCCBusMessageCaptureState(const std::vector<T76::SCPI::ParameterValue> &params) {
    bool enabled = _captureEnabled.load(std::memory_order_relaxed);
    if (enabled) {
        _usbInterface.sendUSBTMCBulkData("ON", true);
    } else {
        _usbInterface.sendUSBTMCBulkData("OFF", true);
    }
}

void App::_clearCCBusCapturedMessages(const std::vector<T76::SCPI::ParameterValue> &params) {
    _receivedMessages.clear();
    deviceStatus(DeviceStatusFlag::CaptureStatusChanged);
}
