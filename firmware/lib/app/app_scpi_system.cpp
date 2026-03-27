#include "app.hpp"

#include <hardware/clocks.h>
#include "pico/unique_id.h"


using namespace T76::DRPD;


void App::_queryIDN(const std::vector<T76::SCPI::ParameterValue> &params) {
    char serialBuffer[2 * PICO_UNIQUE_BOARD_ID_SIZE_BYTES + 1];
    pico_get_unique_board_id_string(serialBuffer,
        sizeof(serialBuffer));
    std::string response = "\"MTA Inc.\",Dr.PD," +
        std::string(serialBuffer) + ",1.0";
    _sendTransportTextResponse(response);
}

void App::_resetInstrument(const std::vector<T76::SCPI::ParameterValue> &params) {
    _interpreter.reset();
}

void App::_querySystemError(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (!_interpreter.errorQueue.empty()) {
        _sendTransportTextResponse(_interpreter.errorQueue.front(), true);
        _interpreter.errorQueue.pop();
    } else {
        _sendTransportTextResponse("0,\"No Error\"", true);
    }
}

void App::_querySystemMemory(const std::vector<T76::SCPI::ParameterValue> &params) {
    size_t freeHeapSize = xPortGetFreeHeapSize();
    size_t totalHeapSize = configTOTAL_HEAP_SIZE;
    _sendTransportTextResponse(std::to_string(totalHeapSize) + "," + std::to_string(freeHeapSize));
}

void App::_querySystemSpeed(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint32_t clockFreq = clock_get_hz(clk_sys);
    _sendTransportTextResponse(std::to_string(clockFreq));
}

void App::_querySystemUptime(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint64_t uptimeMicros = time_us_64();
    _sendTransportTextResponse(std::to_string(uptimeMicros));
}

void App::_querySystemTimestamp(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint64_t timestampMicros = time_us_64();
    _sendTransportTextResponse(std::to_string(timestampMicros));
}
