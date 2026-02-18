/**
 * @file cc_bus_controller.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The CCBusController is responsible for managing the state of the CC bus,
 * detecting source and sink connections and configuring the bus multiplexer
 * so that the appropriate CC lines are connected.
 * 
 * In Observer mode, the controller monitors all the CC lines and looks
 * for a source on one port and a sink on the opposite port. When a source
 * is detected on one port, the corresponding CC line is connected to the mux
 * and the other port is monitored for a sink connection. Once both source
 * and sink are detected, the controller enters the Attached state.
 * 
 * Source and Sink modes are currently unimplemented and behave the same
 * as Observer mode.
 * 
 * TODO: Implement Source and Sink modes
 * 
 */

#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <utility>
#include <vector>

#include "../phy/analog_monitor.hpp"
#include "../phy/cc_bus_manager.hpp"
#include "../phy/cc_role_manager.hpp"
#include "../phy/vbus_manager.hpp"

#include "sink/sink.hpp"


namespace T76::DRPD::Logic {
    
    /**
     * @brief Enumeration of CC bus controller roles
     * 
     */
    enum class CCBusRole : uint32_t {
        Disabled,
        Observer,
        Source,
        Sink,
    };

    /**
     * @brief Enumeration of CC bus controller states
     * 
     */
    enum class CCBusState : uint32_t {
        Unattached,
        SourceFound,
        Attached,
    };

    /**
     * @brief Enumeration of CC bus ports
     * 
     */ 
    enum class CCBusPort : uint32_t {
        DUT,
        USDS,
    };

    /**
     * @brief CC bus controller class
     * 
     * Responsible for managing the CC bus state, detecting source and sink
     * connections, and configuring the CC bus multiplexer accordingly.
     * 
     * The class uses FreeRTOS timers to periodically check the CC line voltages,
     * and must therefore run on core 0.
     * 
     */
    class CCBusController {
    public:
        /// @brief Type definition for state change callback
        typedef std::function<void(CCBusState)> StateChangedCallback;

        /// @brief Type definition for role change callback
        typedef std::function<void(CCBusRole)> RoleChangedCallback;

        /// @brief Type definition for sink info changed callback
        typedef std::function<void(SinkInfoChange)> SinkInfoChangedCallback;

        /**
         * @brief Construct a new CCBusController object
         * 
         * @param analogMonitor Reference to an AnalogMonitor instance, used to read CC line voltages
         * @param ccBusManager Refererence to a CCBusManager instance, used to control the CC bus multiplexer
         * @param ccRoleManager Reference to a CCRoleManager instance, used to manage CC roles
         * 
         * Note that use of ccBusManager and ccRoleManager should be exclusive to this class
         * to avoid conflicts in controlling the CC bus and roles, with the exception of controlling
         * the direction and value of the CC_IO line, which may be done by other classes as needed to
         * send and receive data over the CC lines.
         */
        CCBusController(
            PHY::AnalogMonitor &analogMonitor,
            PHY::CCBusManager &ccBusManager,
            PHY::CCRoleManager &ccRoleManager,
            PHY::BMCDecoder &bmcDecoder,
            PHY::BMCEncoder &bmcEncoder,
            PHY::VBusManager &vbusManager
        ) : 
            _analogMonitor(analogMonitor),
            _ccBusManager(ccBusManager),
            _ccRoleManager(ccRoleManager),
            _bmcDecoder(bmcDecoder),
            _bmcEncoder(bmcEncoder),
            _vbusManager(vbusManager),
            _role(CCBusRole::Disabled),
            _state(CCBusState::Unattached),
            _sourcePort(CCBusPort::DUT),
            _sourceChannel(PHY::CCChannel::CC1),
            _sinkPort(CCBusPort::USDS),
            _sinkChannel(PHY::CCChannel::CC1),
            _sink(*this, _bmcDecoder, _bmcEncoder)
        {
            _sink.sinkInfoChanged(
                std::bind(&CCBusController::_repeatSinkInfoChanged, this, std::placeholders::_1)
            );
        }

        /**
         * @brief Initialize the CC bus controller
         * 
         * Call this method when setting up system tasks on core 0.
         * 
         */
        void init();

        /**
         * @brief Initialize CC bus controller resources that must be created on Core 1.
         */
        void initCore1();

        /**
         * @brief Set the role of the CC bus controller
         * 
         * @param role The role to set
         */
        void role(CCBusRole role);

        /**
         * @brief Get the role of the CC bus controller
         * 
         * @return The current role of the CC bus controller
         */
        CCBusRole role() const;

        /**
         * @brief Get the state of the CC bus controller
         * 
         * @return CCBusState The current state of the CC bus controller
         */
        CCBusState state() const;

        /**
         * @brief Get the source port of the CC bus controller
         * 
         * @return CCBusPort The current source port
         */
        CCBusPort sourcePort() const;

        /**
         * @brief Get the source channel of the CC bus controller
         * 
         * @return PHY::CCChannel The current source channel
         */
        PHY::CCChannel sourceChannel() const;

        /**
         * @brief Get the sink port of the CC bus controller
         * 
         * @return CCBusPort The current sink port
         */
        CCBusPort sinkPort() const;

        /**
         * @brief Get the sink channel of the CC bus controller
         * 
         * @return PHY::CCChannel The current sink channel
         */
        PHY::CCChannel sinkChannel() const;

        /**
         * @brief Get a pointer to the Sink instance
         * 
         * @return Sink* Pointer to the Sink instance, or nullptr if not in Sink mode
         */
        Sink* sink();

