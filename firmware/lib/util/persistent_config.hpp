/**
 * @file persistent_config.hpp
 * @brief Versioned persistent configuration store backed by a reserved flash sector.
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This module provides the firmware's persistent configuration mechanism. It
 * owns a dedicated flash sector that is intentionally excluded from the linked
 * application image so the stored settings survive normal firmware reflashing.
 * The store keeps one typed in-RAM copy of the current configuration, validates
 * the on-flash image with a magic value plus CRC-32, restores library-defined
 * defaults when the flash contents are missing or invalid, and rewrites the
 * current schema after successful migration from an older supported version.
 *
 * The on-flash format consists of:
 * - a fixed header (`PersistentConfigHeader`) containing a magic value, schema
 *   version, payload size, and CRC-32
 * - a version-specific payload struct (`PersistentConfigDataV1`, future
 *   versions as needed)
 *
 * Runtime ownership is split deliberately:
 * - this module owns persistence, schema selection, validation, migration, and
 *   flash erase/program sequencing
 * - feature owners such as `VBusManager`, `TriggerController`, and
 *   `SyncManager` own the semantic meaning of their persisted slices and expose
 *   `applyPersistentConfig(...)` / `exportPersistentConfig()` methods
 * - the app layer only coordinates when settings are loaded or saved
 *
 * Flash writes require special handling because both RP2350 cores normally
 * execute code directly from external flash through XIP. Erasing or programming
 * flash while the other core is still executing from flash can crash the
 * system. To avoid that, this module implements a cooperative two-core
 * handshake:
 * - core 0 requests a flash-write park
 * - core 1 reaches `serviceCore1FlashWriteHandshake()` from its main loop
 * - a RAM-resident helper on core 1 disables interrupts and parks in RAM until
 *   the request is cleared
 * - once parked, a RAM-resident helper on core 0 disables interrupts and
 *   performs the actual erase/program sequence
 * - core 0 clears the request and core 1 resumes normal execution
 *
 * The store also avoids unnecessary wear by comparing the staged header and
 * payload against the mapped flash image before erasing the sector. If nothing
 * changed, `save()` returns success without touching flash.
 *
 * Adding a new persisted setting:
 * 1. Decide which owner class semantically owns the setting.
 * 2. Add the field to that owner's persisted slice struct in this file.
 * 3. Update the owner's `applyPersistentConfig(...)` and
 *    `exportPersistentConfig()` implementations.
 * 4. Add the desired library default in `_defaultConfig()`.
 * 5. If the field can be represented by the current schema version without
 *    changing the existing payload layout rules, update the current payload
 *    type accordingly and ensure older-version migration sets a sensible
 *    default.
 *
 * Adding a new schema version:
 * 1. Leave all historical payload structs exactly as shipped.
 * 2. Define a new payload type, for example `PersistentConfigDataV2`.
 * 3. Update `PersistentConfigDataCurrent` to alias the new type.
 * 4. Bump `CurrentSchemaVersion`.
 * 5. Add a decoder or migration path from each supported older version into the
 *    new current representation.
 * 6. Keep `_defaultConfig()` returning a fully initialized current payload.
 * 7. After boot, the store will rewrite any older valid image in the current
 *    schema automatically.
 *
 * Important maintenance rules:
 * - never change the layout of an older shipped payload struct
 * - only decode older payloads using the exact historical type that was stored
 * - keep all flash-write helpers RAM-resident
 * - keep core 1 calling `serviceCore1FlashWriteHandshake()` frequently enough
 *   that save operations can park it promptly
 */

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <type_traits>
#include <utility>

#include <hardware/flash.h>
#include <pico/critical_section.h>
#include <pico/mutex.h>
#include <pico/platform.h>

namespace T76::DRPD {

    /**
     * @brief Persisted VBUS protection settings owned by VBusManager.
     */
    struct VBusPersistentConfig {
        float ovpThresholdVolts = 48.0f;   ///< Over-voltage threshold in volts.
        float ocpThresholdAmps = 5.0f;     ///< Over-current threshold in amps.
    };

    /**
     * @brief Persisted analog-monitor calibration settings.
     */
    struct AnalogMonitorPersistentConfig {
        static constexpr size_t VBusCorrectionPointCount = 61; ///< Raw VBUS buckets from 0V through 60V.

        std::array<float, VBusCorrectionPointCount> vbusVoltageCorrectionByRawVolt{}; ///< Additive VBUS correction in volts for each raw integer-voltage bucket; runtime interpolation begins at 1V and readings below 1V bypass the table.
    };

