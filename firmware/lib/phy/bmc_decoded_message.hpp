/**
 * @file bmc_decoded_message.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The DecodedMessage class represents a message decoded from BMC-encoded data.
 * It provides methods to feed pulse timing data and retrieve the decoded
 * message contents, as well as validating the message integrity.
 * 
 */

#pragma once

#include <cstdint>
#include <limits>
#include <span>

#include "../proto/pd_header.hpp"
#include "../proto/pd_sop.hpp"


namespace T76::DRPD::PHY {

    enum class BMCDecodedMessageEvent : uint32_t {
        None = 0,
        PreambleStart,
        SOPStart,
        HeaderStart,
        DataStart,
        MessageComplete                 = 0x40000000,
        HardResetReceived               = 0x40000001,
        RuntPulseError                  = 0x80000000,
        TimeoutBeforeStartError         = 0x80000001,
        TimeoutError                    = 0x80000002,
        InvalidKCodeError               = 0x80000003,
        CRCError                        = 0x80000004,
    };

#define BMC_DECODED_MESSAGE_EVENT_IS_COMPLETION(event) (((uint32_t)(event) & 0b1100'0000'0000'0000'0000'0000'0000'0000) != 0)
#define BMC_DECODED_MESSAGE_EVENT_IS_ERROR(event) (((uint32_t)(event) & 0b1000'0000'0000'0000'0000'0000'0000'0000) != 0)

    /** 
     * @brief Result of the BMC decoded message processing
     */
    enum class BMCDecodedMessageResult : uint32_t {
        Success,        ///< Message decoded successfully
        InvalidKCode,   ///< Invalid K code encountered
        CRCError,       ///< CRC check failed
        Timeout,        ///< Decoding timed out
        RuntPulse,      ///< Runt pulse detected
        Incomplete,     ///< Message is incomplete (i.e., still being decoded)
    };

    class BMCDecodedMessage {
    public:
        /** 
         * @brief Construct a new BMC Decoded Message object
         */
        BMCDecodedMessage();

        /** 
         * @brief Reset the decoded message to its initial state
         */
        void reset();

        /** 
         * @brief Feed a pulse timing to the decoder
         * 
         * @param pulseWidth The width of the pulse in PIO cycles
         * @return true if the message is complete or an error occurred, false otherwise
         */
        BMCDecodedMessageEvent feedPulse(uint32_t pulseWidth);

        /**
         * @brief Get the result of the decoding process
         * 
         * @return BMCDecodedMessageResult The result of the decoding
         */
        BMCDecodedMessageResult decodingResult() const;

        /** 
         * @brief Get the timestamp of the message reception
         * 
         * @return uint64_t The timestamp in microseconds, timed to the first preamble pulse
         */
        const uint64_t startTimestamp() const {
            return _startTimestamp;
        }

        /** 
         * @brief Get the end timestamp of the message reception
         * 
         * @return uint64_t The end timestamp in microseconds
         */
        const uint64_t endTimestamp() const {
            return _endTimestamp;
        }

        /**
         * @brief Attach the ingress timestamp latched at frame start.
         *
         * @param timestamp Timestamp in microseconds, or InvalidTimestamp.
         */
        void ingressTimestamp(uint64_t timestamp);

        /**
         * @brief Check whether frame-start metadata was attached to this message.
         *
         * @return true if frame-start metadata is attached, even if the timestamp is invalid.
         */
        bool hasIngressTimestamp() const;

        /** 
         * @brief Get the Start of Packet (SOP) bytes
         * 
         * @return A reference to an array containing the SOP bytes
         */
        const uint8_t (&sop() const)[4];

        /** 
         * @brief Get the decoded data payload
         * 
         * @return A span representing the decoded data payload
         */
        std::span<const uint8_t> data() const;

        /** 
         * @brief Get the raw header bytes
         * 
         * @return A span representing the raw header bytes
         */
        std::span<const uint8_t> rawHeader() const;

        /** 
         * @brief Get the raw body bytes
         * 
         * @return A span representing the raw body bytes
         */
        std::span<const uint8_t> rawBody() const;

        /** 
         * @brief Get the raw CRC bytes
         * 
         * @return A span representing the raw CRC bytes
         */
        std::span<const uint8_t> rawCRC() const;

        /** 
         * @brief Get the buffer of pulse timings
         * 
         * @return A span representing the buffer of pulse timings in PIO cycles
         */
        std::span<const uint16_t> pulseBuffer() const;

        /** 
         * @brief Get the decoded USB-PD message header
         * 
         * @return A reference to the decoded PDHeader object
         */
        const Proto::PDHeader decodedHeader() const;

        /** 
         * @brief Get the decoded USB-PD message SOP context
         * 
         * @return A reference to the decoded SOP object
         */
        const Proto::SOP decodedSOP() const;

