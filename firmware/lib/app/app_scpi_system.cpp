#include "app.hpp"

#include <hardware/clocks.h>
#include <hardware/structs/watchdog.h>
#include <hardware/watchdog.h>
#include "pico/unique_id.h"

#include <t76/updater/boot_request.h>


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

void App::_enterFirmwareUpdater(const std::vector<T76::SCPI::ParameterValue> &params) {
    watchdog_hw->scratch[T76_UPDATER_BOOT_SCRATCH_MAGIC] = T76_UPDATER_BOOT_MAGIC;
    watchdog_hw->scratch[T76_UPDATER_BOOT_SCRATCH_ARM] = T76_UPDATER_BOOT_ARM_VALUE;
    if (_activeCommandTransport == CommandTransport::WinUSB) {
        _firmwareUpdaterRebootRequested = true;
        return;
    }
    sleep_ms(150);
    watchdog_reboot(0, 0, 10);
}
