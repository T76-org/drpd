/**
 * @file hardware_revision.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "hardware_revision.hpp"

#include <hardware/gpio.h>


using namespace T76::DRPD::Logic;


void HardwareRevisionConfig::init() {
    gpio_set_function(LOGIC_HARDWARE_REVISION_DETECT_PIN, GPIO_FUNC_SIO);
    gpio_init(LOGIC_HARDWARE_REVISION_DETECT_PIN);
    gpio_set_dir(LOGIC_HARDWARE_REVISION_DETECT_PIN, GPIO_IN);
    gpio_pull_up(LOGIC_HARDWARE_REVISION_DETECT_PIN);

}

HardwareRevision HardwareRevisionConfig::revision() const {
    return gpio_get(LOGIC_HARDWARE_REVISION_DETECT_PIN)
        ? HardwareRevision::R2603A
        : HardwareRevision::R2605A;
}

const char *HardwareRevisionConfig::revisionString() const {
    switch (revision()) {
        case HardwareRevision::R2605A:
            return "R2605-A";
        case HardwareRevision::R2603A:
        default:
            return "R2603-A";  
    }
}

