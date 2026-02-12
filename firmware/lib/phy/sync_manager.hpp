/**
 * @file sync_manager.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The SyncManager class manages the SYNC port's functionality.
 * 
 * It can be configured to operate in one of several modes:
 * 
 * - Off: No SYNC signal is generated, even if a trigger event occurs.
 * - PulseHigh: The SYNC signal pulses high for a configured duration when a trigger event occurs.
 * - PulseLow: The SYNC signal pulses low for a configured duration when a trigger event occurs.
 * - Toggle: The SYNC signal toggles its state (high to low or low to high) when a trigger event occurs.
 * 
 * The pulse width for the PulseHigh and PulseLow modes can be configured in microseconds.
 */

#pragma once

#include <t76/safety.hpp>


namespace T76::DRPD::PHY {

    /**
     * @brief The operating modes for the SyncManager
     * 
     */
    enum class SyncManagerMode : uint32_t {
        Off = 0,                ///< SYNC output is disabled
        PulseHigh,              ///< SYNC pulses high on trigger
        PulseLow,               ///< SYNC pulses low on trigger
        Toggle,                 ///< SYNC toggles state on trigger
    };

    /**
     * @brief The SyncManager class
     * 
     * The SyncManager controls the SYNC port's behavior in response to trigger events.
     * 
     * It can be configured to operate in one of several modes:
     * 
     * - Off: No SYNC signal is generated, even if a trigger event occurs.
     * - PulseHigh: The SYNC signal pulses high for a configured duration when a trigger event occurs.
     * - PulseLow: The SYNC signal pulses low for a configured duration when a trigger event occurs.
     * - Toggle: The SYNC signal toggles its state (high to low or low to high) when a trigger event occurs.
     * 
     * The pulse width for the PulseHigh and PulseLow modes can be configured in microseconds.
     */
    class SyncManager : public T76::Core::Safety::SafeableComponent {
    public:
        /**
         * @brief Set the operating mode of the SyncManager
         * 
         * @param mode The desired operating mode
         * 
         * @note The pulseWidth() is ignored when mode is Off or Toggle.
         */
        void mode(SyncManagerMode mode);

        /**
         * @brief Get the current operating mode of the SyncManager
         * 
         * @return PHY::SyncManagerMode The current operating mode
         */
        SyncManagerMode mode() const;

        /**
         * @brief Get the current SYNC pulse width in microseconds
         * 
         * @return uint32_t The current pulse width in microseconds
         * 
         * @note The pulse width is ignored when mode is Off or Toggle.
         */
        uint32_t pulseWidth() const;

        /**
         * @brief Set the SYNC pulse width in microseconds
         * 
         * @param widthUs The desired pulse width in microseconds
         * 
         * @note The pulse width is ignored when mode is Off or Toggle.
         */
        void pulseWidth(uint32_t widthUs);

        /**
         * @brief Perform a SYNC action based on the current mode
         * 
         * This method should be called when a trigger event occurs to generate
         * the appropriate SYNC signal based on the configured mode and pulse width.
         */
        void performSync();

    protected:
        SyncManagerMode _mode = SyncManagerMode::Off;   ///< Current operating mode of the SyncManager
        uint32_t _pulseWidthUs = 1000;                  ///< Current SYNC pulse width in microseconds

        // SafeableComponent interface
        bool activate() override;
        void makeSafe() override;
        const char* getComponentName() const override { return "SyncManager"; }
    };
    
} // namespace T76::DRPD::PHY