        /**
         * @brief Add a callback function to be called when the state changes
         * 
         * @param callback The callback function to be called when the state changes.
         *                 The callback will be invoked with the new state as a parameter.
         * @return uint32_t Identifier for the registered callback. Returns 0 if the
         *         callback is empty.
         */
        uint32_t addStateChangedCallback(StateChangedCallback callback);

        /**
         * @brief Remove a previously registered state changed callback
         * 
         * @param callbackId Identifier returned by addStateChangedCallback
         */
        void removeStateChangedCallback(uint32_t callbackId);

        /**
         * @brief Add a callback function to be called when the role changes
         * 
         * @param callback The callback function to be called when the role changes.
         *                 The callback will be invoked with the new role as a parameter.
         * @return uint32_t Identifier for the registered callback. Returns 0 if the
         *         callback is empty.
         */
        uint32_t addRoleChangedCallback(RoleChangedCallback callback);

        /**
         * @brief Remove a previously registered role changed callback
         * 
         * @param callbackId Identifier returned by addRoleChangedCallback
         */
        void removeRoleChangedCallback(uint32_t callbackId);

        /**
         * @brief Set a callback to be called when the Sink's info changes
         * 
         * This callback acts as a repeater for the Sink's sinkInfoChanged callback.
         * When the Sink's info changes, this callback will be invoked with a
         * SinkInfoChange value indicating what changed.
         * 
         * @param callback The callback function to be called when the Sink's info changes.
         */
        void sinkInfoChanged(SinkInfoChangedCallback callback);

    protected:
        PHY::AnalogMonitor &_analogMonitor;     ///< Reference to the AnalogMonitor instance
        PHY::CCBusManager &_ccBusManager;       ///< Reference to the CCBusManager instance
        PHY::CCRoleManager &_ccRoleManager;     ///< Reference to the CCRoleManager instance
        PHY::BMCDecoder &_bmcDecoder;           ///< Reference to the BMCDecoder instance
        PHY::BMCEncoder &_bmcEncoder;           ///< Reference to the BMCEncoder instance
        PHY::VBusManager &_vbusManager;         ///< Reference to the VBusManager instance

        CCBusRole _role;                        ///< Current role of the CC bus controller

        CCBusState _state;                      ///< Current state of the CC bus controller 

        CCBusPort _sourcePort;                  ///< Current source port
        PHY::CCChannel _sourceChannel;          ///< Current source channel

        CCBusPort _sinkPort;                    ///< Current sink port
        PHY::CCChannel _sinkChannel;            ///< Current sink channel 

        uint32_t _sourceDebounceCounter;        ///< Debounce counter for source detection
        uint32_t _sinkDebounceCounter;          ///< Debounce counter for sink detection

        uint32_t _nextStateChangedCallbackId = 1;
        ///< Next identifier for state callbacks
        std::vector<std::pair<uint32_t, StateChangedCallback>> _stateChangedCallbacks;
        ///< Registered state callbacks

        uint32_t _nextRoleChangedCallbackId = 1;
        ///< Next identifier for role callbacks
        std::vector<std::pair<uint32_t, RoleChangedCallback>> _roleChangedCallbacks;
        ///< Registered role callbacks

        SinkInfoChangedCallback _sinkInfoChangedCallback;     ///< Callback for Sink info changes
        std::atomic_flag _callbacksLock = ATOMIC_FLAG_INIT;   ///< Cross-core callback registry lock.

        Sink _sink;                             ///< Sink instance for managing sink state.

        /**
         * @brief Utility method to determine if a source is present based on voltage
         * 
         * @param voltage The voltage reading from the CC line
         * @return true if a source is detected,
         * @return false otherwise
         */
        bool _isSourcePresent(float voltage);   

        /**
         * @brief Utility method to determine if a sink is present based on voltage
         * 
         * @param voltage The voltage reading from the CC line
         * @return true if a sink is detected,
         * @return false otherwise
         */
        bool _isSinkPresent(float voltage);

        /**
         * @brief Get the voltage on a specific CC channel of a given port
         * 
         * @param port The CC bus port (DUT or USDS)
         * @param channel The CC channel (CC1 or CC2)
         * @return float The voltage reading on the specified channel
         */
        float _channelVoltage(CCBusPort port, PHY::CCChannel channel);

        /**
         * @brief Update state and notify listeners when it changes
         * 
         * @param newState New state to set
         */
        void _updateState(CCBusState newState);

        /**
         * @brief Update role and notify listeners when it changes
         * 
         * @param newRole New role to set
         */
        void _updateRole(CCBusRole newRole);

        /**
         * @brief Internal method to repeat Sink info changes
         * 
         * Called when the Sink's sinkInfoChanged callback is triggered,
         * this method forwards the notification to the CCBusController's callback.
         * 
         * @param change The type of sink info change.
         */
        void _repeatSinkInfoChanged(SinkInfoChange change);

        /**
         * @brief Main loop method for the CC bus controller
         * 
         * This method is called periodically by a FreeRTOS timer to
         * manage the CC bus state machine.
         * 
         */
        void _loop();

        /**
         * @brief Loop method for Observer mode
         * 
         * Handles state machine logic when the controller is in Observer mode,
         * monitoring for source and sink connections on both ports.
         * 
         */
        void _loopObserverMode();

        /**
         * @brief Loop method for Sink mode
         * 
         * Handles state machine logic when the controller is in Sink mode,
         * assuming a source is present on the DUT port and alternating between
         * CC1 and CC2 to find a connection.
         * 
         */
        void _loopSinkMode();
    };

} // namespace T76::DRPD::Logic
