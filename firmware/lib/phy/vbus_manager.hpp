/**
 * @file vbus_manager.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The VBusManager class manages the pass-through line for the
 * USB VBUS voltage, allowing it to be enabled or disabled.
 * 
 * The class also monitors the VBUS voltage and current
 * to detect overvoltage and overcurrent conditions, entering
 * a fault state if such conditions are detected.
 * 
 * When the class enters a fault state, it disables the VBUS line
 * and refuses to re-enable it until reset.
 * 
 * Internally, the concept of “enabled” refers to whether the
 * VBUS pass-through line is allowed to be active, while the
 * actual state of the VBUS line is represented by the VBusState
 * enumeration.
 */

#pragma once

#include <functional>
#include <utility>
#include <vector>

#include <pico/time.h>

#include <t76/safety.hpp>

#include "analog_monitor.hpp"


namespace T76::DRPD::PHY {

    /**
     * @brief The state of the VBUS pass-through line
     * 
     */
    enum class VBusState : uint32_t {
        Disabled = 0,
        Enabled,
        OverCurrent,
        OverVoltage,
    };

    /**
     * @brief VBUS pass-through manager
     * 
     * This class provides an interface to enable or disable the
     * VBUS pass-through line. In the event of failure, it
     * disables the VBUS line to ensure safety.
     * 
     * It also monitors the VBUS voltage and current to detect
     * overvoltage and overcurrent conditions.
     * 
     * When it detects a fault condition, it enters a fault state
     * and refuses to re-enable the VBUS line until reset.
     */
    class VBusManager : T76::Core::Safety::SafeableComponent {
    public:
        VBusManager(AnalogMonitor &analogMonitor) : _analogMonitor(analogMonitor) {}

        /**
         * @brief Initialize the VBusManager on core 1
         * 
         */
        void initCore1();

        /**
         * @brief Set the VBUS pass-through state
         * 
         * @param en True to enable the VBUS pass-through, false to disable
         */
        void enabled(bool en);

        /**
         * @brief Get the VBUS pass-through state
         * 
         * @return True if VBUS pass-through is enabled, false otherwise
         */
        bool enabled();

        /**
         * @brief Get the current VBUS state
         * 
         * @return VBusState 
         */
        VBusState state();

        uint64_t lastOvpEventTimestampUs() const;
        uint64_t lastOcpEventTimestampUs() const;

        /**
         * @brief Reset the VBusManager from a fault state
         * 
         * Clears any fault conditions and allows the VBUS
         * pass-through to be enabled again.
         */
        void reset();

        /**
         * @brief Get the overvoltage protection threshold
         * 
         * @return float 
         */
        float ovpThreshold() const;

        /**
         * @brief Set the overvoltage protection threshold
         * 
         * @param threshold 
         */
        void ovpThreshold(float threshold);

        /**
         * @brief Get the overcurrent protection threshold
         * 
         * @return float 
         */
        float ocpThreshold() const;

        /**
         * @brief Set the overcurrent protection threshold
         * 
         * @param threshold 
         */
        void ocpThreshold(float threshold);

        /**
         * @brief Set the callback function to be called when state or settings change
         * 
         * @param callback The callback function to be called when state or settings change.
         */
        void managerChangedCallback(std::function<void()> callback);
        
    protected:
        AnalogMonitor &_analogMonitor; ///< Reference to the AnalogMonitor instance for voltage/current readings

        bool _fault = false; ///< Current fault state. The component will refuse to enable VBUS if true.
        bool _enabled = false; ///< Current enabled state
        VBusState _state = VBusState::Disabled; ///< Current VBUS state

        float _ovpThreshold = 48.0f;  ///< Overvoltage protection threshold in volts
        float _ocpThreshold = 5.0f;  ///< Overcurrent protection threshold in amps
        uint64_t _lastOvpEventTimestampUs = 0; ///< Latched timestamp of the most recent OVP event.
        uint64_t _lastOcpEventTimestampUs = 0; ///< Latched timestamp of the most recent OCP event.

        std::function<void()> _managerChangedCallback; ///< Callback for state or settings changes

        repeating_timer_t _timer; ///< Repeating timer for monitoring VBUS status

        /** 
         * @brief Timer callback for monitoring VBUS status
         * 
         * This static method is called by the repeating timer to
         * check the VBUS status and update the internal state accordingly.
         * 
         * @param rt Pointer to the repeating timer
         * @return true to continue the timer, false to stop it
         */
        static bool _timerCallback(repeating_timer_t *rt);

        // Safety component interface implementations

        virtual bool activate() override;
        virtual void makeSafe() override;
        virtual const char *getComponentName() const override { return "VBusManager"; }
    };
    
} // namespace T76::DRPD::PHY