        // Compute a timeout value for pulse widths in PIO cycles based 
        // on the configured timeout in nanoseconds. Keep in mind that
        // the PIO state machine requires two operations to decrease
        // its internal counter, and so we divide by 2.
        static const uint32_t TimeoutPulseWidthPIOCycles = uint32_t(PHY_BMC_DECODER_TIMEOUT_PULSE_WIDTH_NS * PHY_BMC_DECODER_PIO_CLOCK_HZ / 1'000'000'000 / 2);

        // Same thing, but for runt pulses
        static const uint32_t RuntPulseWidthPIOCycles = uint32_t(PHY_BMC_DECODER_RUNT_PULSE_WIDTH_NS * PHY_BMC_DECODER_PIO_CLOCK_HZ / 1'000'000'000 / 2);

        static constexpr uint64_t InvalidTimestamp = std::numeric_limits<uint64_t>::max();

    protected:
        /** 
         * @brief Internal state of the decoder
         */
        enum class _DecoderState : uint32_t {
            ReadingPreamble,        ///< Reading the preamble of the message
            ReadingSOP,             ///< Reading the Start of Packet (SOP)
            ReadingData,            ///< Reading the data payload
            Error,                  ///< An error occurred during decoding
            Complete                ///< Message decoding is complete
        };
        
        BMCDecodedMessageResult _result;                                        ///< Result of the decoding process    

        uint64_t _startTimestamp;                                               ///< Timestamp of the message reception. Timed to the first preamble pulse.
        uint64_t _endTimestamp;                                                 ///< Timestamp of the end of the message reception.
        bool _hasIngressTimestamp;                                              ///< True when frame-start metadata was attached to this decode attempt.
        uint64_t _capturedPulseWidthPIOCycles;                                  ///< Sum of captured pulse widths for the current receive attempt.

        uint32_t _carrierPulseLength;                                           ///< Carrier pulse length in PIO cycles
        uint32_t _carrierPulseHighBitThreshold;                                 ///< Threshold to distinguish between high and low bits

        uint8_t _sop[4];                                                        ///< Start of Packet (SOP) bytes

        uint8_t _data[PHY_BMC_DECODER_MAX_MESSAGE_DATA_SIZE];                   ///< Buffer to store decoded data
        uint32_t _dataLength;                                                   ///< Length of the data payload

        uint16_t _pulseBuffer[PHY_BMC_DECODER_MAX_MESSAGE_PULSE_BUFFER_SIZE];   ///< Buffer to store pulse timings
        uint32_t _pulseBufferLength;                                            ///< Length of the pulse timing buffer

        // Internal decoder state
        struct {
            _DecoderState           state;                       ///< Current state of the decoder

            uint32_t                carrierAccumulator;         ///< Accumulator for carrier pulse measurements
            uint32_t                carrierEntryCount;          ///< Number of entries for carrier pulse measurements

            uint32_t                kCodeAccumulator;           ///< Accumulator for K code bits
            uint32_t                kCodeBitCount;              ///< Number of K code bits processed
            bool                    skipNextPulse;              ///< Flag to skip the next pulse

            uint32_t                sopIndex;                   ///< Index for SOP bytes

            uint32_t                currentByte;                ///< Current byte being processed
            bool                    processingLSNibble;         ///< Flag indicating if processing least significant nibble
        } _decoderState;

        // Protocol characteristics

        Proto::SOP _decodedSOP;
        Proto::PDHeader _decodedHeader;


        /**
         * @brief Process a bit based on the given edge timing
         * 
         * @param edge The edge timing in PIO cycles
         * @return true if a full K-code has been accumulated, false otherwise
         */
        bool _processBit(uint32_t edge);
        void _markEndTimestampFromCapturedPulses();

        /**
         * @brief Process an edge in the ReadingPreamble state
         * 
         * @param edge The edge timing in PIO cycles
         * @return true if the message is complete, false otherwise
         * 
         * Note that a message may be complete due to an error (e.g., timeout).
         */
        BMCDecodedMessageEvent _processEdgeInPreambleState(uint32_t edge);

        /**
         * @brief Process an edge in the ReadingSOP state
         * 
         * @param edge The edge timing in PIO cycles
         * @return true if the message is complete, false otherwise
         * 
         * Note that a message may be complete due to an error (e.g., timeout).
         */
        BMCDecodedMessageEvent _processEdgeInReadingSOPState(uint32_t edge);
        
        /**
         * @brief Process an edge in the ReadingData state
         * 
         * @param edge The edge timing in PIO cycles
         * @return true if the message is complete, false otherwise
         * 
         * Note that a message may be complete due to an error (e.g., timeout).
         */
        BMCDecodedMessageEvent _processEdgeInReadingDataState(uint32_t edge);

        /**
         * @brief Validate the CRC of the decoded message
         * 
         * @return true if the CRC is valid, false otherwise
         */
        bool _validateCRC() const;
    };

} // namespace T76::DRPD::PHY
