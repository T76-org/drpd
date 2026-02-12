#!/usr/bin/env python3

import argparse
import struct
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Tuple

SINK_PDO_LIST_CHANGED_BIT = 0x20

CONTROL_TYPE_NAMES = {
    0x01: "GoodCRC",
    0x02: "GotoMin",
    0x03: "Accept",
    0x04: "Reject",
    0x05: "Ping",
    0x06: "PS_RDY",
    0x07: "Get_Source_Cap",
    0x08: "Get_Sink_Cap",
    0x09: "DR_Swap",
    0x0A: "PR_Swap",
    0x0B: "VCONN_Swap",
    0x0C: "Wait",
    0x0D: "Soft_Reset",
    0x10: "Not_Supported",
}

DATA_TYPE_NAMES = {
    0x01: "Source_Capabilities",
    0x02: "Request",
    0x03: "BIST",
    0x04: "Sink_Capabilities",
    0x05: "Battery_Status",
    0x06: "Alert",
    0x08: "Enter_USB",
    0x09: "EPR_Request",
    0x0A: "EPR_Mode",
    0x0F: "Vendor_Defined",
}

EXTENDED_TYPE_NAMES = {
    0x01: "Source_Capabilities_Extended",
    0x02: "Status",
    0x0C: "PPS_Status",
    0x0F: "Sink_Capabilities_Extended",
    0x10: "Extended_Control",
    0x11: "EPR_Source_Capabilities",
    0x12: "EPR_Sink_Capabilities",
}

EXTENDED_CONTROL_TYPE_NAMES = {
    0x01: "EPR_Get_Source_Cap",
    0x02: "EPR_Get_Sink_Cap",
    0x03: "EPR_KeepAlive",
    0x04: "EPR_KeepAlive_Ack",
}

SOP_NAME_BY_BYTES = {
    bytes((0x18, 0x18, 0x18, 0x11)): "SOP",
    bytes((0x18, 0x18, 0x06, 0x06)): "SOP'",
    bytes((0x18, 0x06, 0x18, 0x06)): "SOP''",
    bytes((0x18, 0x19, 0x19, 0x06)): "SOP'_Debug",
    bytes((0x18, 0x19, 0x06, 0x11)): "SOP''_Debug",
    bytes((0x07, 0x07, 0x07, 0x19)): "Hard_Reset",
    bytes((0x07, 0x18, 0x07, 0x06)): "Cable_Reset",
}


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class SCPIClient:
    def __init__(self, resource_fragment: str, timeout_ms: int = 2000):
        self._resource_fragment = resource_fragment
        self._timeout_ms = timeout_ms
        self._rm = None
        self._instrument = None

    def open(self) -> None:
        try:
            import pyvisa  # type: ignore
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "Missing dependency: pyvisa. Install it to use this script."
            ) from exc

        self._rm = pyvisa.ResourceManager()
        resource = next(
            (res for res in self._rm.list_resources() if self._resource_fragment in res),
            None,
        )

        if resource is None:
            raise RuntimeError(
                f"No VISA resource found containing '{self._resource_fragment}'"
            )

        self._instrument = self._rm.open_resource(resource)
        self._instrument.write_termination = ""
        self._instrument.read_termination = "\n"
        self._instrument.timeout = self._timeout_ms

    def close(self) -> None:
        if self._instrument is not None:
            self._instrument.close()
            self._instrument = None

        if self._rm is not None:
            self._rm.close()
            self._rm = None

    def write(self, command: str) -> None:
        if self._instrument is None:
            raise RuntimeError("SCPI client is not open")

        self._instrument.write(command)

    def query_list(self, command: str) -> List[str]:
        if self._instrument is None:
            raise RuntimeError("SCPI client is not open")

        values = self._instrument.query_ascii_values(command, converter="s")
        return [str(value) for value in values]

    def query_text(self, command: str) -> str:
        if self._instrument is None:
            raise RuntimeError("SCPI client is not open")

        return str(self._instrument.query(command)).strip()

    def query_binary_block(self, command: str) -> bytes:
        if self._instrument is None:
            raise RuntimeError("SCPI client is not open")

        return self._instrument.query_binary_values(
            command, datatype="B", container=bytes
        )


