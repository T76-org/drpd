/**
 * @file pd_extended_header.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "pd_extended_header.hpp"


using namespace T76::DRPD::Proto;


PDExtendedHeader::PDExtendedHeader(uint16_t raw) : _raw(raw) {}

uint16_t PDExtendedHeader::raw() const {
    return _raw;
}

void PDExtendedHeader::raw(uint16_t value) {
    _raw = value;
}

uint16_t PDExtendedHeader::dataSizeBytes() const {
    return _raw & 0x01FF;
}

void PDExtendedHeader::dataSizeBytes(uint16_t value) {
    _raw = (_raw & 0xFE00) | (value & 0x01FF);
}

bool PDExtendedHeader::requestChunk() const {
    return (_raw & (1u << 10)) != 0;
}

void PDExtendedHeader::requestChunk(bool value) {
    if (value) {
        _raw |= (1u << 10);
    } else {
        _raw &= ~(1u << 10);
    }
}

bool PDExtendedHeader::chunked() const {
    return (_raw & (1u << 15)) != 0;
}

void PDExtendedHeader::chunked(bool value) {
    if (value) {
        _raw |= (1u << 15);
    } else {
        _raw &= ~(1u << 15);
    }
}

uint8_t PDExtendedHeader::chunkNumber() const {
    return static_cast<uint8_t>((_raw >> 11) & 0x0F);
}

void PDExtendedHeader::chunkNumber(uint8_t value) {
    _raw = (_raw & ~(0x0Fu << 11)) | ((static_cast<uint16_t>(value) & 0x0F) << 11);
}
