/**
 * @file bmc_decoder.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "bmc_decoder.hpp"

#include <utility>

#include <FreeRTOS.h>
#include <task.h>

#include <hardware/dma.h>
#include <hardware/pio.h>
#include <hardware/pwm.h>
#include <stdio.h>

#include "bmc_decoder.pio.h"
#include "4b5b.hpp"


using namespace T76::DRPD::PHY;


BMCDecoder::BMCDecoder() : 
    _dataDMAChannel(-1),
    _stateMachine(0),
    _enabled(false),
    _circularBuffer(nullptr),
    _messageBuffer(nullptr) {
    critical_section_init(&_callbackCriticalSection);
    queue_init(&_messageQueue, sizeof(BMCDecodedMessage*), PHY_BMC_DECODER_QUEUE_LENGTH);

    // Allocate circular buffers for storing decoded data. We
    // do this at runtime to avoid having to calculate the size
    // of the RAM available to FreeRTOS at compile time.

    _messageBuffer = new BMCDecodedMessage[PHY_BMC_DECODER_MESSAGE_BUFFER_SIZE];

    if (!_messageBuffer) {
        while(true) {
            printf("Failed to allocate message buffer!\n");
            sleep_ms(1000);
        }
    }
    _currentMessage = &_messageBuffer[0];

    _circularBuffer = new uint32_t[PHY_BMC_DECODER_CIRCULAR_BUFFER_SIZE];
    if (!_circularBuffer) {
        while(true) {
            printf("Failed to allocate circular buffer!\n");
            sleep_ms(1000);
        }
    }
}

void BMCDecoder::initCore0() {
    xTaskCreate(
        [](void *param) {
            static_cast<BMCDecoder *>(param)->_processingTask();
        },
        "BMCDProc",
        PHY_BMC_DECODER_CORE0_TASK_STACK_SIZE,
        this,
        PHY_BMC_DECODER_CORE0_TASK_PRIORITY,
        nullptr
    );
}

void BMCDecoder::initCore1() {
    // Initialize the PWM channel for CC thresholding

    gpio_set_function(PHY_BMC_DECODER_CC_VREF_PWM_PIN, GPIO_FUNC_PWM);
    
    uint slice = pwm_gpio_to_slice_num(PHY_BMC_DECODER_CC_VREF_PWM_PIN);
    _pwmWrapValue = (SYS_CLK_MHZ * 1'000'000.0f / PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_HZ) - 1;
    
    pwm_config pwmConfig = pwm_get_default_config();
    pwm_config_set_wrap(&pwmConfig, _pwmWrapValue);
    pwm_init(slice, &pwmConfig, true);
    pwm_set_gpio_level(PHY_BMC_DECODER_CC_VREF_PWM_PIN, (uint16_t)(PHY_BMC_DECODER_CC_VREF_DEFAULT / 3.3f * (_pwmWrapValue + 1)));

    // Initialize the PIO and load the BMC decoder program
    gpio_set_function(PHY_BMC_DECODER_INPUT_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_BMC_DECODER_INPUT_PIN);
    gpio_set_dir(PHY_BMC_DECODER_INPUT_PIN, GPIO_IN);

    _stateMachine = pio_claim_unused_sm(PHY_BMC_DECODER_PIO, true);
    uint offset = pio_add_program(PHY_BMC_DECODER_PIO, &bmc_decoder_program);

    pio_sm_config c = bmc_decoder_program_get_default_config(offset);

    // Configure the pin for JMP PIN instruction
    sm_config_set_jmp_pin(&c, PHY_BMC_DECODER_INPUT_PIN);    
    sm_config_set_in_pins(&c, PHY_BMC_DECODER_INPUT_PIN);

    // Set the clock divider to scale the system clock to the desired bit rate.
    sm_config_set_clkdiv(&c, SYS_CLK_MHZ * 1'000'000.0f / PHY_BMC_DECODER_PIO_CLOCK_HZ);

    // Initialize the state machine, but don't start it yet

    pio_sm_init(PHY_BMC_DECODER_PIO, _stateMachine, offset, &c);
    pio_sm_set_enabled(PHY_BMC_DECODER_PIO, _stateMachine, false);

    // Load the cycle timeout value into the Y register of the state machine.

    pio_sm_put_blocking(PHY_BMC_DECODER_PIO, _stateMachine, BMCDecodedMessage::TimeoutPulseWidthPIOCycles);
    pio_sm_exec_wait_blocking(PHY_BMC_DECODER_PIO, _stateMachine, pio_encode_pull(false, true));
    pio_sm_exec_wait_blocking(PHY_BMC_DECODER_PIO, _stateMachine, pio_encode_mov(pio_y, pio_osr));

    // Set up a circular buffer using chained DMA channels. The PIO program 
    // writes pulse timing information to the data buffer via the data DMA 
    // channel; when the buffer is full, an interrupt triggers the control 
    // DMA channel to reset the data DMA channel to the start of the buffer,
    // allowing for continuous data capture.

    int controlDMAChannel = dma_claim_unused_channel(true);
    _dataDMAChannel = dma_claim_unused_channel(true);

    // The control DMA channel only contains the start address of the data buffer
    // and its size. We set it up to copy that information to the data DMA channel's
    // read address and transfer count registers when triggered.

    _controlDMAData[0] = reinterpret_cast<uint32_t>(_circularBuffer);
    _controlDMAData[1] = PHY_BMC_DECODER_CIRCULAR_BUFFER_SIZE * sizeof(uint32_t);

    dma_channel_config_t controlDMAConfig = dma_channel_get_default_config(controlDMAChannel);

    channel_config_set_transfer_data_size(&controlDMAConfig, DMA_SIZE_32);
    channel_config_set_read_increment(&controlDMAConfig, false);
    channel_config_set_write_increment(&controlDMAConfig, false);
    channel_config_set_ring(&controlDMAConfig, false, 3);
    channel_config_set_chain_to(&controlDMAConfig, _dataDMAChannel);

    dma_channel_configure(
        controlDMAChannel,                                // Channel to configure
        &controlDMAConfig,                                // Configuration
        &dma_hw->ch[_dataDMAChannel].al1_write_addr,      // Destination
        &_controlDMAData,                                 // Source address
        2,                                                // Number of transfers
        false                                             // Don't start yet
    );

    // The data DMA channel is triggered by the PIO program by PUSH instructions
    // whenever new data is available. We chain it to the control DMA channel so that
    // when the buffer is full, it triggers the control DMA to reset it.

    dma_channel_config_t dataDMAConfig = dma_channel_get_default_config(_dataDMAChannel);

    channel_config_set_transfer_data_size(&dataDMAConfig, DMA_SIZE_32);
    channel_config_set_read_increment(&dataDMAConfig, false);
    channel_config_set_write_increment(&dataDMAConfig, true);
    channel_config_set_dreq(&dataDMAConfig, pio_get_dreq(PHY_BMC_DECODER_PIO, _stateMachine, false));
    channel_config_set_chain_to(&dataDMAConfig, controlDMAChannel);
    channel_config_set_irq_quiet(&dataDMAConfig, true);

    dma_channel_configure(
        _dataDMAChannel,                                  // Channel to configure
        &dataDMAConfig,                                   // Configuration
        _circularBuffer,                                  // Destination address
        &PHY_BMC_DECODER_PIO->rxf[_stateMachine],         // Source (PIO RX FIFO)
        PHY_BMC_DECODER_CIRCULAR_BUFFER_SIZE,             // Number of transfers
        false                                             // Don't start yet
    );  

    dma_channel_set_irq0_enabled(_dataDMAChannel, true); 
    dma_channel_start(controlDMAChannel);

    // Set up a timer to monitor the circular buffer for new data and
    // process it as needed.
    // TODO: Use a hardware timer if we need better timing accuracy

    add_repeating_timer_us(
        -1000000 / PHY_BMC_DECODER_DECODER_INTERRUPT_FREQUENCY_HZ,
        BMCDecoder::_timerCallback,
        this,
        &_timer
    );

    // Keep the decoder disabled until explicitly enabled

    pio_sm_set_enabled(PHY_BMC_DECODER_PIO, _stateMachine, false);
    _enabled = false;
}

void BMCDecoder::messageReceivedCallbackCore0(MessageReceivedCallback callback) {
    critical_section_enter_blocking(&_callbackCriticalSection);
    _messageReceivedCallbackCore0 = std::move(callback);
    critical_section_exit(&_callbackCriticalSection);
}

BMCDecoder::MessageReceivedCallback BMCDecoder::messageReceivedCallbackCore0() {
    critical_section_enter_blocking(&_callbackCriticalSection);
    auto callback = _messageReceivedCallbackCore0;
    critical_section_exit(&_callbackCriticalSection);
    return callback;
}

void BMCDecoder::messageReceivedCallbackCore1(MessageReceivedCallbackByPointer callback) {
    critical_section_enter_blocking(&_callbackCriticalSection);
    _messageReceivedCallbackCore1 = std::move(callback);
    critical_section_exit(&_callbackCriticalSection);
}

BMCDecoder::MessageReceivedCallbackByPointer BMCDecoder::messageReceivedCallbackCore1() {
    critical_section_enter_blocking(&_callbackCriticalSection);
    auto callback = _messageReceivedCallbackCore1;
    critical_section_exit(&_callbackCriticalSection);
    return callback;
}

void BMCDecoder::messageEventCallback(MessageEventCallback callback) {
    critical_section_enter_blocking(&_callbackCriticalSection);
    _messageEventCallback = std::move(callback);
    critical_section_exit(&_callbackCriticalSection);
}

BMCDecoder::MessageEventCallback BMCDecoder::messageEventCallback() {
    critical_section_enter_blocking(&_callbackCriticalSection);
    auto callback = _messageEventCallback;
    critical_section_exit(&_callbackCriticalSection);
    return callback;
}

bool BMCDecoder::enabled() const {
    return _enabled;
}

void BMCDecoder::enabled(bool enable) {
    _enabled = enable;
    pio_sm_set_enabled(PHY_BMC_DECODER_PIO, _stateMachine, enable);
}

float BMCDecoder::nsPerPulseWidthPIOCycle() const {
    return 1'000'000'000.0f / PHY_BMC_DECODER_PIO_CLOCK_HZ * 2;
}

void BMCDecoder::ccThresholdVoltage(float voltage) {
    if (voltage < 0.0f) {
        voltage = 0.0f;
    } else if (voltage > 3.3f) {
        voltage = 3.3f;
    }

    _ccThresholdVoltage = voltage;

    pwm_set_gpio_level(PHY_BMC_DECODER_CC_VREF_PWM_PIN, (uint16_t)(voltage / 3.3f * (_pwmWrapValue + 1)));
}

float BMCDecoder::ccThresholdVoltage() const {
    return _ccThresholdVoltage;
}

bool BMCDecoder::_timerCallback(repeating_timer_t *rt) {
    // Get the BMCDecoder instance from the timer's user_data
    BMCDecoder* decoder = static_cast<BMCDecoder*>(rt->user_data);

    uint32_t completedTransferCount = PHY_BMC_DECODER_CIRCULAR_BUFFER_SIZE - dma_hw->ch[decoder->_dataDMAChannel].transfer_count;

    while (decoder->_transferCount != completedTransferCount) {
        uint32_t pulseWidth = decoder->_circularBuffer[decoder->_transferCount];

        BMCDecodedMessageEvent messageEvent = decoder->_currentMessage->feedPulse(pulseWidth);

        if (messageEvent != BMCDecodedMessageEvent::None) {
            BMCDecoder::MessageEventCallback messageEventCallback = nullptr;
            critical_section_enter_blocking(&decoder->_callbackCriticalSection);
            messageEventCallback = decoder->_messageEventCallback;
            critical_section_exit(&decoder->_callbackCriticalSection);

            if (messageEventCallback) {
                messageEventCallback(messageEvent, *decoder->_currentMessage);
            }
        }

        if (BMC_DECODED_MESSAGE_EVENT_IS_COMPLETION(messageEvent)) {
            if (decoder->_currentMessage->data().size() > 0) {
                if (messageEvent == BMCDecodedMessageEvent::MessageComplete ||
                    messageEvent == BMCDecodedMessageEvent::HardResetReceived) {
                    BMCDecoder::MessageReceivedCallbackByPointer messageReceivedCallback = nullptr;
                    critical_section_enter_blocking(&decoder->_callbackCriticalSection);
                    messageReceivedCallback = decoder->_messageReceivedCallbackCore1;
                    critical_section_exit(&decoder->_callbackCriticalSection);

                    if (messageReceivedCallback) {
                        messageReceivedCallback(decoder->_currentMessage);
                    }
                }
    
                // Enqueue the completed message for processing
                queue_add_blocking(&decoder->_messageQueue, &decoder->_currentMessage);

                // Move to the next message buffer
                decoder->_currentMessageIndex = (decoder->_currentMessageIndex + 1) % PHY_BMC_DECODER_MESSAGE_BUFFER_SIZE;
                decoder->_currentMessage = &decoder->_messageBuffer[decoder->_currentMessageIndex];
            }

            // Reset the current message. For timeouts, we reuse the same message.
            decoder->_currentMessage->reset();
        }

        // Advance the read pointer, wrapping around if necessary
        decoder->_transferCount = (decoder->_transferCount + 1) % PHY_BMC_DECODER_CIRCULAR_BUFFER_SIZE;
    }
    
    // Return true to continue the timer
    return true;
}

void BMCDecoder::_processingTask() {
    BMCDecodedMessage* messagePtr;

    while (true) {
        // Wait for a message to be available in the queue
        if (queue_is_empty(&_messageQueue)) {
            vTaskDelay(pdMS_TO_TICKS(10));
            continue;
        }

        queue_remove_blocking(&_messageQueue, &messagePtr);

        MessageReceivedCallback messageReceivedCallback = nullptr;
        critical_section_enter_blocking(&_callbackCriticalSection);
        messageReceivedCallback = _messageReceivedCallbackCore0;
        critical_section_exit(&_callbackCriticalSection);

        // If a callback is set, call it with the received message
        if (messageReceivedCallback) {
            messageReceivedCallback(*messagePtr);
        }
    }
}
