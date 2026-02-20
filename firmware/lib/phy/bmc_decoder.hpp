/**
 * @file bmc_decoder.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The BMCDecoder class implements a BMC (Bi-Phase Mark Code) decoder using
 * the RP2350's PIO and DMA capabilities.
 * 
 * A PIO program (found in bmc_decoder.pio) captures pulse timing information
 * from a specified input pin and writes it to its RX FIFO. The high-level
 * threshold is determined by a PWM-generated reference voltage on a separate pin.
 * 
 * Separately, we set up a chained DMA configuration to transfer the pulse
 * timing data from the PIO RX FIFO to a circular buffer in RAM.
 * 
 * At regular intervals, a timer callback processes the data in the circular
 * buffer, feeding pulse timings to a BMCDecodedMessage instance for decoding.
 * 
 */

#pragma once

#include <cstdint>
#include <functional>

#include <pico/critical_section.h>
#include <pico/time.h>
#include <pico/util/queue.h>

#include "bmc_decoded_message.hpp"


namespace T76::DRPD::PHY {

    /**
     * @brief BMC (Bi-Phase Mark Code) Decoder class
     * 
     * This class sets up the PIO and DMA to decode BMC-encoded data from a specified
     * input pin. It uses a PIO program to capture pulse timings and a set of chained
     * DMA channels to transfer the data to a circular buffer in RAM.
     * 
     * The threshold for determining high state on the CC line is set using a PWM-generated
     * reference voltage on a separate pin. 
     * 
     * At regular intervals, a timer callback processes the data in the circular buffer,
     * feeding pulse timings to BMCDecodedMessage instances for decoding.
     * 
     * The class provides two initialization methods, one for each core of the RP2350.
     * They can be called in any order, but both must be called to fully initialize the decoder.
     * 
     */
    class BMCDecoder {
    public:
        typedef std::function<void(const BMCDecodedMessage &)> MessageReceivedCallback;
        typedef std::function<void(const BMCDecodedMessage *)> MessageReceivedCallbackByPointer;
        typedef std::function<void(const BMCDecodedMessageEvent &, BMCDecodedMessage&)> MessageEventCallback;

        BMCDecoder();

        /** 
         * @brief Initialize the BMC decoder on core 0
         * 
         * This method sets up a processing task on core 0 to handle decoded messages.
         */
        void initCore0();

        /** 
         * @brief Initialize the BMC decoder on core 1
         * 
         * This method sets up a processing task on core 1 to handle decoded messages.
         */
        void initCore1();

        /**
         * @brief Set the callback function to be called when a message is received
         * 
         * @param callback The callback function to be called when a message is received.
         *                 This will be called from a FreeRTOS task running on core 0.
         */
        void messageReceivedCallbackCore0(MessageReceivedCallback callback);

        /**
         * @brief Get the current message received callback function
         * 
         * @return The current message received callback function
         */
        MessageReceivedCallback messageReceivedCallbackCore0();

        /**
         * @brief Set the callback function to be called when a message is received
         * 
         * @param callback The callback function to be called when a message is received.
         *                 This will be called from a FreeRTOS task running on core 1 and
         *                 only when a message is received successfully.
         */
        void messageReceivedCallbackCore1(MessageReceivedCallbackByPointer callback);

        /**
         * @brief Get the current message received callback function
         * 
         * @return The current message received callback function
         */
        MessageReceivedCallbackByPointer messageReceivedCallbackCore1();

        /**
         * @brief Set the callback function to be called on message events
         * 
         * @param callback The callback function to be called on message events
         */
        void messageEventCallback(MessageEventCallback callback);

        /**
         * @brief Get the current message event callback function
         * 
         * @return The current message event callback function
         */
        MessageEventCallback messageEventCallback();

        /**
         * @brief Check if the decoder is enabled
         * 
         * @return true if the decoder is enabled, false otherwise
         */
        bool enabled() const;

        /**
         * @brief Enable or disable the decoder
         * 
         * @param enable true to enable the decoder, false to disable it
         */
        void enabled(bool enable);

        /**
         * @brief Get the number of nanoseconds per pulse width PIO cycle
         * 
         * @note This value is derived from the PIO clock frequency configured
         *       for the BMC decoder PIO program and can be used to convert
         *       pulse widths from PIO cycles to absolute time units.
         * 
         * @return The number of nanoseconds per pulse width PIO cycle
         */
        float nsPerPulseWidthPIOCycle() const;

        /**
         * @brief Set the carrier CC threshold voltage
         * 
         * This voltage is used to determine whether a received pulse
         * corresponds to a high status on the CC line.
         * 
         * @param voltage The carrier CC threshold voltage in volts
         */
        void ccThresholdVoltage(float voltage);

        /**
         * @brief Get the carrier CC threshold voltage
         * 
         * This voltage is used to determine whether a received pulse
         * corresponds to a high status on the CC line.
         * 
         * @return The carrier CC threshold voltage in volts
         */
        float ccThresholdVoltage() const;

        /**
         * @brief Run one Core-1 decoding iteration.
         *
         * Processes unread pulse widths from the DMA circular buffer and
         * advances message decode state for any completed transfers.
         */
        void loopCore1();

    protected:
        float _ccThresholdVoltage = PHY_BMC_DECODER_CC_VREF_DEFAULT; ///< Carrier CC threshold voltage
        uint16_t _pwmWrapValue; ///< Wrap value for the PWM channel; used to update the CC threshold voltage

        int _dataDMAChannel; ///< DMA channel for data transfer

        uint _stateMachine; ///< PIO state machine used for decoding
        bool _enabled; ///< Flag indicating if the decoder is enabled

        uint32_t _controlDMAData[2]; ///< Control data for the DMA channels
        uint32_t *_circularBuffer; ///< Pointer to the circular buffer for storing decoded data
        repeating_timer_t _timer; ///< Repeating timer for processing the buffer

        queue_t _messageQueue; ///< Queue for completed decoded messages
        uint32_t _transferCount; ///< Number of transfers completed

        BMCDecodedMessage *_messageBuffer; ///< Buffer of decoded message instances
        uint32_t _currentMessageIndex = 0; ///< Index of the current message being processed

        BMCDecodedMessage* _currentMessage = nullptr; ///< Pointer to the current message being processed

        MessageReceivedCallback _messageReceivedCallbackCore0 = nullptr; ///< Callback function for received messages on core 0
        MessageReceivedCallbackByPointer _messageReceivedCallbackCore1 = nullptr; ///< Callback function for received messages on core 1
        MessageEventCallback _messageEventCallback = nullptr; ///< Callback function for message events

        /** 
         * @brief Processing task for handling decoded messages
         * 
         * This method runs in a separate task and processes completed
         * decoded messages from the message queue. It currently calls
         * a user-defined callback function when a message is received.
         */
        void _processingTask();
    };

} // namespace T76::DRPD::PHY
