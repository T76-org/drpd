/**
 * @file sync_manager.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The SyncManager class manages the SYNC port's functionality.
 * 
 * It can be configured to operate in one of several modes:
 *
 * - PulseHigh: The SYNC signal pulses high for a configured duration when a trigger event occurs.
 * - PulseLow: The SYNC signal pulses low for a configured duration when a trigger event occurs.
 * - Toggle: The SYNC signal toggles its state (high to low or low to high) when a trigger event occurs.
 * - PullDown: The SYNC signal remains high-Z until a trigger event, then enables the internal pull-down
 *   resistor for the configured duration before returning to high-Z.
 * 
 * The pulse width for the pulse and pull-down modes can be configured in microseconds.
 */

#pragma once

#include <t76/safety.hpp>


namespace T76::DRPD::PHY {

    /**
     * @brief The operating modes for the SyncManager
     * 
     */
    enum class SyncManagerMode : uint32_t {
        PulseHigh = 0,          ///< SYNC pulses high on trigger
        PulseLow,               ///< SYNC pulses low on trigger
        Toggle,                 ///< SYNC toggles state on trigger
        PullDown,               ///< SYNC enables an internal pull-down on trigger
    };

    /**
     * @brief The SyncManager class
     * 
     * The SyncManager controls the SYNC port's behavior in response to trigger events.
     * 
     * It can be configured to operate in one of several modes:
     *
     * - PulseHigh: The SYNC signal pulses high for a configured duration when a trigger event occurs.
     * - PulseLow: The SYNC signal pulses low for a configured duration when a trigger event occurs.
     * - Toggle: The SYNC signal toggles its state (high to low or low to high) when a trigger event occurs.
     * - PullDown: The SYNC signal remains high-Z until a trigger event, then enables the internal pull-down
     *   resistor for the configured duration before returning to high-Z.
     * 
     * The pulse width for the pulse and pull-down modes can be configured in microseconds.
     */
    class SyncManager : public T76::Core::Safety::SafeableComponent {
    public:
        /**
         * @brief Set the operating mode of the SyncManager
         * 
         * @param mode The desired operating mode
         * 
         * @note The pulseWidth() is ignored when mode is Toggle.
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
         * @note The pulse width is ignored when mode is Toggle.
         */
        uint32_t pulseWidth() const;

        /**
         * @brief Set the SYNC pulse width in microseconds
         * 
         * @param widthUs The desired pulse width in microseconds
         * 
         * @note The pulse width is ignored when mode is Toggle.
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
        /**
         * @brief Timer callback used to restore PulseHigh mode to its idle low state.
         *
         * @param id Alarm identifier, unused.
         * @param user_data User data pointer, unused.
         * @return int64_t Zero to avoid rescheduling the timer.
         */
        static int64_t _restorePulseHigh(alarm_id_t id, void *user_data);

        /**
         * @brief Timer callback used to restore PulseLow mode to its idle high state.
         *
         * @param id Alarm identifier, unused.
         * @param user_data User data pointer, unused.
         * @return int64_t Zero to avoid rescheduling the timer.
         */
        static int64_t _restorePulseLow(alarm_id_t id, void *user_data);

        /**
         * @brief Timer callback used to restore PullDown mode to its idle high-Z state.
         *
         * @param id Alarm identifier, unused.
         * @param user_data User data pointer, unused.
         * @return int64_t Zero to avoid rescheduling the timer.
         */
        static int64_t _restorePullDown(alarm_id_t id, void *user_data);

        /**
         * @brief Apply the hardware idle state for the currently configured mode.
         *
         * This restores the SYNC pin to the normal non-triggered state for the
         * selected mode. It is distinct from makeSafe(), which always forces
         * failsafe high-Z regardless of the configured mode.
         */
        void _applyModeIdleState();

        /**
         * @brief Force the SYNC pin into high-Z with pulls and input buffer disabled.
         *
         * This helper is used for PullDown idle behavior and for failsafe entry.
         */
        static void _enterHighImpedance();

        /**
         * @brief Configure the SYNC pin for an active internal pull-down pulse.
         *
         * The output driver remains disabled and the input buffer stays disabled
         * to avoid the RP2350 pull-down leakage erratum during the pulse.
         */
        static void _enterPullDownMode();

        SyncManagerMode _mode = SyncManagerMode::PulseHigh;   ///< Current operating mode of the SyncManager
        uint32_t _pulseWidthUs = 1000;                        ///< Current SYNC pulse width in microseconds

        // SafeableComponent interface
        bool activate() override;
        void makeSafe() override;
        const char* getComponentName() const override { return "SyncManager"; }
    };
    
} // namespace T76::DRPD::PHY
