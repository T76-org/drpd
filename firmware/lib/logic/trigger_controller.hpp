/**
 * @file trigger_controller.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The TriggerController class manages triggering logic based on events from the BMC decoder.
 * 
 * The controller operates based on one of several modes, which determine the conditions under which
 * a trigger event is generated. A trigger event threshold can be set to require multiple occurrences
 * of the specified event before a trigger is activated. The controller can also be configured to
 * automatically repeat triggering after a trigger event occurs.
 * 
 * The TriggerController integrates with the SyncManager to generate synchronization pulses
 * when a trigger event occurs, allowing for external systems to be synchronized with the detected events
 * through the SYNC port. The SyncManager supports pulsing high, pulsing low, toggling, or being 
 * disabled, in which case no sync signal is generated even if a trigger event occurs. For modes that
 * generate a sync pulse, the pulse width can be configured in microseconds.
 * 
 * The state of the TriggerController can be queried to determine if it is idle, armed and waiting for an event,
 * or if a trigger event has occurred. Note that, if auto-repeat is enabled, the controller will 
 * automatically re-arm itself after a trigger event, so it will never remain in the Triggered state.
 */

#pragma once

#include <array>
#include <cstddef>
#include <functional>
#include <optional>
#include <span>
#include "../phy/bmc_decoder.hpp"
#include "../phy/sync_manager.hpp"


namespace T76::DRPD::Logic {

    /**
     * @brief The operating modes for the TriggerController
     * 
     */
    enum class TriggerControllerMode : uint32_t {
        Off = 0,                        ///< Triggering is disabled
        PreambleStart,                  ///< Trigger on preamble start  
        SOPStart,                       ///< Trigger on Start of Packet (SOP) start
        HeaderStart,                    ///< Trigger on header start
        DataStart,                      ///< Trigger on data start
        MessageComplete,                ///< Trigger on message complete
        HardResetReceived,              ///< Trigger on hard reset received
        RuntPulseError,                 ///< Trigger on runt pulse error
        TimeoutError,                   ///< Trigger on timeout error
        InvalidKCodeError,              ///< Trigger on invalid K-code error
        CRCError,                       ///< Trigger on CRC error
        AnyError,                       ///< Trigger on any error
    };

    /**
     * @brief The status of the TriggerController
     * 
     */
    enum class TriggerStatus : uint32_t {
        Idle = 0,                       ///< Trigger controller is idle
        Armed,                          ///< Trigger controller is armed and waiting for event
        Triggered,                      ///< Trigger event has occurred
    };

    /**
     * @brief Callback function type for status change notifications
     * 
     * @param status The new status of the TriggerController
     */
    using TriggerStatusChangedCallback = std::function<void(TriggerStatus status)>;

    /**
     * @brief The TriggerController class
     * 
     * This class manages triggering logic based on events from the BMC decoder.
     * 
     * The controller operates based on one of several modes, which determine the conditions under which
     * a trigger event is generated. A trigger event threshold can be set to require multiple occurrences
     * of the specified event before a trigger is activated. The controller can also be configured to
     * automatically repeat triggering after a trigger event occurs.
     * 
     * The TriggerController integrates with the SyncManager to generate synchronization pulses
     * when a trigger event occurs, allowing for external systems to be synchronized with the detected events
     * through the SYNC port. The SyncManager supports pulsing high, pulsing low, toggling, or being 
     * disabled, in which case no sync signal is generated even if a trigger event occurs. For modes that
     * generate a sync pulse, the pulse width can be configured in microseconds.
     * 
     * The state of the TriggerController can be queried to determine if it is idle, armed and waiting for an event,
     * or if a trigger event has occurred. Note that, if auto-repeat is enabled, the controller will 
     * automatically re-arm itself after a trigger event, so it will never remain in the Triggered state.
     */
    class TriggerController {
    public:
        enum class SenderFilter : uint32_t {
            Any = 0,
            Source,
            Sink,
            Cable
        };

        struct MessageTypeFilter {
            uint32_t rawMessageType = 0;
            bool hasDataObjects = false;

            bool operator==(const MessageTypeFilter &other) const = default;
        };


        /**
         * @brief Construct a new TriggerController object
         * 
         * @param bmcDecoder Reference to the BMCDecoder instance to monitor for events
         * @param syncManager Reference to the SyncManager instance to control SYNC output
         */
        TriggerController(PHY::BMCDecoder& bmcDecoder, PHY::SyncManager& syncManager);

        /**
         * @brief Reset the TriggerController to its initial state
         * 
         * This method clears any current status and event counts, effectively
         * re-initializing the controller as if it were just constructed.
         */
        void reset();

        /**
         * @brief Get the current status of the TriggerController
         * 
         * @return TriggerStatus The current status of the controller
         */
        TriggerStatus status() const;

        /** 
         * @brief Set the operating mode of the TriggerController
         * 
         * @param mode The desired operating mode
         * 
         * @note This will clear any current status and event counts, as if
         *       reset() has been called.
         */
        void mode(TriggerControllerMode mode);

        /**
         * @brief Get the current operating mode of the TriggerController
         * 
         * @return TriggerControllerMode The current operating mode
         */
        TriggerControllerMode mode() const;

        /**
         * @brief Set the event threshold for triggering
         * 
         * @param count The number of events required to trigger
         * 
         * @note This will clear any current status and event counts, as if
         *       reset() has been called.
         */
        void eventThreshold(uint32_t count);