def query_int(client: SCPIClient, command: str) -> int:
    values = client.query_list(command)
    if not values:
        raise RuntimeError(f"No value returned for query {command}")

    return int(float(values[0]))


def query_float(client: SCPIClient, command: str) -> float:
    values = client.query_list(command)
    if not values:
        raise RuntimeError(f"No value returned for query {command}")

    return float(values[0])


def query_str(client: SCPIClient, command: str) -> str:
    values = client.query_list(command)
    if not values:
        raise RuntimeError(f"No value returned for query {command}")

    return values[0]


def get_sink_state(client: SCPIClient) -> str:
    return client.query_text("SINK:STATUS?")


def drain_system_errors(client: SCPIClient, max_reads: int = 8) -> List[str]:
    errors: List[str] = []
    for _ in range(max_reads):
        entry = client.query_text("SYSTem:ERRor?")
        if entry.startswith("0") or entry.startswith("+0"):
            break
        errors.append(entry)
    return errors


def request_sink_pdo(
    client: SCPIClient,
    target_idx: int,
    target_mv: int,
    target_ma: int,
) -> None:
    # Clear stale SCPI errors so post-write diagnostics are actionable.
    stale_errors = drain_system_errors(client)
    if stale_errors:
        print(f"[{ts()}] [warn] stale SCPI errors before request: {stale_errors}")

    request_state = get_sink_state(client)
    print(f"[{ts()}] [phase] sink state before request: {request_state}")

    attempts = [
        f"SINK:PDO {target_idx},{target_mv},{target_ma}",
        f"SINK:PDO {target_idx} {target_mv} {target_ma}",
    ]

    for command in attempts:
        client.write(command)
        errors = drain_system_errors(client)
        if not errors:
            print(f"[{ts()}] [ok] request command accepted: '{command}'")
            return
        print(f"[{ts()}] [warn] request command errors for '{command}': {errors}")

    raise RuntimeError("SINK:PDO command was rejected by SCPI parser/handler")


def fetch_pdos(client: SCPIClient) -> List[str]:
    count = query_int(client, "SINK:PDO:COUNT?")
    pdos: List[str] = []

    for idx in range(count):
        pdos.append(client.query_text(f"SINK:PDO? {idx}"))

    return pdos


def has_epr_pdo(pdos: List[str]) -> bool:
    return any(pdo.startswith("EPR_AVS,") for pdo in pdos)


def _format_value(raw: str, unit: str) -> str:
    try:
        value = float(raw)
    except ValueError:
        return f"{raw}{unit}"

    if abs(value - round(value)) < 1e-6:
        return f"{int(round(value))}{unit}"
    return f"{value:.3f}{unit}"


def format_pdo(index: int, pdo: str) -> str:
    parts = [p.strip() for p in pdo.split(",")]
    pdo_type = parts[0] if parts else "UNKNOWN"
    raw_suffix = ""
    if parts and parts[-1].lower().startswith("0x"):
        raw_suffix = f" raw={parts[-1]}"

    if pdo_type == "FIXED" and len(parts) >= 3:
        return (
            f"[{index}] FIXED   "
            f"V={_format_value(parts[1], 'V')} "
            f"Imax={_format_value(parts[2], 'A')}{raw_suffix}"
        )
    if pdo_type == "VARIABLE" and len(parts) >= 4:
        return (
            f"[{index}] VARIABLE "
            f"V={_format_value(parts[1], 'V')}..{_format_value(parts[2], 'V')} "
            f"Imax={_format_value(parts[3], 'A')}{raw_suffix}"
        )
    if pdo_type == "BATTERY" and len(parts) >= 4:
        return (
            f"[{index}] BATTERY "
            f"V={_format_value(parts[1], 'V')}..{_format_value(parts[2], 'V')} "
            f"Pmax={_format_value(parts[3], 'W')}{raw_suffix}"
        )
    if pdo_type == "SPR_PPS" and len(parts) >= 4:
        return (
            f"[{index}] SPR_PPS "
            f"V={_format_value(parts[1], 'V')}..{_format_value(parts[2], 'V')} "
            f"Imax={_format_value(parts[3], 'A')}{raw_suffix}"
        )
    if pdo_type == "SPR_AVS" and len(parts) >= 4:
        return (
            f"[{index}] SPR_AVS "
            f"V={_format_value(parts[1], 'V')}..{_format_value(parts[2], 'V')} "
            f"Pmax={_format_value(parts[3], 'W')}{raw_suffix}"
        )
    if pdo_type == "EPR_AVS" and len(parts) >= 4:
        return (
            f"[{index}] EPR_AVS "
            f"V={_format_value(parts[1], 'V')}..{_format_value(parts[2], 'V')} "
            f"Pmax={_format_value(parts[3], 'W')}{raw_suffix}"
        )

    return f"[{index}] {pdo_type:8s} raw='{pdo}'"


