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

#include "../phy/analog_monitor.hpp"

using namespace T76::DRPD;

static_assert(std::is_trivially_copyable_v<PersistentConfigDataV1>);
static_assert(std::is_trivially_copyable_v<PersistentConfigDataV2>);
static_assert(std::is_trivially_copyable_v<PersistentConfigDataV3>);
static_assert(std::is_trivially_copyable_v<PersistentConfigDataV4>);
static_assert(std::is_trivially_copyable_v<PersistentConfigDataV5>);
static_assert(std::is_trivially_copyable_v<PersistentConfigDataCurrent>);
static_assert(sizeof(PersistentConfigHeader) == 20);
static_assert(sizeof(PersistentConfigDataV1) == 340);
static_assert(sizeof(PersistentConfigDataV2) == 344);
static_assert(sizeof(PersistentConfigDataV3) == 396);
static_assert(sizeof(PersistentConfigDataV4) == 400);
static_assert(sizeof(PersistentConfigDataV5) == 408);
static_assert(offsetof(PersistentConfigDataV1, analogMonitor) == 8);
static_assert(offsetof(PersistentConfigDataV1, trigger) == 252);
static_assert(offsetof(PersistentConfigDataV2, sink) == 340);
static_assert(offsetof(PersistentConfigDataV3, trigger) == 304);
static_assert(offsetof(PersistentConfigDataV4, ccBus) == 396);
static_assert(offsetof(PersistentConfigDataV5, bmcDecoder) == 400);

PersistentConfig &PersistentConfig::instance() {
    static PersistentConfig config;
    return config;
}

PersistentConfig::PersistentConfig() {
    mutex_init(&_flashWriteMutex);
}

void PersistentConfig::init() {
    switch (_loadFromFlash()) {
        case LoadResult::Loaded:
            return;
        case LoadResult::InvalidImage:
            (void)resetToDefaults();
            return;
        case LoadResult::MigrationFailed:
            _current = _defaultConfig();
            _valid = false;
            _factoryDefaultsActive = true;
            return;
    }
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
        .analogMonitor = AnalogMonitorPersistentConfig{
            .vbusVoltageCorrectionByRawVolt = T76::DRPD::PHY::AnalogMonitor::defaultVBusVoltageCorrection(),
            .vbusCurrentRawByCalibratedHalfAmp = T76::DRPD::PHY::AnalogMonitor::defaultVBusCurrentRawCalibration(),
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
        .sink = SinkPersistentConfig{
            .eprEntryEnabled = true,
            .ppsStatusQueryEnabled = false,
        },
        .ccBus = CCBusPersistentConfig{
            .role = 1,
        },
        .bmcDecoder = BMCDecoderPersistentConfig{},
    };
}

