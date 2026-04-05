/**
 * @file bmc_encoder.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The BMCEncoder class is responsible for encoding and transmitting
 * USB Power Delivery messages using Biphase Mark Coding (BMC) over
 * the CC lines. It utilizes a PIO state machine to handle the precise
 * timing requirements of BMC signaling.
 * 
 * The encoder uses two pins to drive the CC line high and low. In
 * hardware, this causes the CC line to be either driven high to a
 * dedicated 1.1V level (for a mark), driven low to ground (for a space),
 * or left floating (for the idle state between messages):
 * 
 * CC_OUT_HIGH_PIN | CC_OUT_LOW_PIN | CC Line State
 * ----------------|----------------|----------------
 *        0        |       0        | High-Z (idle)
 *        1        |       0        | Driven High (mark)
 *        0        |       1        | Driven Low (space)
 *        1        |       1        | Invalid State (avoid)
 * 
 * Driving both pins high causes the 1.1V supply to be shorted to ground,
 * which is an invalid state and must be avoided.
 * 
 * Note that, in order to work properly, the HIGH and LOW pins must be
 * on sequential GPIO numbers, with the HIGH pin having the higher GPIO
 * number. This is required by the PIO program.
 * 
 * The encoder uses a message queue to buffer outgoing messages and
 * a repeating timer to manage the transmission process. It also
 * attempts to minimize CPU usage by only activating the timer when
 * there are messages to send.
 * 
 * The BMCEncoder class is designed as a SafeableComponent, allowing it
 * to be safely activated and deactivated within the system's safety
 * framework.
 */

#pragma once

#include <hardware/dma.h>
#include <hardware/pio.h>
#include <pico/time.h>
#include <pico/sync.h>
#include <pico/util/queue.h>

#include <array>

#include <t76/safety.hpp>

#include "bmc_encoded_message.hpp"


namespace T76::DRPD::PHY {

    /** 
     * @brief Encoder for BMC-encoded USB-PD messages.
     * 
     * The BMCEncoder class is responsible for encoding and transmitting
     * USB Power Delivery messages using Biphase Mark Coding (BMC) over
     * the CC lines. It utilizes a PIO state machine to handle the precise
     * timing requirements of BMC signaling.
     * 
     * The encoder uses two pins to drive the CC line high and low. In
     * hardware, this causes the CC line to be either driven high to a
     * dedicated 1.1V level (for a mark), driven low to ground (for a space),
     * or left floating (for the idle state between messages):
     * 
     * CC_OUT_HIGH_PIN | CC_OUT_LOW_PIN | CC Line State
     * ----------------|----------------|----------------
     *        0        |       0        | High-Z (idle)
     *        1        |       0        | Driven High (mark)
     *        0        |       1        | Driven Low (space)
     *        1        |       1        | Invalid State (avoid)
     * 
     * Driving both pins high causes the 1.1V supply to be shorted to ground,
     * which is an invalid state and must be avoided.
     * 
     * Note that, in order to work properly, the HIGH and LOW pins must be
     * on sequential GPIO numbers, with the HIGH pin having the higher GPIO
     * number. This is required by the PIO program.
     * 
     * The encoder uses a message queue to buffer outgoing messages and
     * a repeating timer to manage the transmission process. It also
     * attempts to minimize CPU usage by only activating the timer when
     * there are messages to send.
     * 
     * The BMCEncoder class is designed as a SafeableComponent, allowing it
     * to be safely activated and deactivated within the system's safety
     * framework.
     */
    class BMCEncoder : public T76::Core::Safety::SafeableComponent {
    public:
        /**
         * @brief Construct encoder and initialize thread-safe message queue.
         */
        BMCEncoder();

        /** 
         * @brief Initialize the BMC encoder on core 1.
         * 
         * This method sets up the PIO state machine, DMA channel,
         * and interrupt handler for BMC encoding. It should be called
         * from core 1 during system initialization.
         */
        void initCore1();

        /** 
         * @brief Encode and send a BMCEncodedMessage.
         * 
         * This method encodes the given BMCEncodedMessage and
         * queues it for transmission. If the transmission timer
         * is not already running, it starts the timer to handle
         * the message sending.
         * 
         * @param message The BMCEncodedMessage to encode and send.
         */
        void encodeAndSendMessage(const BMCEncodedMessage& message);

        /** 
         * @brief Send a GoodCRC response for the given decoded message.
         * 
         * This method constructs a GoodCRC BMCEncodedMessage in response
         * to the provided BMCDecodedMessage and queues it for transmission.
         * 
         * @param decodedMessage The decoded message to respond to.
         */
        void sendGoodCRCForDecodedMessage(const BMCDecodedMessage& decodedMessage);

        /** 
         * @brief Send a Not_Accepted response message.
         * 
         * This method constructs a Not_Accepted BMCEncodedMessage with the
         * specified port data and power roles, and queues it for transmission.
         * 
         * @param portDataRole The port data role to set in the header.
         * @param portPowerRole The port power role to set in the header.
         */
        void sendNotAcceptedMessage(Proto::PDHeader::PortDataRole portDataRole, Proto::PDHeader::PortPowerRole portPowerRole);

        /**
         * @brief Run one Core-1 transmission iteration.
         *
         * If no DMA transfer is active, this attempts to dequeue one pending
         * encoded message and start a new transmit operation.
         */
        void loopCore1();

        // Safeable component overrides

        bool activate() override;
        void makeSafe() override;
        const char* getComponentName() const override { return "BMCEncoder"; }

    protected:
        pio_sm_config _pioConfig;   ///< PIO state machine configuration
        uint _stateMachine = 0;     ///< PIO state machine index
        uint _programOffset = 0;    ///< Offset of the BMC encoder program in PIO memory
        int _dmaChannel = -1;       ///< DMA channel used for data transfer

        queue_t _messageQueue; ///< Thread-safe queue of outgoing encoded messages.
        repeating_timer_t _transmissionTimer; ///< Repeating timer for managing transmissions

        BitPacker _messageInProgress;    ///< Currently transmitting message
        bool _hasMessageInProgress = false; ///< True when DMA transmission is active.
    };
    
} // namespace T76::DRPD::PHY