def print_pdo_report(tag: str, pdos: List[str]) -> None:
    print(f"[{ts()}] [pdo] {tag} count={len(pdos)}")
    for idx, pdo in enumerate(pdos):
        print(f"[{ts()}] [pdo] {format_pdo(idx, pdo)}")


def parse_captured_message(blob: bytes) -> Tuple[str, bool, bool]:
    min_size = 8 + 8 + 4 + 4 + 4 + 4
    if len(blob) < min_size:
        return f"invalid message block (size={len(blob)})", False, False

    offset = 0
    start_timestamp, end_timestamp, decode_result, sop, pulse_count = struct.unpack_from(
        "<QQI4sI", blob, offset
    )
    offset += struct.calcsize("<QQI4sI")

    pulse_buffer_size = pulse_count * 2
    if offset + pulse_buffer_size + 4 > len(blob):
        return (
            "invalid message block "
            f"(pulse_count={pulse_count}, size={len(blob)}, offset={offset})"
        ), False, False
    offset += pulse_buffer_size

    data_len = struct.unpack_from("<I", blob, offset)[0]
    offset += 4
    if offset + data_len > len(blob):
        return (
            "invalid message block "
            f"(data_len={data_len}, size={len(blob)}, offset={offset})"
        ), False, False

    data = blob[offset:offset + data_len]

    decode_map = {
        0x00: "Success",
        0x01: "InvalidKCode",
        0x02: "BadCRC",
        0x03: "Timeout",
        0x04: "UnknownError",
    }
    decode_label = decode_map.get(decode_result, f"Unknown(0x{decode_result:08X})")

    sop_name = SOP_NAME_BY_BYTES.get(sop, f"unknown({sop.hex(' ')})")
    role_summary = ""
    header_summary = "header=n/a"
    is_ps_rdy = False
    if len(data) >= 2:
        header = int.from_bytes(data[0:2], "little", signed=False)
        is_extended = (header >> 15) & 0x01
        num_objects = (header >> 12) & 0x07
        message_id = (header >> 9) & 0x07
        spec_revision = (header >> 6) & 0x03
        message_type = header & 0x1F
        if is_extended == 1:
            category = "extended"
            type_name = EXTENDED_TYPE_NAMES.get(message_type, f"type_{message_type}")
        elif num_objects == 0:
            category = "control"
            type_name = CONTROL_TYPE_NAMES.get(message_type, f"type_{message_type}")
            is_ps_rdy = message_type == 0x06
        else:
            category = "data"
            type_name = DATA_TYPE_NAMES.get(message_type, f"type_{message_type}")

        if sop_name == "SOP":
            power_role = "Source" if ((header >> 8) & 0x01) else "Sink"
            data_role = "DFP" if ((header >> 5) & 0x01) else "UFP"
            role_summary = f",pr={power_role},dr={data_role}"

        extended_detail = ""
        if is_extended == 1 and len(data) >= 4:
            ext_header = int.from_bytes(data[2:4], "little", signed=False)
            ext_data_size = ext_header & 0x01FF
            ext_request_chunk = (ext_header >> 10) & 0x01
            ext_chunk_number = (ext_header >> 11) & 0x0F
            ext_chunked = (ext_header >> 15) & 0x01
            extended_detail = (
                f",exthdr=size={ext_data_size},req={ext_request_chunk},"
                f"chunk={ext_chunk_number},chunked={ext_chunked}"
            )

            if message_type == 0x10 and len(data) >= 5:
                ext_control_type = data[4]
                ext_control_name = EXTENDED_CONTROL_TYPE_NAMES.get(
                    ext_control_type, f"type_{ext_control_type}"
                )
                extended_detail += (
                    f",ext_ctrl={ext_control_name}(0x{ext_control_type:02X})"
                )

        header_summary = (
            "header="
            f"0x{header:04X}(ext={is_extended},objs={num_objects},id={message_id},"
            f"rev={spec_revision},type={message_type},{category}/{type_name}"
            f"{role_summary}{extended_detail})"
        )
    else:
        is_extended = 0
        message_type = 0

    preview = data[:12].hex(" ")
    if len(data) > 12:
        preview += " ..."

    return (
        f"start={start_timestamp}us end={end_timestamp}us "
        f"dur={end_timestamp - start_timestamp}us "
        f"decode={decode_label} sop={sop.hex(' ')}({sop_name}) "
        f"pulses={pulse_count} data_len={data_len} {header_summary} data={preview}"
    ), (is_extended == 1 and message_type == 17), is_ps_rdy


