#!/usr/bin/env python3
"""Regression checks for persistent-config layouts and migration chaining."""

from pathlib import Path
import ctypes
import re
import zlib


ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    header = read("firmware/lib/util/persistent_config.hpp")
    implementation = read("firmware/lib/util/persistent_config.cpp")
    app = read("firmware/lib/app/app.cpp")
    scpi_bus = read("firmware/lib/app/app_scpi_bus.cpp")

    require(
        re.search(r"struct\s+CCBusPersistentConfig\s*{[^}]*role\s*=\s*1", header, re.S)
        is not None,
        "CCBusPersistentConfig must default role to Observer",
    )
    require("struct PersistentConfigDataV4" in header, "schema v4 payload must exist")
    require("struct PersistentConfigDataV5" in header, "schema v5 payload must exist")
    require(
        "using PersistentConfigDataCurrent = PersistentConfigDataV5;" in header,
        "current payload must alias schema v5",
    )
    require(
        "CurrentSchemaVersion = 5" in header,
        "current schema version must be 5",
    )

    require(
        "static_assert(std::is_trivially_copyable_v<PersistentConfigDataV4>);" in implementation,
        "schema v4 must stay trivially copyable",
    )
    require(
        "static_assert(std::is_trivially_copyable_v<PersistentConfigDataV5>);" in implementation,
        "schema v5 must stay trivially copyable",
    )
    for version, expected_size in ((1, 340), (2, 344), (3, 396),
                                   (4, 400), (5, 408)):
        require(
            f"sizeof(PersistentConfigDataV{version}) == {expected_size}" in
            implementation,
            f"schema v{version} must retain shipped payload size",
        )

    for frozen_type in (
        "VBusPersistentConfigV1",
        "TriggerPersistentConfigV1",
        "SyncPersistentConfigV1",
        "SinkPersistentConfigV1",
        "CCBusPersistentConfigV1",
        "AnalogMonitorPersistentConfigV2",
    ):
        require(frozen_type in header, f"missing frozen type {frozen_type}")

    migrations = [
        "_migrateV1ToV2",
        "_migrateV2ToV3",
        "_migrateV3ToV4",
        "_migrateV4ToV5",
    ]
    for migration in migrations:
        require(migration in header and migration in implementation,
                f"missing adjacent migration {migration}")

    decode_loop = implementation[
        implementation.index("bool PersistentConfig::_decodeStoredConfig"):
        implementation.index("uint32_t PersistentConfig::_crc32")
    ]
    require("while (schemaVersion < CurrentSchemaVersion)" in decode_loop,
            "stored schema must migrate through one shared adjacent-step loop")
    last_index = -1
    for migration in migrations:
        index = decode_loop.index(migration)
        require(index > last_index,
                "migration loop must list adjacent steps in order")
        last_index = index
    require(
        "decoded = version3;" not in implementation,
        "v3 migration must explicitly map into current schema",
    )
    require(
        re.search(r"case\s+4:\s*{[^}]*sizeof\(PersistentConfigDataV4\)",
                  decode_loop, re.S) is not None,
        "stored schema v4 must decode",
    )
    require(
        re.search(r"case\s+5:\s*{[^}]*sizeof\(PersistentConfigDataV5\)",
                  decode_loop, re.S) is not None,
        "stored schema v5 must decode",
    )
    require(implementation.count(".bmcDecoder = BMCDecoderPersistentConfig{}") >= 2,
            "defaults and v4-to-v5 migration must choose BMC defaults")
    require("return LoadResult::MigrationFailed;" in implementation,
            "decode failure must be distinguished from an invalid image")
    migration_failure_case = implementation[
        implementation.index("case LoadResult::MigrationFailed:"):
        implementation.index("PersistentConfigDataCurrent", implementation.index(
            "case LoadResult::MigrationFailed:"))
    ]
    require("resetToDefaults" not in migration_failure_case and
            "save()" not in migration_failure_case,
            "migration failure must preserve the stored flash image")

    class Header(ctypes.LittleEndianStructure):
        _fields_ = [
            ("magic", ctypes.c_uint32),
            ("schema_version", ctypes.c_uint32),
            ("payload_size", ctypes.c_uint32),
            ("payload_crc32", ctypes.c_uint32),
            ("reserved", ctypes.c_uint32),
        ]

    for schema_version, payload_size in ((1, 340), (2, 344), (3, 396),
                                         (4, 400), (5, 408)):
        payload = bytearray((index * 37 + schema_version) & 0xFF
                            for index in range(payload_size))
        image_header = Header(
            magic=0x44525044,
            schema_version=schema_version,
            payload_size=payload_size,
            payload_crc32=zlib.crc32(payload),
            reserved=0,
        )
        serialized = bytes(image_header) + payload
        require(len(serialized) == ctypes.sizeof(Header) + payload_size,
                f"schema v{schema_version} serialized image size changed")
        require(zlib.crc32(serialized[ctypes.sizeof(Header):]) ==
                image_header.payload_crc32,
                f"schema v{schema_version} representative CRC failed")
        corrupted = bytearray(serialized)
        corrupted[-1] ^= 0x80
        require(zlib.crc32(corrupted[ctypes.sizeof(Header):]) !=
                image_header.payload_crc32,
                f"schema v{schema_version} corruption must fail CRC")

    apply_index = app.index("_ccBusController.applyPersistentConfig")
    init_index = app.index("_ccBusController.init();")
    require(
        apply_index < init_index,
        "persisted CC role must be applied before CC bus controller loop starts",
    )
    require(
        "data.ccBus = _ccBusController.exportPersistentConfig();" in app,
        "saved config must include CC bus role",
    )
    require(
        "_bmcDecoder.applyPersistentConfig" in app and
        "data.bmcDecoder = _bmcDecoder.exportPersistentConfig();" in app,
        "BMC decoder config must load before startup and save with other slices",
    )
    require(
        "_savePersistentConfig();" in scpi_bus,
        "BUS:CC:ROLE must persist valid role changes",
    )


if __name__ == "__main__":
    main()