        /**
         * @brief Get the current event threshold for triggering
         * 
         * @return uint32_t The current event threshold
         */
        uint32_t eventThreshold() const;

        /**
         * @brief Get the current event count towards the trigger threshold
         * 
         * @return uint32_t The current event count
         */
        uint32_t eventCount() const;

        /** 
         * @brief Enable or disable automatic repeating of triggering
         * 
         * @param enable true to enable auto-repeat, false to disable
         */
        void autoRepeat(bool enable);

        /**
         * @brief Check if automatic repeating of triggering is enabled
         * 
         * @return true if auto-repeat is enabled, false otherwise
         */
        bool autoRepeat() const;

        /** 
         * @brief Set the SYNC mode of the SyncManager
         * 
         * @param mode The desired SYNC mode
         */
        void syncMode(PHY::SyncManagerMode mode);\

        /**
         * @brief Get the current SYNC mode of the SyncManager
         * 
         * @return PHY::SyncManagerMode The current SYNC mode
         */
        PHY::SyncManagerMode syncMode() const;

        /** 
         * @brief Set the SYNC pulse width in microseconds
         * 
         * @param widthUs The desired pulse width in microseconds
         */
        void syncPulseWidth(uint32_t widthUs);

        /**
         * @brief Get the current SYNC pulse width in microseconds
         * 
         * @return uint32_t The current pulse width in microseconds
         */
        uint32_t syncPulseWidth() const;

        /**
         * @brief Set the sender filter used in addition to the selected trigger event.
         *
         * @param filter Desired sender filter.
         */
        void senderFilter(SenderFilter filter);

        /**
         * @brief Return the configured sender filter.
         *
         * @return SenderFilter
         */
        SenderFilter senderFilter() const;

        /**
         * @brief Configure a message-type filter at a specific slot.
         *
         * If no slots are populated, any message type is accepted as long as the
         * other trigger conditions are met.
         *
         * @param slot Zero-based slot index.
         * @param filter Filter value to store in that slot.
         * @return true if the filter was accepted.
         * @return false if the slot is out of range, the value is invalid, or it duplicates another slot.
         */
        bool setMessageTypeFilter(size_t slot, const MessageTypeFilter &filter);

        /**
         * @brief Clear one configured message-type filter slot.
         *
         * @param slot Zero-based slot index.
         * @return true if the slot exists.
         * @return false if the slot is out of range.
         */
        bool clearMessageTypeFilter(size_t slot);

        /**
         * @brief Clear all configured message-type filters.
         *
         */
        void clearMessageTypeFilters();

        /**
         * @brief Return the configured message-type filter for one slot.
         *
         * @param slot Zero-based slot index.
         * @return std::optional<MessageTypeFilter> Slot contents when populated.
         */
        std::optional<MessageTypeFilter> messageTypeFilter(size_t slot) const;

        /**
         * @brief Return the total number of available filter slots.
         *
         * @return size_t
         */
        size_t messageTypeFilterCapacity() const;

        /**
         * @brief Set a callback to be invoked when the controller's status changes
         * 
         * @param callback The callback function to invoke on status changes
         */
        void statusChangedCallback(TriggerStatusChangedCallback callback);

    protected:
        PHY::BMCDecoder& _bmcDecoder;     ///< Reference to the BMCDecoder instance being monitored
        PHY::SyncManager& _syncManager;   ///< Reference to the SyncManager instance for SYNC output

        TriggerStatus _status = TriggerStatus::Idle;    ///< Current status of the TriggerController

        TriggerControllerMode _mode = TriggerControllerMode::Off;   ///< Current operating mode of the TriggerController
        uint32_t _eventThreshold = 1;    ///< Event threshold for triggering
        uint32_t _eventCount = 0;        ///< Current event count towards the trigger threshold
        bool _autoRepeat = false;        ///< Flag indicating if automatic repeating of triggering is enabled
        SenderFilter _senderFilter = SenderFilter::Any; ///< Configured sender filter.
        std::array<MessageTypeFilter, LOGIC_TRIGGER_CONTROLLER_MAX_MESSAGE_TYPE_FILTERS> _messageTypeFilters{};
        std::array<bool, LOGIC_TRIGGER_CONTROLLER_MAX_MESSAGE_TYPE_FILTERS> _messageTypeFilterEnabled{};

        TriggerStatusChangedCallback _statusChangedCallback;  ///< Callback for status change notifications

        /** 
         * @brief Internal handler for BMC decoder events
         * 
         * @param event The BMCDecodedMessageEvent received
         * @param message The associated BMCDecodedMessage
         */
        void _handleTriggerEvent(const PHY::BMCDecodedMessageEvent& event, PHY::BMCDecodedMessage& message);

        bool _messageHeaderKnownForEvent(const PHY::BMCDecodedMessageEvent& event, const PHY::BMCDecodedMessage& message) const;
        bool _senderKnownForEvent(const PHY::BMCDecodedMessageEvent& event, const PHY::BMCDecodedMessage& message) const;
        std::optional<SenderFilter> _messageSender(const PHY::BMCDecodedMessage& message) const;
        bool _messageMatchesSenderFilter(const PHY::BMCDecodedMessage& message) const;
        bool _hasMessageTypeFiltersConfigured() const;
        bool _messageMatchesFilters(const PHY::BMCDecodedMessage& message) const;
    };
    
} // namespace T76::DRPD::Logic