    /**
     * @brief Persisted trigger message-type filter slot.
     */
    struct TriggerMessageTypeFilterPersistentConfig {
        uint32_t rawMessageType = 0;                   ///< PD raw message-type field value.
        bool hasDataObjects = false;                  ///< True when the filter targets data messages.
        bool enabled = false;                         ///< True when this slot is active.
        std::array<uint8_t, 2> reserved = {0, 0};    ///< Reserved padding for future schema growth.
    };

    /**
     * @brief Persisted trigger-controller configuration.
     */
    struct TriggerPersistentConfig {
        static constexpr size_t MessageTypeFilterCapacity = 8;  ///< Number of persisted filter slots.

        uint32_t mode = 0;     ///< Stored TriggerControllerMode value.
        uint32_t eventThreshold = 1;   ///< Trigger event count threshold.
        bool autoRepeat = false;       ///< True when the trigger auto-rearms after firing.
        uint8_t reserved0[3] = {0, 0, 0};  ///< Reserved padding for future schema growth.
        uint32_t senderFilter = 0;     ///< Stored SenderFilter value.
        std::array<TriggerMessageTypeFilterPersistentConfig, MessageTypeFilterCapacity> messageTypeFilters{};   ///< Persisted message-type filter slots.
    };

    /**
     * @brief Persisted SYNC output settings.
     */
    struct SyncPersistentConfig {
        uint32_t mode = 0;             ///< Stored SyncManagerMode value.
        uint32_t pulseWidthUs = 1000;  ///< Pulse width in microseconds.
    };

    /**
     * @brief Version 1 persistent payload layout.
     *
     * New schema versions must preserve this struct unchanged and define a new
     * payload type for any future format additions.
     */
    struct PersistentConfigDataV1 {
        VBusPersistentConfig vbus{};       ///< Persisted VBUS protection settings.
        AnalogMonitorPersistentConfig analogMonitor{}; ///< Persisted analog monitor settings.
        TriggerPersistentConfig trigger{}; ///< Persisted trigger settings.
        SyncPersistentConfig sync{};       ///< Persisted SYNC settings.
    };

    /**
     * @brief Fixed header stored ahead of the persistent payload in flash.
     */
    struct PersistentConfigHeader {
        uint32_t magic = 0;           ///< Magic value used to identify valid config storage.
        uint32_t schemaVersion = 0;   ///< Payload schema version stored in flash.
        uint32_t payloadSize = 0;     ///< Number of payload bytes following the header.
        uint32_t payloadCrc32 = 0;    ///< CRC-32 of the payload bytes only.
        uint32_t reserved = 0;        ///< Reserved for future format flags.
    };

    /**
     * @brief Complete on-flash image for schema version 1.
     */
    struct PersistentConfigImageV1 {
        PersistentConfigHeader header{};   ///< On-flash header.
        PersistentConfigDataV1 payload{};  ///< On-flash payload.
    };

    using PersistentConfigDataCurrent = PersistentConfigDataV1;
    using PersistentConfigImageCurrent = PersistentConfigImageV1;

    /**
     * @brief Persistent configuration store backed by a dedicated flash sector.
     *
     * The store owns flash layout validation, CRC checking, version dispatch,
     * default restoration, and the RAM-resident cross-core handshake required
     * to safely erase and program XIP flash while core 1 is active.
     */
    class PersistentConfig {
    public:
        static constexpr uint32_t CurrentSchemaVersion = 1;   ///< Latest supported schema version.
        static constexpr uint32_t Magic = 0x44525044u;        ///< Flash image identification marker.
        static constexpr uint32_t FlashSize = FLASH_SECTOR_SIZE;  ///< Reserved flash region size in bytes.
        static constexpr uint32_t FlashOffset = PICO_FLASH_SIZE_BYTES - FLASH_SECTOR_SIZE;   ///< Offset of the reserved sector from flash base.

        /**
         * @brief Return the process-wide persistent config singleton.
         */
        static PersistentConfig &instance();

        /**
         * @brief Load config from flash or restore defaults if invalid.
         */
        void init();

        /**
         * @brief Return the current in-RAM configuration snapshot.
         */
        const PersistentConfigDataCurrent &current() const;

        /**
         * @brief Mutate the in-RAM configuration without writing flash.
         *
         * @tparam Updater Callable taking `PersistentConfigDataCurrent &`.
         * @param updater Mutator applied to the current config payload.
         */
        template <typename Updater>
        void update(Updater &&updater) {
            static_assert(std::is_invocable_v<Updater, PersistentConfigDataCurrent &>);
            std::forward<Updater>(updater)(_current);
            _factoryDefaultsActive = false;
        }

