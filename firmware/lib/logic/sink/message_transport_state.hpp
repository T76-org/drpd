#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace T76::DRPD::Logic {

    /** Host-testable SOP/SOP'/SOP'' transport bookkeeping. */
    class SinkMessageTransportState {
    public:
        struct Target {
            uint8_t nextMessageId = 0;
            uint8_t retryCount = 0;
            bool pending = false;
            uint8_t pendingMessageId = 0;
        };

        [[nodiscard]] uint8_t begin(size_t target) {
            auto &state = _targets.at(target);
            state.pendingMessageId = state.nextMessageId;
            state.nextMessageId = static_cast<uint8_t>((state.nextMessageId + 1) & 0x7);
            state.retryCount = 0;
            state.pending = true;
            return state.pendingMessageId;
        }

        [[nodiscard]] bool acknowledge(size_t target, uint8_t messageId) {
            auto &state = _targets.at(target);
            if (!state.pending || state.pendingMessageId != (messageId & 0x7)) return false;
            state.pending = false;
            state.retryCount = 0;
            return true;
        }

        [[nodiscard]] uint8_t retry(size_t target) {
            return ++_targets.at(target).retryCount;
        }

        void abandon(size_t target) {
            _targets.at(target).pending = false;
            _targets.at(target).retryCount = 0;
        }
        void reset(size_t target) { _targets.at(target) = Target{}; }

        void reset() { _targets = {}; }
        [[nodiscard]] const Target& target(size_t index) const { return _targets.at(index); }

    private:
        std::array<Target, 3> _targets = {};
    };
}
