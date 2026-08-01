#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace T76::DRPD::Logic {
    class ReceivedMessageIdState {
    public:
        void reset() { _valid.fill(false); _ids.fill(0); }
        [[nodiscard]] bool duplicate(size_t target, uint8_t id) const {
            return target < _valid.size() && _valid[target] && _ids[target] == (id & 0x7);
        }
        void store(size_t target, uint8_t id) {
            if (target >= _valid.size()) return;
            _valid[target] = true;
            _ids[target] = static_cast<uint8_t>(id & 0x7);
        }
        void clear(size_t target) {
            if (target >= _valid.size()) return;
            _valid[target] = false;
            _ids[target] = 0;
        }
    private:
        std::array<bool, 3> _valid = {};
        std::array<uint8_t, 3> _ids = {};
    };
}
