/**
 * @file app_scpi_device.cpp
 */

#include "app.hpp"

using namespace T76::DRPD;

uint32_t App::deviceStatus() const {
    return _deviceStatusRegister.load(std::memory_order_relaxed);
}

void App::deviceStatus(DeviceStatusFlag flag) {
    //
    // Sets a device status flag using lock-free atomic compare-and-exchange.
    // 
    // This function is atomic and safe to call from any context (task, ISR, or
    // outside FreeRTOS), without requiring mutex protection or blocking operations.
    // 
    // The compare-and-exchange loop works as follows:
    // 1. Load the current register value
    // 2. Check if the flag is already set; if so, return early (optimization)
    // 3. Compute the new value by ORing in the flag
    // 4. Atomically attempt to swap the old value with the new value
    // 5. If another thread modified the register between load and CAS, retry
    // 6. Once CAS succeeds, the flag is guaranteed to be set and the interrupt
    //    is raised (only once)
    // 
    // This ensures that:
    // - The flag and interrupt are indivisible (no race between set and notify)
    // - Multiple concurrent calls safely merge their flag bits
    // - No task-switching or scheduling delays occur
    //

    uint32_t expected = _deviceStatusRegister.load(std::memory_order_relaxed);
    uint32_t desired;
    
    do {
        if (expected & static_cast<uint32_t>(flag)) {
            // Flag already set, no need to update
            return;
        }
        desired = expected | static_cast<uint32_t>(flag);
    } while (!_deviceStatusRegister.compare_exchange_strong(
        expected, desired, std::memory_order_relaxed));
    
    // Mark interrupt pending
    _interruptPending = true;
}

void App::clearStatus() {
    _deviceStatusRegister.store(0u, std::memory_order_relaxed);
}

void App::_queryDeviceStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint32_t status = deviceStatus();
    _usbInterface.sendUSBTMCBulkData(std::to_string(status));
    clearStatus();
}


