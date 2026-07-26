#include "app.hpp"

#include <cmath>

#include <hardware/clocks.h>
#include <hardware/structs/watchdog.h>
#include <hardware/watchdog.h>
#include "drpd_version.hpp"
#include "pico/unique_id.h"

#include <t76/updater/boot_request.h>


using namespace T76::DRPD;


void App::_queryIDN(const std::vector<T76::SCPI::ParameterValue> &params) {
    char serialBuffer[2 * PICO_UNIQUE_BOARD_ID_SIZE_BYTES + 1];
    pico_get_unique_board_id_string(serialBuffer,
        sizeof(serialBuffer));
    std::string response = "\"MTA Inc.\",Dr.PD," +
        std::string(serialBuffer) + "," DRPD_FIRMWARE_VERSION;
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
        _sendTransportTextResponse("0,\"No error\"", true);
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

void App::_querySystemHardwareRevision(const std::vector<T76::SCPI::ParameterValue> &params) {
    _sendTransportTextResponse(_hardwareRevisionConfig.revisionString());
}

void App::_enterFirmwareUpdater(const std::vector<T76::SCPI::ParameterValue> &params) {
    watchdog_hw->scratch[T76_UPDATER_BOOT_SCRATCH_MAGIC] = T76_UPDATER_BOOT_MAGIC;
    watchdog_hw->scratch[T76_UPDATER_BOOT_SCRATCH_ARM] = T76_UPDATER_BOOT_ARM_VALUE;
    if (_activeCommandTransport == CommandTransport::WinUSB) {
        _firmwareUpdaterRebootRequested.store(true, std::memory_order_release);
        return;
    }
    sleep_ms(150);
    watchdog_reboot(0, 0, 10);
}

void App::_queryBMCDecoderCCVrefVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(std::to_string(_bmcDecoder.ccThresholdVoltage()));
}

void App::_setBMCDecoderCCVrefVoltage(const std::vector<T76::SCPI::ParameterValue> &params) {
    const double voltage = params[0].numberValue;
    const double steps = (voltage - PHY_BMC_DECODER_CC_VREF_MIN) /
        PHY_BMC_DECODER_CC_VREF_STEP;
    if (!std::isfinite(voltage) || voltage < PHY_BMC_DECODER_CC_VREF_MIN ||
        voltage > PHY_BMC_DECODER_CC_VREF_MAX ||
        std::fabs(steps - std::round(steps)) > 0.000001) {
        _interpreter.addError(_scpiErrorDataOutOfRange, "Data out of range");
        return;
    }

    BMCDecoderPersistentConfig config = _bmcDecoder.exportPersistentConfig();
    config.ccVrefVolts = static_cast<float>(voltage);
    (void)_persistBMCDecoderConfig(config);
}

void App::_resetBMCDecoderCCVrefVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    BMCDecoderPersistentConfig config = _bmcDecoder.exportPersistentConfig();
    config.ccVrefVolts = PHY_BMC_DECODER_CC_VREF_DEFAULT;
    (void)_persistBMCDecoderConfig(config);
}

void App::_queryBMCDecoderCCVrefPwmFrequency(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(std::to_string(_bmcDecoder.ccVrefPwmFrequencyHz()));
}

void App::_setBMCDecoderCCVrefPwmFrequency(const std::vector<T76::SCPI::ParameterValue> &params) {
    const double frequency = params[0].numberValue;
    if (!std::isfinite(frequency) || std::trunc(frequency) != frequency ||
        frequency < PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_MIN_HZ ||
        frequency > PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_MAX_HZ ||
        static_cast<uint32_t>(frequency) % PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_STEP_HZ != 0) {
        _interpreter.addError(_scpiErrorDataOutOfRange, "Data out of range");
        return;
    }

    BMCDecoderPersistentConfig config = _bmcDecoder.exportPersistentConfig();
    config.ccVrefPwmFrequencyHz = static_cast<uint32_t>(frequency);
    (void)_persistBMCDecoderConfig(config);
}

void App::_resetBMCDecoderCCVrefPwmFrequency(const std::vector<T76::SCPI::ParameterValue> &) {
    BMCDecoderPersistentConfig config = _bmcDecoder.exportPersistentConfig();
    config.ccVrefPwmFrequencyHz = PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_HZ;
    (void)_persistBMCDecoderConfig(config);
}

bool App::_persistBMCDecoderConfig(const BMCDecoderPersistentConfig &decoderConfig) {
    auto &persistentConfig = PersistentConfig::instance();
    const PersistentConfigDataCurrent previous = persistentConfig.current();
    persistentConfig.update([&decoderConfig](PersistentConfigDataCurrent &data) {
        data.bmcDecoder = decoderConfig;
    });
    if (!persistentConfig.save()) {
        persistentConfig.update([&previous](PersistentConfigDataCurrent &data) {
            data = previous;
        });
        _interpreter.addError(_scpiErrorExecutionError, "Unable to persist configuration");
        return false;
    }

    _bmcDecoder.applyPersistentConfig(decoderConfig);
    return true;
}
