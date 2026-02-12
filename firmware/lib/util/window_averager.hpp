/**
 * @file window_averager.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * WindowAverager is a utility template class that maintains a moving average
 * of the last N samples of a given data type. It is useful for smoothing out
 * noisy data in applications such as sensor readings.
 * 
 */

#pragma once


#include <array>
#include <cstddef>
#include <cstdint>


namespace T76::DRPD::Util {
    
    /**
     * @brief Template class for maintaining a moving average of the last N samples
     * 
     * @tparam T Data type of the samples (e.g., float, int)
     * @tparam N Number of samples to average over
     */
    template<typename T, std::size_t N>
    class WindowAverager {
    public:
        /**
         * @brief Construct a new WindowAverager object
         * 
         */
        WindowAverager() : _index(0), _count(0), _sum(0) {
            _samples.fill(T{});
        }

        /**
         * @brief Add a new sample to the averager
         * 
         * @param sample New sample to add
         */
        void addSample(const T& sample) {
            if (_count < N) {
                _count++;
            } else {
                _sum -= _samples[_index];
            }

            _samples[_index] = sample;
            _sum += sample;

            _index = (_index + 1) % N;
        }

        /**
         * @brief Get the current average of the samples
         * 
         * @return T Current average
         */
        T average() const {
            if (_count == 0) {
                return T{};
            }
            return _sum / static_cast<T>(_count);
        }

    protected:
        std::array<T, N> _samples; ///< Circular buffer of samples
        std::size_t _index;        ///< Current index in the circular buffer
        std::size_t _count;        ///< Number of samples added so far
        T _sum;                    ///< Sum of the current samples
    };

} // namespace T76::Util
