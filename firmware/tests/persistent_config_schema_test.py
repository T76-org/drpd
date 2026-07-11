#!/usr/bin/env python3
"""Static regression checks for firmware persistent-config schema ownership."""

from pathlib import Path
import re


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
    require(
        "using PersistentConfigDataCurrent = PersistentConfigDataV4;" in header,
        "current payload must alias schema v4",
    )
    require(
        "CurrentSchemaVersion = 4" in header,
        "current schema version must be 4",
    )

    require(
        "static_assert(std::is_trivially_copyable_v<PersistentConfigDataV4>);" in implementation,
        "schema v4 must stay trivially copyable",
    )
    require(
        len(re.findall(r"\.ccBus\s*=\s*CCBusPersistentConfig\s*{\s*\.role\s*=\s*1", implementation))
        >= 4,
        "default config and v1/v2/v3 migrations must choose Observer",
    )
    require(
        "decoded = version3;" not in implementation,
        "v3 migration must explicitly map into current schema",
    )
    require(
        re.search(r"case\s+4:\s*return\s+_decodeVersion4", implementation) is not None,
        "stored schema v4 must decode",
    )

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
        "_savePersistentConfig();" in scpi_bus,
        "BUS:CC:ROLE must persist valid role changes",
    )


if __name__ == "__main__":
    main()
