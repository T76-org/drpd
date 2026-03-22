/**
 * @file persistent_config.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "persistent_config.hpp"

#include <algorithm>
#include <array>
#include <cstring>

#include <hardware/sync.h>
#include <hardware/regs/addressmap.h>
#include <pico/time.h>

using namespace T76::DRPD;

static_assert(std::is_trivially_copyable_v<PersistentConfigDataV1>);
static_assert(std::is_trivially_copyable_v<PersistentConfigDataCurrent>);

PersistentConfig &PersistentConfig::instance() {
    static PersistentConfig config;
    return config;
}

PersistentConfig::PersistentConfig() {
    mutex_init(&_flashWriteMutex);
}

void PersistentConfig::init() {
    if (_loadFromFlash()) {
        return;
    }

    (void)resetToDefaults();
}

const PersistentConfigDataCurrent &PersistentConfig::current() const {
    return _current;
}

bool PersistentConfig::save() {
    PersistentConfigHeader header{
        .magic = Magic,
        .schemaVersion = CurrentSchemaVersion,
        .payloadSize = static_cast<uint32_t>(sizeof(_current)),
        .payloadCrc32 = _crc32(reinterpret_cast<const uint8_t *>(&_current), sizeof(_current)),
        .reserved = 0,
    };

    const bool wrote = _writeImage(header, reinterpret_cast<const uint8_t *>(&_current), sizeof(_current));
    _valid = wrote;
    return wrote;
}

bool PersistentConfig::resetToDefaults() {
    _current = _defaultConfig();
    _factoryDefaultsActive = true;
    return save();
}

bool PersistentConfig::isFactoryDefault() const {
    return _factoryDefaultsActive;
}

bool PersistentConfig::isValid() const {
    return _valid;
}

void PersistentConfig::serviceCore1FlashWriteHandshake() {
    _serviceCore1FlashWriteHandshakeRam(this);
}

PersistentConfigDataCurrent PersistentConfig::_defaultConfig() const {
    return PersistentConfigDataCurrent{
        .vbus = VBusPersistentConfig{
            .ovpThresholdVolts = 48.0f,
            .ocpThresholdAmps = 5.0f,
        },
        .trigger = TriggerPersistentConfig{
            .mode = 0,
            .eventThreshold = 1,
            .autoRepeat = false,
            .senderFilter = 0,
        },
        .sync = SyncPersistentConfig{
            .mode = 0,
            .pulseWidthUs = 1000,
        },
    };
}

bool PersistentConfig::_loadFromFlash() {
    PersistentConfigHeader header{};
    const uint8_t *payload = nullptr;
    if (!_readFlashImage(header, payload)) {
        return false;
    }

    PersistentConfigDataCurrent migrated{};
    if (!_decodeStoredConfig(header.schemaVersion, payload, header.payloadSize, migrated)) {
        return false;
    }

    _current = migrated;
    _valid = true;
    _factoryDefaultsActive = false;

    if (header.schemaVersion != CurrentSchemaVersion || header.payloadSize != sizeof(PersistentConfigDataCurrent)) {
        (void)save();
    }

    return true;
}

bool PersistentConfig::_readFlashImage(PersistentConfigHeader &header, const uint8_t *&payload) const {
    const auto *mappedHeader = reinterpret_cast<const PersistentConfigHeader *>(XIP_BASE + FlashOffset);
    header = *mappedHeader;
    payload = reinterpret_cast<const uint8_t *>(mappedHeader + 1);

    if (!_headerLooksValid(header)) {
        return false;
    }

    const uint32_t crc = _crc32(payload, header.payloadSize);
    if (crc != header.payloadCrc32) {
        return false;
    }

    return true;
}

bool PersistentConfig::_headerLooksValid(const PersistentConfigHeader &header) const {
    if (header.magic != Magic) {
        return false;
    }

    if (header.schemaVersion == 0 || header.schemaVersion > CurrentSchemaVersion) {
        return false;
    }

    if (header.payloadSize == 0 || header.payloadSize > FlashSize - sizeof(PersistentConfigHeader)) {
        return false;
    }

    return true;
}

bool PersistentConfig::_decodeVersion1(const uint8_t *payload,
                                       uint32_t payloadSize,
                                       PersistentConfigDataCurrent &decoded) const {
    if (payloadSize != sizeof(PersistentConfigDataV1)) {
        return false;
    }

    PersistentConfigDataV1 version1{};
    std::memcpy(&version1, payload, sizeof(version1));
    decoded = version1;
    return true;
}

bool PersistentConfig::_decodeStoredConfig(uint32_t schemaVersion,
                                           const uint8_t *payload,
                                           uint32_t payloadSize,
                                           PersistentConfigDataCurrent &decoded) const {
    switch (schemaVersion) {
        case 1:
            return _decodeVersion1(payload, payloadSize, decoded);
        default:
            return false;
    }
}

uint32_t PersistentConfig::_crc32(const uint8_t *data, size_t size) const {
    uint32_t crc = 0xFFFFFFFFu;

    for (size_t index = 0; index < size; ++index) {
        crc ^= static_cast<uint32_t>(data[index]);
        for (int bit = 0; bit < 8; ++bit) {
            const bool lsbSet = (crc & 1u) != 0;
            crc >>= 1;
            if (lsbSet) {
                crc ^= 0xEDB88320u;
            }
        }
    }

    return ~crc;
}

void PersistentConfig::_requestCore1FlashWritePark() {
    _core1FlashWriteParked = false;
    __compiler_memory_barrier();
    _flashWriteRequested = true;
    __compiler_memory_barrier();
}

void PersistentConfig::_releaseCore1FlashWritePark() {
    __compiler_memory_barrier();
    _flashWriteRequested = false;
    __compiler_memory_barrier();
}

bool PersistentConfig::_waitForCore1ToPark() const {
    const absolute_time_t deadline = make_timeout_time_ms(100);
    while (!_core1FlashWriteParked) {
        if (absolute_time_diff_us(get_absolute_time(), deadline) < 0) {
            return false;
        }
    }

    return true;
}

void PersistentConfig::_serviceCore1FlashWriteHandshakeRam(PersistentConfig *config) {
    if (!config->_flashWriteRequested) {
        return;
    }

    const uint32_t interruptState = save_and_disable_interrupts();
    config->_core1FlashWriteParked = true;
    __compiler_memory_barrier();

    while (config->_flashWriteRequested) {
        __compiler_memory_barrier();
    }

    config->_core1FlashWriteParked = false;
    restore_interrupts(interruptState);
}

void PersistentConfig::_performFlashWriteRam(PersistentConfig *config) {
    const uint32_t interruptState = save_and_disable_interrupts();

    flash_range_erase(FlashOffset, FlashSize);

    for (size_t offset = 0; offset < config->_flashSectorBuffer.size(); offset += FLASH_PAGE_SIZE) {
        flash_range_program(
            FlashOffset + static_cast<uint32_t>(offset),
            config->_flashSectorBuffer.data() + offset,
            FLASH_PAGE_SIZE
        );
    }

    restore_interrupts(interruptState);
}

bool PersistentConfig::_writeImage(const PersistentConfigHeader &header, const uint8_t *payload, size_t payloadSize) {
    if (payloadSize != sizeof(PersistentConfigDataCurrent)) {
        return false;
    }

    const auto *mappedBytes = reinterpret_cast<const uint8_t *>(XIP_BASE + FlashOffset);
    if (std::memcmp(mappedBytes, &header, sizeof(header)) == 0 &&
        std::memcmp(mappedBytes + sizeof(header), payload, payloadSize) == 0) {
        _valid = true;
        return true;
    }

    std::fill(_flashSectorBuffer.begin(), _flashSectorBuffer.end(), 0xFF);

    std::memcpy(_flashSectorBuffer.data(), &header, sizeof(header));
    std::memcpy(_flashSectorBuffer.data() + sizeof(header), payload, payloadSize);

    mutex_enter_blocking(&_flashWriteMutex);

    bool wrote = false;
    _requestCore1FlashWritePark();
    if (_waitForCore1ToPark()) {
        _performFlashWriteRam(this);
        wrote = true;
    }
    _releaseCore1FlashWritePark();

    mutex_exit(&_flashWriteMutex);

    _valid = wrote;
    return wrote;
}