        /**
         * @brief Persist the current in-RAM configuration to flash.
         *
         * @return true if the config is already up to date in flash or was
         * successfully written.
         * @return false if the write could not safely complete.
         */
        bool save();

        /**
         * @brief Restore library defaults and persist them to flash.
         */
        bool resetToDefaults();

        /**
         * @brief Return true if the in-RAM config currently matches defaults.
         */
        bool isFactoryDefault() const;

        /**
         * @brief Return true if the most recent load or save produced a valid image.
         */
        bool isValid() const;

        /**
         * @brief Let core 1 cooperate with a pending flash write.
         *
         * This method must be called regularly from the core 1 loop. When a
         * flash write is pending, it parks core 1 in RAM with interrupts
         * disabled until the write completes.
         */
        void serviceCore1FlashWriteHandshake();

    private:
        static constexpr size_t FlashImageSize = sizeof(PersistentConfigHeader) + sizeof(PersistentConfigDataCurrent);  ///< Size of the current serialized image header plus payload.
        static_assert(FlashImageSize <= FlashSize);

        PersistentConfigDataCurrent _current{};   ///< Current mutable in-RAM configuration image.
        bool _valid = false;                      ///< True when flash contents were validated or saved successfully.
        bool _factoryDefaultsActive = true;       ///< True when the current image originated from defaults.
        alignas(FLASH_PAGE_SIZE) std::array<uint8_t, FlashSize> _flashSectorBuffer{};  ///< RAM staging buffer used for erase/program operations.
        mutex_t _flashWriteMutex{};               ///< Serializes flash-write attempts on core 0.
        volatile bool _flashWriteRequested = false;   ///< Core 0 request flag asking core 1 to park in RAM.
        volatile bool _core1FlashWriteParked = false; ///< Core 1 acknowledgement that it is parked for a flash write.

        /**
         * @brief Construct the singleton and initialize synchronization state.
         */
        PersistentConfig();

        /**
         * @brief Build the library-defined default configuration image.
         */
        PersistentConfigDataCurrent _defaultConfig() const;

        /**
         * @brief Load, validate, decode, and migrate config from flash.
         */
        bool _loadFromFlash();

        /**
         * @brief Read the raw flash header and validate its CRC.
         */
        bool _readFlashImage(PersistentConfigHeader &header, const uint8_t *&payload) const;

        /**
         * @brief Perform basic sanity checks on a flash header before CRC validation.
         */
        bool _headerLooksValid(const PersistentConfigHeader &header) const;

        /**
         * @brief Decode a version 1 payload into the current config representation.
         */
        bool _decodeVersion1(const uint8_t *payload, uint32_t payloadSize, PersistentConfigDataCurrent &decoded) const;

        /**
         * @brief Decode any supported stored schema into the current representation.
         */
        bool _decodeStoredConfig(uint32_t schemaVersion, const uint8_t *payload, uint32_t payloadSize, PersistentConfigDataCurrent &decoded) const;

        /**
         * @brief Compute the payload CRC-32 used for image validation.
         */
        uint32_t _crc32(const uint8_t *data, size_t size) const;

        /**
         * @brief Serialize and write the current image to flash if it changed.
         *
         * This method performs the cross-core park handshake before running the
         * erase/program sequence from RAM.
         */
        bool _writeImage(const PersistentConfigHeader &header, const uint8_t *payload, size_t payloadSize);

        /**
         * @brief Wait for core 1 to acknowledge that it is parked in RAM.
         */
        bool _waitForCore1ToPark() const;

        /**
         * @brief Request that core 1 park itself for an upcoming flash write.
         */
        void _requestCore1FlashWritePark();

        /**
         * @brief Release core 1 after a flash write completes or aborts.
         */
        void _releaseCore1FlashWritePark();

        /**
         * @brief RAM-resident core 1 parking helper.
         *
         * This function disables interrupts on core 1 and spins from RAM until
         * the flash-write request is cleared.
         */
        static void __no_inline_not_in_flash_func(_serviceCore1FlashWriteHandshakeRam)(PersistentConfig *config);

        /**
         * @brief RAM-resident flash erase/program routine for core 0.
         */
        static void __no_inline_not_in_flash_func(_performFlashWriteRam)(PersistentConfig *config);
    };

} // namespace T76::DRPD
