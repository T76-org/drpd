/**
 * @file bmc_encoder.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "bmc_encoder.hpp"

#include <hardware/gpio.h>
#include <pico/platform.h>

#include "bmc_encoder.pio.h"
#include "bmc_encoder_single_pin.pio.h"


using namespace T76::DRPD::PHY;

namespace {
    constexpr uint8_t kHardResetKCode1 = 0x07;
    constexpr uint8_t kHardResetKCode2 = 0x19;

    BitPacker hardResetSignalingBits() {
        BitPacker bitPacker;
        bitPacker.addBits(0b1010'1010'1010'1010'1010'1010'1010'1010, 32);
        bitPacker.addBits(0b1010'1010'1010'1010'1010'1010'1010'1010, 32);
        bitPacker.addBits(kHardResetKCode1, 5);
        bitPacker.addBits(kHardResetKCode1, 5);
        bitPacker.addBits(kHardResetKCode1, 5);
        bitPacker.addBits(kHardResetKCode2, 5);
        bitPacker.flush();
        return bitPacker;
    }
}

BMCEncoder::BMCEncoder() {
    queue_init(&_messageQueue, sizeof(BitPacker), PHY_BMC_ENCODER_QUEUE_LENGTH);
}

void BMCEncoder::outputMode(BMCEncoderOutputMode mode) {
    _outputMode = mode;
}

BMCEncoderOutputMode BMCEncoder::outputMode() const {
    return _outputMode;
}

void BMCEncoder::_selectPioProgramForOutputMode() {
    switch (_outputMode) {
        case BMCEncoderOutputMode::SinglePinWithEnable:
            _activeProgram = &bmc_encoder_single_pin_program;
            _activeOutputPinBase = PHY_BMC_ENCODER_CC_OUT_LOW_PIN;
            _activeOutputPinCount = 1;
            break;

        case BMCEncoderOutputMode::DualPinLegacy:
        default:
            _activeProgram = &bmc_encoder_program;
            _activeOutputPinBase = PHY_BMC_ENCODER_CC_OUT_LOW_PIN;
            _activeOutputPinCount = 2;
            break;
    }
}

void BMCEncoder::_initLegacyDualPinOutput() {
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
    ); // Set pins as input initially
}

void BMCEncoder::_initSinglePinWithEnableOutput() {
    pio_gpio_init(PHY_BMC_ENCODER_PIO, PHY_BMC_ENCODER_CC_OUT_LOW_PIN);

    gpio_init(PHY_BMC_ENCODER_CC_OUT_HIGH_PIN);
    gpio_set_dir(PHY_BMC_ENCODER_CC_OUT_HIGH_PIN, GPIO_OUT);
    _setTransmitEnable(false);

    pio_sm_set_pins_with_mask(
        PHY_BMC_ENCODER_PIO,
        _stateMachine,
        0u << PHY_BMC_ENCODER_CC_OUT_LOW_PIN,
        1u << PHY_BMC_ENCODER_CC_OUT_LOW_PIN
    ); // Set initial signal pin state to 0

    pio_sm_set_pindirs_with_mask(
        PHY_BMC_ENCODER_PIO,
        _stateMachine,
        0u << PHY_BMC_ENCODER_CC_OUT_LOW_PIN,
        1u << PHY_BMC_ENCODER_CC_OUT_LOW_PIN
    ); // Set signal pin as input initially
}

void BMCEncoder::_setTransmitEnable(bool enabled) {
    if (_outputMode != BMCEncoderOutputMode::SinglePinWithEnable) {
        return;
    }

    gpio_put(PHY_BMC_ENCODER_CC_OUT_HIGH_PIN, enabled);
    _transmitEnableAsserted = enabled;
}

void BMCEncoder::initCore1() {
    // Claim the state machine before issuing any SM-specific pin operations.
    _stateMachine = pio_claim_unused_sm(PHY_BMC_ENCODER_PIO, true);
    _selectPioProgramForOutputMode();

    // Init the output pin and set it to input (high-Z) initially
    if (_outputMode == BMCEncoderOutputMode::SinglePinWithEnable) {
        _initSinglePinWithEnableOutput();
    } else {
        _initLegacyDualPinOutput();
    }

    // Load the PIO program and configure the state machine.

    _programOffset = pio_add_program(PHY_BMC_ENCODER_PIO, _activeProgram);
    _pioConfig = _outputMode == BMCEncoderOutputMode::SinglePinWithEnable
        ? bmc_encoder_single_pin_program_get_default_config(_programOffset)
        : bmc_encoder_program_get_default_config(_programOffset);

    sm_config_set_clkdiv(&_pioConfig, float(SYS_CLK_HZ) / PHY_BMC_ENCODER_PIO_CLOCK_FREQUENCY_HZ);
    sm_config_set_in_pins(&_pioConfig, _activeOutputPinBase);
    sm_config_set_in_pin_count(&_pioConfig, _activeOutputPinCount);
    sm_config_set_out_pins(&_pioConfig, _activeOutputPinBase, _activeOutputPinCount);
    sm_config_set_set_pins(&_pioConfig, _activeOutputPinBase, _activeOutputPinCount);
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
        self->_setTransmitEnable(false);
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
    _setTransmitEnable(false);
    if (_outputMode == BMCEncoderOutputMode::SinglePinWithEnable) {
        gpio_set_dir(PHY_BMC_ENCODER_CC_OUT_HIGH_PIN, GPIO_OUT);
    } else {
        gpio_set_dir(PHY_BMC_ENCODER_CC_OUT_HIGH_PIN, GPIO_IN);
    }
    gpio_set_dir(PHY_BMC_ENCODER_CC_OUT_LOW_PIN, GPIO_IN); // Set as input to make safe
}

void BMCEncoder::encodeAndSendMessage(const BMCEncodedMessage& message) {
    const BitPacker encoded = message.encoded();

    if (!queue_try_add(&_messageQueue, &encoded)) {
        //TODO: Handle queue full (e.g. drop message, signal error, etc.)
    }
}

void BMCEncoder::sendHardResetSignaling() {
    if (_dmaChannel != -1) {
        dma_channel_abort(_dmaChannel);
    }

    pio_sm_set_enabled(PHY_BMC_ENCODER_PIO, _stateMachine, false);
    pio_sm_clear_fifos(PHY_BMC_ENCODER_PIO, _stateMachine);
    _hasMessageInProgress = false;
    _setTransmitEnable(false);

    BitPacker discarded;
    while (queue_try_remove(&_messageQueue, &discarded)) {
    }

    const BitPacker hardReset = hardResetSignalingBits();
    (void)queue_try_add(&_messageQueue, &hardReset);
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
    _setTransmitEnable(true);
    pio_sm_set_enabled(PHY_BMC_ENCODER_PIO, _stateMachine, true);
}