def drain_captured_messages(client: SCPIClient) -> Tuple[int, bool, bool]:
    drained = 0
    saw_epr_source_caps = False
    saw_ps_rdy = False
    while True:
        pending = query_int(client, "BUS:CC:CAPture:COUNT?")
        if pending <= 0:
            break

        for _ in range(pending):
            blob = client.query_binary_block("BUS:CC:CAPture:DATA?")
            summary, is_epr_source_caps, is_ps_rdy = parse_captured_message(blob)
            print(f"[{ts()}] [rx] {summary}")
            saw_epr_source_caps = saw_epr_source_caps or is_epr_source_caps
            saw_ps_rdy = saw_ps_rdy or is_ps_rdy
            drained += 1

    return drained, saw_epr_source_caps, saw_ps_rdy


def wait_for_initial_pdo_update(
    client: SCPIClient,
    timeout_s: float,
    poll_s: float,
    capture_flags: Dict[str, bool],
):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        _, saw_epr_source_caps, _ = drain_captured_messages(client)
        capture_flags["saw_epr_source_caps"] = (
            capture_flags["saw_epr_source_caps"] or saw_epr_source_caps
        )
        status = query_int(client, "STATus:DEVice?")
        pdo_count = query_int(client, "SINK:PDO:COUNT?")
        if (status & SINK_PDO_LIST_CHANGED_BIT) != 0 and pdo_count > 0:
            pdos = fetch_pdos(client)
            return status, pdo_count, pdos
        time.sleep(poll_s)

    return None


def wait_for_epr_update(
    client: SCPIClient,
    timeout_s: float,
    poll_s: float,
    capture_flags: Dict[str, bool],
):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        _, saw_epr_source_caps, _ = drain_captured_messages(client)
        capture_flags["saw_epr_source_caps"] = (
            capture_flags["saw_epr_source_caps"] or saw_epr_source_caps
        )
        status = query_int(client, "STATus:DEVice?")

        if (status & SINK_PDO_LIST_CHANGED_BIT) != 0:
            pdos = fetch_pdos(client)
            if has_epr_pdo(pdos) or capture_flags["saw_epr_source_caps"]:
                return status, len(pdos), pdos

        time.sleep(poll_s)

    return None


def select_28v_target_pdo(pdos: List[str]) -> Tuple[int, int, int, str]:
    for idx, pdo in enumerate(pdos):
        parts = [p.strip() for p in pdo.split(",")]
        if len(parts) < 3:
            continue

        if parts[0] == "FIXED":
            try:
                voltage_v = float(parts[1])
                current_a = float(parts[2])
            except ValueError:
                continue

            if abs(voltage_v - 28.0) < 0.25 and current_a >= 4.5:
                return idx, int(round(voltage_v * 1000)), int(round(current_a * 1000)), pdo

    for idx, pdo in enumerate(pdos):
        parts = [p.strip() for p in pdo.split(",")]
        if len(parts) < 4:
            continue

        if parts[0] == "EPR_AVS":
            try:
                min_v = float(parts[1])
                max_v = float(parts[2])
                max_p_w = float(parts[3])
            except ValueError:
                continue

            if min_v <= 28.0 <= max_v and max_p_w >= 100.0:
                request_current_a = min(5.0, max_p_w / 28.0)
                return idx, 28000, int(round(request_current_a * 1000)), pdo

    raise RuntimeError("No 28V-capable PDO found in current list")


