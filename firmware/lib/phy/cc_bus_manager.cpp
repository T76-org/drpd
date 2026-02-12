/**
 * @file cc_bus_manager.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "cc_bus_manager.hpp"


using namespace T76::DRPD::PHY;


bool CCBusManager::activate() {
    gpio_set_function(PHY_CC_BUS_MANAGER_DUT_CC_SEL_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_BUS_MANAGER_DUT_CC_SEL_PIN);
    gpio_put(PHY_CC_BUS_MANAGER_DUT_CC_SEL_PIN, 0);
    gpio_set_dir(PHY_CC_BUS_MANAGER_DUT_CC_SEL_PIN, GPIO_OUT);

    gpio_set_function(PHY_CC_BUS_MANAGER_USDS_CC_SEL_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_BUS_MANAGER_USDS_CC_SEL_PIN);
    gpio_put(PHY_CC_BUS_MANAGER_USDS_CC_SEL_PIN, 0);
    gpio_set_dir(PHY_CC_BUS_MANAGER_USDS_CC_SEL_PIN, GPIO_OUT);

    gpio_set_function(PHY_CC_BUS_MANAGER_USDS_CC_EN_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_BUS_MANAGER_USDS_CC_EN_PIN);
    gpio_put(PHY_CC_BUS_MANAGER_USDS_CC_EN_PIN, 0);
    gpio_set_dir(PHY_CC_BUS_MANAGER_USDS_CC_EN_PIN, GPIO_OUT);

    return true;
}

void CCBusManager::makeSafe() {
    // Disconnect DUT and USDS CC lines
    muxActive(false);
}

void CCBusManager::muxActive(bool active) {
    gpio_put(PHY_CC_BUS_MANAGER_USDS_CC_EN_PIN, active);
}

bool CCBusManager::muxActive() {
    return gpio_get(PHY_CC_BUS_MANAGER_USDS_CC_EN_PIN);
}

void CCBusManager::dutChannel(CCChannel channel) {
    gpio_put(PHY_CC_BUS_MANAGER_DUT_CC_SEL_PIN, channel == CCChannel::CC2 ? 0 : 1);
}

CCChannel CCBusManager::dutChannel() {
    return gpio_get(PHY_CC_BUS_MANAGER_DUT_CC_SEL_PIN) == 0 ? CCChannel::CC2 : CCChannel::CC1;
}

void CCBusManager::usdsChannel(CCChannel channel) {
    gpio_put(PHY_CC_BUS_MANAGER_USDS_CC_SEL_PIN, channel == CCChannel::CC2 ? 0 : 1);
}

CCChannel CCBusManager::usdsChannel() {
    return gpio_get(PHY_CC_BUS_MANAGER_USDS_CC_SEL_PIN) == 0 ? CCChannel::CC2 : CCChannel::CC1;
}