PersistentConfig::LoadResult PersistentConfig::_loadFromFlash() {
    PersistentConfigHeader header{};
    const uint8_t *payload = nullptr;
    if (!_readFlashImage(header, payload)) {
        return LoadResult::InvalidImage;
    }

    PersistentConfigDataCurrent migrated{};
    if (!_decodeStoredConfig(header.schemaVersion, payload, header.payloadSize, migrated)) {
        return LoadResult::MigrationFailed;
    }

    _current = migrated;
    _valid = true;
    _factoryDefaultsActive = false;

    if (header.schemaVersion != CurrentSchemaVersion || header.payloadSize != sizeof(PersistentConfigDataCurrent)) {
        (void)save();
    }

    return LoadResult::Loaded;
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

PersistentConfigDataV2 PersistentConfig::_migrateV1ToV2(
    const PersistentConfigDataV1 &source) const {
    return PersistentConfigDataV2{
        .vbus = source.vbus,
        .analogMonitor = source.analogMonitor,
        .trigger = source.trigger,
        .sync = source.sync,
        .sink = SinkPersistentConfigV1{
            .eprEntryEnabled = true,
            .ppsStatusQueryEnabled = false,
        },
    };
}

PersistentConfigDataV3 PersistentConfig::_migrateV2ToV3(
    const PersistentConfigDataV2 &source) const {
    return PersistentConfigDataV3{
        .vbus = source.vbus,
        .analogMonitor = AnalogMonitorPersistentConfigV2{
            .vbusVoltageCorrectionByRawVolt = source.analogMonitor.vbusVoltageCorrectionByRawVolt,
            .vbusCurrentRawByCalibratedHalfAmp =
                T76::DRPD::PHY::AnalogMonitor::defaultVBusCurrentRawCalibration(),
        },
        .trigger = source.trigger,
        .sync = source.sync,
        .sink = source.sink,
    };
}

PersistentConfigDataV4 PersistentConfig::_migrateV3ToV4(
    const PersistentConfigDataV3 &source) const {
    return PersistentConfigDataV4{
        .vbus = source.vbus,
        .analogMonitor = source.analogMonitor,
        .trigger = source.trigger,
        .sync = source.sync,
        .sink = source.sink,
        .ccBus = CCBusPersistentConfigV1{.role = 1},
    };
}

PersistentConfigDataV5 PersistentConfig::_migrateV4ToV5(
    const PersistentConfigDataV4 &source) const {
    TriggerPersistentConfig trigger{
        .mode = source.trigger.mode,
        .eventThreshold = source.trigger.eventThreshold,
        .autoRepeat = source.trigger.autoRepeat,
        .senderFilter = source.trigger.senderFilter,
    };
    for (size_t index = 0; index < source.trigger.messageTypeFilters.size(); ++index) {
        const auto &sourceFilter = source.trigger.messageTypeFilters[index];
        trigger.messageTypeFilters[index] = TriggerMessageTypeFilterPersistentConfig{
            .rawMessageType = sourceFilter.rawMessageType,
            .hasDataObjects = sourceFilter.hasDataObjects,
            .enabled = sourceFilter.enabled,
            .reserved = sourceFilter.reserved,
        };
    }

    return PersistentConfigDataV5{
        .vbus = VBusPersistentConfig{
            .ovpThresholdVolts = source.vbus.ovpThresholdVolts,
            .ocpThresholdAmps = source.vbus.ocpThresholdAmps,
        },
        .analogMonitor = AnalogMonitorPersistentConfig{
            .vbusVoltageCorrectionByRawVolt =
                source.analogMonitor.vbusVoltageCorrectionByRawVolt,
            .vbusCurrentRawByCalibratedHalfAmp =
                source.analogMonitor.vbusCurrentRawByCalibratedHalfAmp,
        },
        .trigger = trigger,
        .sync = SyncPersistentConfig{
            .mode = source.sync.mode,
            .pulseWidthUs = source.sync.pulseWidthUs,
        },
        .sink = SinkPersistentConfig{
            .eprEntryEnabled = source.sink.eprEntryEnabled,
            .ppsStatusQueryEnabled = source.sink.ppsStatusQueryEnabled,
            .reserved = source.sink.reserved,
        },
        .ccBus = CCBusPersistentConfig{.role = source.ccBus.role},
        .bmcDecoder = BMCDecoderPersistentConfig{},
    };
}

bool PersistentConfig::_decodeStoredConfig(uint32_t schemaVersion,
                                           const uint8_t *payload,
                                           uint32_t payloadSize,
                                           PersistentConfigDataCurrent &decoded) const {
    std::variant<PersistentConfigDataV1,
                 PersistentConfigDataV2,
                 PersistentConfigDataV3,
                 PersistentConfigDataV4,
                 PersistentConfigDataV5> migrating;

    switch (schemaVersion) {
        case 1: {
            if (payloadSize != sizeof(PersistentConfigDataV1)) {
                return false;
            }
            PersistentConfigDataV1 stored{};
            std::memcpy(&stored, payload, sizeof(stored));
            migrating = stored;
            break;
        }
        case 2: {
            if (payloadSize != sizeof(PersistentConfigDataV2)) {
                return false;
            }
            PersistentConfigDataV2 stored{};
            std::memcpy(&stored, payload, sizeof(stored));
            migrating = stored;
            break;
        }
        case 3: {
            if (payloadSize != sizeof(PersistentConfigDataV3)) {
                return false;
            }
            PersistentConfigDataV3 stored{};
            std::memcpy(&stored, payload, sizeof(stored));
            migrating = stored;
            break;
        }
        case 4: {
            if (payloadSize != sizeof(PersistentConfigDataV4)) {
                return false;
            }
            PersistentConfigDataV4 stored{};
            std::memcpy(&stored, payload, sizeof(stored));
            migrating = stored;
            break;
        }
        case 5: {
            if (payloadSize != sizeof(PersistentConfigDataV5)) {
                return false;
            }
            PersistentConfigDataV5 stored{};
            std::memcpy(&stored, payload, sizeof(stored));
            migrating = stored;
            break;
        }
        default:
            return false;
    }

    while (schemaVersion < CurrentSchemaVersion) {
        switch (schemaVersion) {
            case 1:
                migrating = _migrateV1ToV2(std::get<PersistentConfigDataV1>(migrating));
                break;
            case 2:
                migrating = _migrateV2ToV3(std::get<PersistentConfigDataV2>(migrating));
                break;
            case 3:
                migrating = _migrateV3ToV4(std::get<PersistentConfigDataV3>(migrating));
                break;
            case 4:
                migrating = _migrateV4ToV5(std::get<PersistentConfigDataV4>(migrating));
                break;
            default:
                return false;
        }
        ++schemaVersion;
    }

    decoded = std::get<PersistentConfigDataCurrent>(migrating);
    return true;
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