def wait_for_contract(
    client: SCPIClient,
    target_voltage_mv: int,
    min_current_ma: int,
    timeout_s: float,
    poll_s: float,
    capture_flags: Dict[str, bool],
) -> Tuple[float, float, str]:
    deadline = time.monotonic() + timeout_s

    while time.monotonic() < deadline:
        _, saw_epr_source_caps, _ = drain_captured_messages(client)
        capture_flags["saw_epr_source_caps"] = (
            capture_flags["saw_epr_source_caps"] or saw_epr_source_caps
        )

        negotiated_voltage_v = query_float(client, "SINK:STATUS:VOLTAGE?")
        negotiated_current_a = query_float(client, "SINK:STATUS:CURRENT?")
        negotiated_pdo = client.query_text("SINK:STATUS:PDO?")

        voltage_ok = abs(negotiated_voltage_v * 1000.0 - target_voltage_mv) <= 500.0
        current_ok = negotiated_current_a * 1000.0 >= (min_current_ma - 200.0)

        if voltage_ok and current_ok:
            return negotiated_voltage_v, negotiated_current_a, negotiated_pdo

        time.sleep(poll_s)

    raise RuntimeError("Negotiated contract did not reach target before timeout")


def read_measured_vbus_voltage(client: SCPIClient) -> float:
    values = client.query_list("MEAS:ALL?")
    if len(values) < 2:
        raise RuntimeError(f"Unexpected MEAS:ALL? response: {values}")
    return float(values[1])


def wait_for_ps_rdy_and_vbus(
    client: SCPIClient,
    target_voltage_v: float,
    tolerance_v: float,
    timeout_s: float,
    poll_s: float,
    capture_flags: Dict[str, bool],
) -> float:
    deadline = time.monotonic() + timeout_s
    saw_ps_rdy = False
    last_vbus_v = 0.0

    while time.monotonic() < deadline:
        _, saw_epr_source_caps, saw_ps_rdy_now = drain_captured_messages(client)
        capture_flags["saw_epr_source_caps"] = (
            capture_flags["saw_epr_source_caps"] or saw_epr_source_caps
        )
        saw_ps_rdy = saw_ps_rdy or saw_ps_rdy_now

        if saw_ps_rdy:
            last_vbus_v = read_measured_vbus_voltage(client)
            if abs(last_vbus_v - target_voltage_v) <= tolerance_v:
                return last_vbus_v

        time.sleep(poll_s)

    if not saw_ps_rdy:
        raise RuntimeError("Timed out waiting for PS_RDY after PDO request")

    raise RuntimeError(
        "PS_RDY observed but VBUS was not near target voltage; "
        f"last VBUS={last_vbus_v:.3f}V target={target_voltage_v:.3f}V "
        f"tolerance=+/-{tolerance_v:.3f}V"
    )


