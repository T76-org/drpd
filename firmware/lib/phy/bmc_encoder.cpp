/**
 * @file bmc_encoder.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "bmc_encoder.hpp"

#include <pico/platform.h>

#include "bmc_encoder.pio.h"


using namespace T76::DRPD::PHY;

BMCEncoder::BMCEncoder() {
    queue_init(&_messageQueue, sizeof(BitPacker), PHY_BMC_ENCODER_QUEUE_LENGTH);
}

void BMCEncoder::initCore1() {

    // Init the output pin and set it to input (high-Z) initially

    pio_gpio_init(PHY_BMC_ENCODER_PIO, PHY_BMC_ENCODER_CC_OUT_HIGH_PIN);
    pio_gpio_init(PHY_BMC_ENCODER_PIO, PHY_BMC_ENCODER_CC_OUT_LOW_PIN);

    pio_sm_set_pins_with_mask(
        PHY_BMC_ENCODER_PIO, 
        _stateMachine, 
        0u << PHY_BMC_ENCODER_CC_OUT_HIGH_PIN | 0u << PHY_BMC_ENCODER_CC_OUT_LOW_PIN, 
        1u << PHY_BMC_ENCODER_CC_OUT_HIGH_PIN | 1u << PHY_BMC_ENCODER_CC_OUT_LOW_PIN
    ); // Set initial pin state to 0

    pio_sm_set_pindirs_with_mask(
        PHY_BMC_ENCODER_PIO, 
        _stateMachine, 
        0u << PHY_BMC_ENCODER_CC_OUT_HIGH_PIN | 0u << PHY_BMC_ENCODER_CC_OUT_LOW_PIN, 
        1u << PHY_BMC_ENCODER_CC_OUT_HIGH_PIN | 1u << PHY_BMC_ENCODER_CC_OUT_LOW_PIN
    ); // Set pin as input initially

    // Load the PIO program and configure the state machine.

    _stateMachine = pio_claim_unused_sm(PHY_BMC_ENCODER_PIO, true);
    _programOffset = pio_add_program(PHY_BMC_ENCODER_PIO, &bmc_encoder_program);
    _pioConfig = bmc_encoder_program_get_default_config(_programOffset);

    sm_config_set_clkdiv(&_pioConfig, float(SYS_CLK_HZ) / PHY_BMC_ENCODER_PIO_CLOCK_FREQUENCY_HZ);
    sm_config_set_in_pins(&_pioConfig, PHY_BMC_ENCODER_CC_OUT_LOW_PIN);
    sm_config_set_in_pin_count(&_pioConfig, 2); // This is necessary to read no more than 2 pins
    sm_config_set_out_pins(&_pioConfig, PHY_BMC_ENCODER_CC_OUT_LOW_PIN, 2);
    sm_config_set_set_pins(&_pioConfig, PHY_BMC_ENCODER_CC_OUT_LOW_PIN, 2);
    sm_config_set_fifo_join(&_pioConfig, PIO_FIFO_JOIN_TX);
    sm_config_set_out_shift(&_pioConfig, true, true, 32);

    pio_set_irq0_source_enabled(PHY_BMC_ENCODER_PIO, pis_interrupt0, true);

    uint irqNum = pio_get_irq_num(PHY_BMC_ENCODER_PIO, 0);
    irq_set_priority(irqNum, PHY_BMC_ENCODER_IRQ_PRIORITY);

    static BMCEncoder *self = this;

    irq_set_exclusive_handler(irqNum, []() {
        pio_sm_set_enabled(PHY_BMC_ENCODER_PIO, self->_stateMachine, false);
        pio_interrupt_clear(PHY_BMC_ENCODER_PIO, 0);
        self->_hasMessageInProgress = false;
    });

    irq_set_enabled(irqNum, true);

    // Set up a DMA channel for transferring data to the PIO TX FIFO

    _dmaChannel = dma_claim_unused_channel(true);
    dma_channel_config dmaConfig = dma_channel_get_default_config(_dmaChannel);
    channel_config_set_transfer_data_size(&dmaConfig, DMA_SIZE_32);
    channel_config_set_dreq(&dmaConfig, pio_get_dreq(PHY_BMC_ENCODER_PIO, _stateMachine, true));
    dma_channel_configure(
        _dmaChannel,
        &dmaConfig,
        &PHY_BMC_ENCODER_PIO->txf[_stateMachine], // Write address
        nullptr,                                  // Read address (to be set later)
        0,                                        // Transfer count (to be set later)
        false                                     // Don't start yet
    );

    // Initialize the PIO state machine
        
    pio_sm_init(
        PHY_BMC_ENCODER_PIO,
        _stateMachine,
        _programOffset,
        &_pioConfig
    );

    pio_sm_set_enabled(PHY_BMC_ENCODER_PIO, _stateMachine, false);
}

bool BMCEncoder::activate() {
    return true; // Return true if activation was successful
}

void BMCEncoder::makeSafe() {
    gpio_set_dir(PHY_BMC_ENCODER_CC_OUT_HIGH_PIN, GPIO_IN); // Set as input to make safe
    gpio_set_dir(PHY_BMC_ENCODER_CC_OUT_LOW_PIN, GPIO_IN); // Set as input to make safe
}

void BMCEncoder::encodeAndSendMessage(const BMCEncodedMessage& message) {
    const BitPacker encoded = message.encoded();

    if (!queue_try_add(&_messageQueue, &encoded)) {
        //TODO: Handle queue full (e.g. drop message, signal error, etc.)
    }
}

void BMCEncoder::sendGoodCRCForDecodedMessage(const BMCDecodedMessage& decodedMessage) {
    BMCEncodedMessage goodCRCMessage = BMCEncodedMessage::goodCRCMessageForMessage(decodedMessage);
    encodeAndSendMessage(goodCRCMessage);
}

void BMCEncoder::sendNotAcceptedMessage(Proto::PDHeader::PortDataRole portDataRole, Proto::PDHeader::PortPowerRole portPowerRole) {
    BMCEncodedMessage notAcceptedMessage = BMCEncodedMessage::notAcceptedMessage(portDataRole, portPowerRole);
    encodeAndSendMessage(notAcceptedMessage);
}

void BMCEncoder::loopCore1() {
    if (_hasMessageInProgress) {
        return;
    }

    BitPacker out;

    if (!queue_try_remove(&_messageQueue, &_messageInProgress)) {
        return;
    }
    
    _hasMessageInProgress = true;

    pio_sm_init(
        PHY_BMC_ENCODER_PIO,
        _stateMachine,
        _programOffset,
        &_pioConfig
    );

    pio_sm_put_blocking(PHY_BMC_ENCODER_PIO, _stateMachine, _messageInProgress.totalBitsWritten()); // Total bit count
    pio_sm_exec_wait_blocking(PHY_BMC_ENCODER_PIO, _stateMachine, pio_encode_out(pio_y, 32)); // Move bit count into Y

    // Set up the DMA transfer

    const std::span<const uint32_t> buffer = _messageInProgress.buffer();
    dma_channel_set_read_addr(_dmaChannel, buffer.data(), false);
    dma_channel_set_transfer_count(_dmaChannel, buffer.size(), true);

    // Clear interrupt and enable the state machine

    pio_interrupt_clear(PHY_BMC_ENCODER_PIO, 0);
    pio_sm_set_enabled(PHY_BMC_ENCODER_PIO, _stateMachine, true);
}
