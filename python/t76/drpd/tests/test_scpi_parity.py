"""
SCPI and firmware-event parity checks for Python and TypeScript clients.
"""

from pathlib import Path
import re
import unittest


REPO_ROOT = Path(__file__).resolve().parents[4]
SCPI_YAML = REPO_ROOT / "firmware" / "lib" / "app" / "scpi.yaml"
PYTHON_CLIENT_ROOTS = [
    REPO_ROOT / "python" / "t76" / "drpd" / "device",
    REPO_ROOT / "python" / "t76" / "drpd" / "message" / "bmc_sequence.py",
]
TYPESCRIPT_CLIENT_ROOT = REPO_ROOT / "frontend" / "src" / "lib" / "device" / "drpd"


def scpi_segment_variants(segment: str) -> list[str]:
    match = re.match(r"([A-Z_0-9]+)([a-z_0-9]*)", segment)
    if not match:
        return [segment.upper()]
    required, optional = match.groups()
    if optional:
        return [required.upper(), f"{required}{optional}".upper()]
    return [required.upper()]


def scpi_variants(command: str) -> set[str]:
    suffix = "?" if command.endswith("?") else ""
    body = command[:-1] if suffix else command
    if body.startswith("*"):
        return {command.upper()}

    variants = [""]
    for index, segment in enumerate(body.split(":")):
        next_variants = []
        prefix = "" if index == 0 else ":"
        for current in variants:
            for segment_variant in scpi_segment_variants(segment):
                next_variants.append(f"{current}{prefix}{segment_variant}")
        variants = next_variants
    return {f"{variant}{suffix}".upper() for variant in variants}


def firmware_commands() -> list[str]:
    commands = []
    for line in SCPI_YAML.read_text().splitlines():
        match = re.match(r'\s*- syntax:\s+"([^"]+)"', line)
        if match:
            commands.append(match.group(1))
    return commands


def source_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    return [
        path
        for path in root.rglob("*")
        if path.suffix in {".py", ".ts", ".tsx"}
        and "__tests__" not in path.parts
        and "tests" not in path.parts
    ]


def implemented_commands(roots: list[Path]) -> set[str]:
    commands: set[str] = set()
    command_pattern = re.compile(
        r"""['"]((?:\*IDN\?|\*RST|[A-Z][A-Z0-9]*:[A-Za-z0-9:?]+))"""
    )
    for root in roots:
        for path in source_files(root):
            text = path.read_text(errors="ignore")
            for match in command_pattern.finditer(text):
                commands.add(match.group(1).upper())
    return commands


class TestSCPIParity(unittest.TestCase):
    """Verify client command and firmware-event parity."""

    def assert_commands_covered(
            self,
            implemented: set[str],
            label: str) -> None:
        missing = []
        for command in firmware_commands():
            if not (scpi_variants(command) & implemented):
                missing.append(command)
        self.assertEqual(missing, [], f"{label} missing SCPI commands")

    def test_python_covers_firmware_scpi_commands(self) -> None:
        self.assert_commands_covered(
            implemented_commands(PYTHON_CLIENT_ROOTS),
            "Python client",
        )

    def test_typescript_covers_firmware_scpi_commands(self) -> None:
        self.assert_commands_covered(
            implemented_commands([TYPESCRIPT_CLIENT_ROOT]),
            "TypeScript client",
        )

    def test_firmware_capture_events_are_first_class(self) -> None:
        python_text = (
            REPO_ROOT
            / "python"
            / "t76"
            / "drpd"
            / "message"
            / "bmc_sequence.py"
        ).read_text()
        ts_text = (
            REPO_ROOT
            / "frontend"
            / "src"
            / "lib"
            / "device"
            / "drpd"
            / "parsers.ts"
        ).read_text()

        self.assertIn("FIRMWARE_EVENT_DECODE_RESULT", python_text)
        self.assertIn("FirmwareCaptureEvent", python_text)
        self.assertIn("CaptureDecodeResult.FIRMWARE_EVENT", ts_text)
        self.assertIn("recordType: 'event'", ts_text)
