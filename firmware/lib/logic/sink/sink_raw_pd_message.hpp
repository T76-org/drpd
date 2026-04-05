/**
 * @file sink_raw_pd_message.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Internal raw PD-message wrapper shared by Sink translation units.
 *
 * This helper provides a small `Proto::PDMessage` implementation backed by a
 * fixed-size byte buffer so Sink code can synthesize protocol messages from
 * raw payload bytes without duplicating wrapper logic across `.cpp` files.
 */

#pragma once

#include <algorithm>
#include <array>
#include <span>

#include "../../proto/pd_message.hpp"

namespace T76::DRPD::Logic {

    /**
     * @brief Fixed-buffer raw PD message adapter for synthesized Sink traffic.
     */
    class SinkRawPDMessage : public Proto::PDMessage {
    public:
        /**
         * @brief Construct a raw PD message wrapper.
         *
         * @param rawBody Raw payload bytes to copy into the internal buffer.
         * @param numDataObjects Message data-object count.
         * @param rawMessageType Raw message type value used by the encoder.
         */
        SinkRawPDMessage(
            std::span<const uint8_t> rawBody,
            uint32_t numDataObjects,
            uint32_t rawMessageType) :
            _rawBody(),
            _rawBodyLength(std::min(rawBody.size(), _rawBody.size())),
            _numDataObjects(numDataObjects),
            _rawMessageType(rawMessageType) {
            for (size_t i = 0; i < _rawBodyLength; ++i) {
                _rawBody[i] = rawBody[i];
            }
        }

        /**
         * @brief Return the raw payload bytes.
         *
         * @return std::span<const uint8_t> Span over the stored payload bytes.
         */
        std::span<const uint8_t> raw() const override {
            return std::span<const uint8_t>(_rawBody.data(), _rawBodyLength);
        }

        /**
         * @brief Return the message data-object count.
         *
         * @return uint32_t Number of data objects encoded in the message.
         */
        uint32_t numDataObjects() const override {
            return _numDataObjects;
        }

        /**
         * @brief Return the raw message type.
         *
         * @return uint32_t Encoded raw message type.
         */
        uint32_t rawMessageType() const override {
            return _rawMessageType;
        }

    protected:
        std::array<uint8_t, LOGIC_SINK_RAW_PD_MESSAGE_MAX_BODY_BYTES> _rawBody; ///< Fixed storage for the copied payload bytes.
        size_t _rawBodyLength; ///< Number of valid bytes in `_rawBody`.
        uint32_t _numDataObjects; ///< Encoded PD data-object count.
        uint32_t _rawMessageType; ///< Encoded raw PD message type.
    };

} // namespace T76::DRPD::Logic
