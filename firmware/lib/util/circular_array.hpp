/**
 * @file circular_array.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * A simple thread-safe circular array implementation.
 * 
 */

#pragma once


#include <FreeRTOS.h>

#include <t76/safety.hpp>


namespace T76::DRPD::Util {

    template <typename T, size_t Size> 
    class CircularArray {
    public:
        CircularArray() : _head(0), _count(0) {
            _mutex = xSemaphoreCreateMutex();
        }

        void clear() {
            if (xSemaphoreTake(_mutex, portMAX_DELAY) != pdTRUE) {
                T76_ASSERT(false, "Failed to take mutex in CircularArray::clear");
            }

            _head = 0;
            _count = 0;

            xSemaphoreGive(_mutex);
        }

        void push(const T &item) {
            if (xSemaphoreTake(_mutex, portMAX_DELAY) != pdTRUE) {
                T76_ASSERT(false, "Failed to take mutex in CircularArray::push");
            }

            _data[_head] = item;
            _head = (_head + 1) % Size;

            if (_count < Size) {
                _count++;
            }

            xSemaphoreGive(_mutex);
        }

        T pop() {
            if (xSemaphoreTake(_mutex, portMAX_DELAY) != pdTRUE) {
                T76_ASSERT(false, "Failed to take mutex in CircularArray::pop");
            }
            
            if (_count == 0) {
                T76_ASSERT(false, "Attempted to pop from empty CircularArray");
            }

            size_t tail = (_head + Size - _count) % Size;
            T item = _data[tail];

            _count--;

            xSemaphoreGive(_mutex);

            return item;
        }

        size_t size() const {
            return _count;
        }

    protected:
        T _data[Size];

        size_t _head;
        size_t _count;

        SemaphoreHandle_t _mutex;
    };
    
} // namespace T76::DRPD::Util