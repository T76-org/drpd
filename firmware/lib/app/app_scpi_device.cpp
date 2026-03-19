/**
 * @file app_scpi_device.cpp
 */

#include "app.hpp"

using namespace T76::DRPD;

uint32_t App::deviceStatus() const {
    return _deviceStatusRegister.load(std::memory_order_relaxed);
}

void App::deviceStatus(DeviceStatusFlag flag) {
    const uint32_t flagBits = static_cast<uint32_t>(flag);
    const uint32_t previous = _deviceStatusRegister.fetch_or(flagBits, std::memory_order_relaxed);

    if ((previous & flagBits) == 0u) {
        // Only request SRQ when this call transitions the bit from clear to set.
        _interruptPending.store(true, std::memory_order_release);
    }
}

void App::clearStatus() {
    _deviceStatusRegister.store(0u, std::memory_order_relaxed);
}

void App::_queryDeviceStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    const uint32_t status = _deviceStatusRegister.exchange(0u, std::memory_order_acq_rel);
    _usbInterface.sendUSBTMCBulkData(std::to_string(status));
}