def reset_role(client: SCPIClient):
    client.write("BUS:CC:ROLE DISABLED")
    time.sleep(1.0)
    client.write("BUS:CC:ROLE SINK")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded sink EPR verification loop")
    parser.add_argument("--max-iterations", type=int, default=20)
    parser.add_argument("--poll-ms", type=int, default=250)
    parser.add_argument("--timeout-s", type=float, default=30.0)
    parser.add_argument(
        "-r",
        "--resource-fragment",
        default="USB0::0x2E8A::0x000A",
        help="Substring used to select the VISA resource.",
    )
    args = parser.parse_args()

    poll_s = max(args.poll_ms, 50) / 1000.0

    client = SCPIClient(args.resource_fragment)

    try:
        client.open()
        client.write("BUS:CC:CAP:EN ON")
        client.write("BUS:CC:CAP_CLEAR")
        print(f"[{ts()}] [ok] CC capture enabled and cleared")

        for iteration in range(1, args.max_iterations + 1):
            capture_flags = {"saw_epr_source_caps": False}
            print(
                f"[{ts()}] [phase] iteration={iteration} resetting role: "
                f"DISABLED -> (1.0s) -> SINK"
            )
            client.write("BUS:CC:CAP_CLEAR")
            reset_role(client)
            print(f"[{ts()}] [ok] role reset sequence complete")

            # Clear stale status latched before this cycle.
            _ = query_int(client, "STATus:DEVice?")

            print(f"[{ts()}] [phase] waiting for initial source PDO update")
            first = wait_for_initial_pdo_update(client, args.timeout_s, poll_s, capture_flags)
            if first is None:
                print(f"[{ts()}] [warn] no initial PDO update observed in timeout window")
                continue

            _, initial_count, initial_pdos = first
            print(f"[{ts()}] [ok] initial source PDOs received (count={initial_count})")
            print_pdo_report("initial", initial_pdos)

            try:
                target_idx, target_mv, target_ma, target_desc = select_28v_target_pdo(initial_pdos)
                print(
                    f"[{ts()}] [phase] requesting 28V PDO "
                    f"index={target_idx} target={target_mv}mV/{target_ma}mA ({target_desc})"
                )
                client.write("BUS:CC:CAP_CLEAR")
                request_sink_pdo(client, target_idx, target_mv, target_ma)
                measured_vbus = wait_for_ps_rdy_and_vbus(
                    client,
                    target_voltage_v=28.0,
                    tolerance_v=0.75,
                    timeout_s=min(args.timeout_s, 15.0),
                    poll_s=poll_s,
                    capture_flags=capture_flags,
                )
                print(
                    f"[{ts()}] [ok] PS_RDY received and measured VBUS is near 28V: "
                    f"VBUS={measured_vbus:.3f}V"
                )
                negotiated_v, negotiated_a, negotiated_pdo = wait_for_contract(
                    client,
                    target_mv,
                    target_ma,
                    timeout_s=min(args.timeout_s, 15.0),
                    poll_s=poll_s,
                    capture_flags=capture_flags,
                )
                print(
                    f"[{ts()}] [ok] negotiated contract "
                    f"V={negotiated_v:.3f}V I={negotiated_a:.3f}A PDO={negotiated_pdo}"
                )
            except RuntimeError as exc:
                print(f"[{ts()}] [warn] 28V contract verification failed: {exc}")
                continue

            if has_epr_pdo(initial_pdos) or capture_flags["saw_epr_source_caps"]:
                print(f"[{ts()}] [ok] EPR PDOs already present in initial update")
                print(f"[{ts()}] [pass] sink EPR loop check passed")
                print(f"[{ts()}] [summary] initial_count={initial_count} epr_count={initial_count}")
                print(f"[{ts()}] [summary] initial_pdos={initial_pdos}")
                print(f"[{ts()}] [summary] epr_pdos={initial_pdos}")
                return 0

            # Confirm the status bit clears after a read.
            post_clear_status = query_int(client, "STATus:DEVice?")
            if (post_clear_status & SINK_PDO_LIST_CHANGED_BIT) != 0:
                print(f"[{ts()}] [warn] SinkPDOListChanged still set after clear read")

            print(f"[{ts()}] [phase] waiting for EPR PDO retrieval and bit retrigger")
            second = wait_for_epr_update(client, args.timeout_s, poll_s, capture_flags)
            if second is None:
                print(f"[{ts()}] [warn] EPR PDO update not observed in timeout window")
                continue

            second_status, second_count, second_pdos = second

            if (second_status & SINK_PDO_LIST_CHANGED_BIT) == 0:
                print(f"[{ts()}] [fail] SinkPDOListChanged was not retriggered")
                return 2

            print(f"[{ts()}] [ok] EPR PDOs received (count={second_count})")
            print_pdo_report("epr", second_pdos)
            print(f"[{ts()}] [ok] SinkPDOListChanged observed again after clear")

            print(f"[{ts()}] [pass] sink EPR loop check passed")
            print(f"[{ts()}] [summary] initial_count={initial_count} epr_count={second_count}")
            print(f"[{ts()}] [summary] initial_pdos={initial_pdos}")
            print(f"[{ts()}] [summary] epr_pdos={second_pdos}")
            return 0

        print(f"[{ts()}] [fail] Source is not reporting EPR capability")
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
