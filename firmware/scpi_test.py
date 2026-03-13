#!/usr/bin/env python3

import pyvisa
from time import sleep
import argparse


DEFAULT_RESOURCE_FRAGMENT = "USB0::0x2E8A::0x000A"


def send_scpi(command: str, resource_fragment: str = DEFAULT_RESOURCE_FRAGMENT) -> str:
    rm = pyvisa.ResourceManager()
    resource = next((res for res in rm.list_resources()
                    if resource_fragment in res), None)
    if resource is None:
        return "Device not found."
    instrument = rm.open_resource(resource)
    instrument.write_termination = ''
    instrument.read_termination = '\n'
    instrument.timeout = 10

    try:
        if command.rstrip().endswith("?"):
            return instrument.query_ascii_values(command, converter='s')
        instrument.write(command)
        return "Command sent."
    finally:
        instrument.close()


def reset_instrument(resource_fragment: str) -> None:
    """Reset the instrument by sending *RST command."""
    response = send_scpi("*RST", resource_fragment)
    print(response)


def send_arbitrary_command(command: str, resource_fragment: str) -> None:
    """Send an arbitrary SCPI command to the instrument."""
    response = send_scpi(command, resource_fragment)
    if command.rstrip().endswith("?"):
        print(f"Response to {command}: {response}")
    else:
        print(response)


def cycle_cc_connection(resource_fragment: str) -> None:
    """Cycle the connection on the CC lines to simulate unplugging/plugging the cable."""
    print("Disabling CC bus controller...")
    send_scpi("BUS:CC:ROLE DISABLED", resource_fragment)
    sleep(1)
    print("Setting CC bus controller to observer...")
    send_scpi("BUS:CC:ROLE OBSERVER", resource_fragment)
    print("CC bus connection cycled.")


def monitor_analog_values(resource_fragment: str) -> None:
    """Monitor the analog values continuously."""
    print("Starting analog monitoring. Press Ctrl+C to stop.\n")

    try:
        while True:
            response = send_scpi("BUS:CC:STATUS?", resource_fragment)
            print(f"Mode: {response[0]} | ", end="")
            print(f"Status: {response[1]} | ", end="")
            print(f"Source: {response[2]} / {response[3]} | ", end="")
            print(f"Sink: {response[4]} / {response[5]} | ", end="\n")

            response = send_scpi("MEAS:ALL?", resource_fragment)
            print(f"Ts: {int(response[0])}us | ", end="")
            print(f"VBus: {float(response[1]):2.3f}V | ", end="")
            print(f"IBus: {float(response[2]):2.3f}A | ", end="")
            print(f"DUT CC1: {float(response[3]):1.3f}V |", end="")
            print(f"DUT CC2: {float(response[4]):1.3f}V | ", end="")
            print(f"US/DS CC1: {float(response[5]):1.3f}V | ", end="")
            print(f"US/DS CC2: {float(response[6]):1.3f}V | ", end="")
            print(f"ADC VRef: {float(response[7]):1.3f}V | ", end="")
            print(f"Ground Ref: {float(response[8]):1.3f}V | ", end="")
            print(f"Current Ref: {float(response[9]):1.3f}V | ", end="")
            print(f"Accum: {int(response[10])}us | ", end="")
            print(f"Charge: {int(response[11])}mAh | ", end="")
            print(f"Energy: {int(response[12])}mWh", end="\r")

            # Go back up one line
            print("\033[F" * 1, end="")

            sleep(0.1)
    except KeyboardInterrupt:
        print("\n\nMonitoring stopped by user.")


def get_device_identification(resource_fragment: str) -> None:
    """Get device identification by sending *IDN? command."""
    response = send_scpi("*IDN?", resource_fragment)
    print(f"Response to *IDN?: {response}")


def query_system_error(resource_fragment: str) -> None:
    """Query the system error queue."""
    response = send_scpi("SYSTem:ERRor?", resource_fragment)
    print(f"System Error: {response}")


def query_system_memory(resource_fragment: str) -> None:
    """Query the system memory (total heap and free heap)."""
    response = send_scpi("SYSTem:MEMory?", resource_fragment)
    if isinstance(response, list) and len(response) >= 2:
        total_heap = int(response[0])
        free_heap = int(response[1])
        used_heap = total_heap - free_heap
        print(f"Total Heap: {total_heap:,} bytes")
        print(f"Free Heap:  {free_heap:,} bytes")
        print(f"Used Heap:  {used_heap:,} bytes")
        print(f"Usage:      {used_heap/total_heap*100:.1f}%")
    else:
        print(f"System Memory: {response}")


def query_system_speed(resource_fragment: str) -> None:
    """Query the system clock frequency."""
    response = send_scpi("SYSTem:SPeed?", resource_fragment)
    if isinstance(response, list) and len(response) >= 1:
        freq_hz = int(response[0])
        freq_mhz = freq_hz / 1_000_000
        print(f"System Clock: {freq_hz:,} Hz ({freq_mhz:.1f} MHz)")
    else:
        print(f"System Clock: {response}")


def query_system_uptime(resource_fragment: str) -> None:
    """Query the system uptime."""
    response = send_scpi("SYSTem:UPTime?", resource_fragment)
    if isinstance(response, list) and len(response) >= 1:
        uptime_us = int(response[0])
        uptime_ms = uptime_us / 1_000
        uptime_s = uptime_us / 1_000_000
        uptime_m = uptime_s / 60
        uptime_h = uptime_m / 60
        print(f"System Uptime: {uptime_us:,} µs")
        print(f"             = {uptime_ms:,.2f} ms")
        print(f"             = {uptime_s:,.2f} seconds")
        if uptime_m >= 1:
            print(f"             = {uptime_m:.2f} minutes")
        if uptime_h >= 1:
            print(f"             = {uptime_h:.2f} hours")
    else:
        print(f"System Uptime: {response}")


def query_system_timestamp(resource_fragment: str) -> None:
    """Query the current system timestamp."""
    response = send_scpi("SYSTem:TIMEstamp?", resource_fragment)
    if isinstance(response, list) and len(response) >= 1:
        timestamp_us = int(response[0])
        timestamp_ms = timestamp_us / 1_000
        timestamp_s = timestamp_us / 1_000_000
        print(f"Timestamp: {timestamp_us:,} µs")
        print(f"         = {timestamp_ms:,.2f} ms")
        print(f"         = {timestamp_s:,.2f} seconds")
    else:
        print(f"Timestamp: {response}")


def query_device_status(resource_fragment: str) -> None:
    """Query the device status word (STATus:DEVice?)."""
    response = send_scpi("STATus:DEVice?", resource_fragment)
    if isinstance(response, list) and len(response) >= 1:
        try:
            status = int(response[0])
            print(f"Device Status: {status} (0x{status:08X})")
        except ValueError:
            print(f"Device Status: {response}")
    else:
        print(f"Device Status: {response}")


def query_accumulated_values(resource_fragment: str) -> None:
    """Query accumulated VBUS charge and energy counters."""
    response = send_scpi("MEASure:ACCumulated?", resource_fragment)
    if isinstance(response, list) and len(response) >= 3:
        elapsed_us = int(response[0])
        charge_mah = int(response[1])
        energy_mwh = int(response[2])
        print(f"Accumulation Elapsed: {elapsed_us:,} µs")
        print(f"Accumulated Charge:   {charge_mah:,} mAh")
        print(f"Accumulated Energy:   {energy_mwh:,} mWh")
    else:
        print(f"Accumulated Values: {response}")


def reset_accumulated_values(resource_fragment: str) -> None:
    """Reset accumulated VBUS charge and energy counters."""
    response = send_scpi("MEASure:ACCumulated:RESET", resource_fragment)
    print(response)


def query_message_count(resource_fragment: str) -> None:
    """Query the number of captured CC bus messages (BUS:CC:CAPture:COUNT?)."""
    # Note: The SCPI tree in scpi.yaml defines BUS:CC:CAPture:COUNT?
    response = send_scpi("BUS:CC:CAPture:COUNT?", resource_fragment)
    if isinstance(response, list) and len(response) >= 1:
        try:
            count = int(response[0])
            print(f"Message Count: {count}")
        except ValueError:
            print(f"Message Count: {response}")
    else:
        print(f"Message Count: {response}")


def capture_enable(state: str, resource_fragment: str) -> None:
    """Query or set the CC bus capture enable state (BUS:CC:CAP_EN? or BUS:CC:CAP:EN ON|OFF)."""
    if state.upper() == "QUERY":
        response = send_scpi("BUS:CC:CAP:EN?", resource_fragment)
        print(f"Capture Enable: {response}")
    elif state.upper() in ["ON", "OFF"]:
        response = send_scpi(
            f"BUS:CC:CAP:EN {state.upper()}", resource_fragment)
        print(response)
    else:
        print(f"Invalid state '{state}'. Use 'query', 'on', or 'off'.")


def capture_clear(resource_fragment: str) -> None:
    """Clear the captured CC bus messages (BUS:CC:CAP_CLEAR)."""
    response = send_scpi("BUS:CC:CAP_CLEAR", resource_fragment)
    print(response)


def fetch_next_message(resource_fragment: str) -> None:
    """Fetch and print the next captured CC bus message (BUS:CC:CAPture:DATA?).

    This reads a SCPI arbitrary block and prints a concise parsed summary:
    - 64-bit timestamp (us)
    - 32-bit decoding result (hex/int)
    - 4-byte SOP (hex)
    - pulse buffer length and pulse widths in nanoseconds
    - data length and first bytes (hex)
    """
    # First, check count to avoid blocking if none available
    count_resp = send_scpi("BUS:CC:CAPture:COUNT?", resource_fragment)
    try:
        if not (isinstance(count_resp, list) and len(count_resp) >= 1 and int(count_resp[0]) > 0):
            print("No captured message available.")
            return
    except ValueError:
        # If count couldn't be parsed, proceed but warn
        print(
            f"Warning: Unexpected COUNT? response: {count_resp}. Attempting to fetch data...")

    # Query the cycle time in nanoseconds
    cycle_time_resp = send_scpi("BUS:CC:CAPture:CYCLETIME?", resource_fragment)
    try:
        cycle_time_ns = float(cycle_time_resp[0])
    except (ValueError, IndexError, TypeError):
        print(
            f"Warning: Could not retrieve cycle time: {cycle_time_resp}. Using 1.0 ns as fallback.")
        cycle_time_ns = 1.0

    rm = pyvisa.ResourceManager()
    resource = next((res for res in rm.list_resources()
                    if resource_fragment in res), None)
    if resource is None:
        print("Device not found.")
        return

    instr = rm.open_resource(resource)
    instr.write_termination = ''
    # read_termination is ignored by query_binary_values; keep default
    instr.timeout = 2000  # ms, allow time for binary transfer

    try:
        # Retrieve raw bytes using SCPI arbitrary block parsing
        blob: bytes = instr.query_binary_values(
            "BUS:CC:CAPture:DATA?", datatype='B', container=bytes
        )

        if not blob:
            print("No data returned.")
            return

        # Parse according to firmware format (little-endian fields):
        #  u64 timestamp
        #  u32 decoding_result
        #  4  bytes SOP
        #  u32 pulse_len, u16 pulse_buf[pulse_len]
        #  u32 data_len,  u8 data[data_len]
        off = 0

        def take(n: int) -> bytes:
            nonlocal off
            chunk = blob[off:off+n]
            off += n
            return chunk

        if len(blob) < (8 + 4 + 4 + 4 + 4):
            print(f"Unexpected message size: {len(blob)} bytes")
            return

        ts_us = int.from_bytes(take(8), 'little', signed=False)
        decoding_result = int.from_bytes(take(4), 'little', signed=False)
        sop = take(4)
        pulse_len = int.from_bytes(take(4), 'little', signed=False)

        if off + 2 * pulse_len > len(blob):
            print("Malformed message: pulse buffer length exceeds data size")
            return
        pulse_buf = take(2 * pulse_len)

        if off + 4 > len(blob):
            print("Malformed message: missing data length field")
            return
        data_len = int.from_bytes(take(4), 'little', signed=False)

        if off + data_len > len(blob):
            print("Malformed message: data length exceeds remaining size")
            return
        data = take(data_len)

        def format_pulse_buffer(b: bytes, cycle_time: float) -> str:
            """Format pulse buffer as nanoseconds, with max 16 values per line."""
            # Parse as little-endian 16-bit words (cycle counts)
            words = [
                int.from_bytes(b[i:i+2], 'little')
                for i in range(0, len(b), 2)
            ]

            # Convert cycles to nanoseconds and round to nearest integer
            pulse_ns = [round(w * cycle_time) for w in words]

            lines = []
            for i in range(0, len(pulse_ns), 16):
                line = " ".join(f"{ns:5d}" for ns in pulse_ns[i:i+16])
                lines.append(line)

            return "          " + "\n          ".join(lines)

        def hex_preview(b: bytes) -> str:
            """Format bytes as hex, with max 16 values per line."""
            lines = []
            for i in range(0, len(b), 16):
                line = b[i:i+16].hex(" ")
                lines.append(line)
            return "          " + "\n          ".join(lines)

        DECODING_RESULT_MAP = {
            0x00: "Success",
            0x01: "Error: Invalid K-Code",
            0x02: "Error: Bad CRC",
            0x03: "Error: Timeout",
            0x04: "Error: Unknown",
        }

        print(f"Timestamp (us): {ts_us}")
        print(
            f"Decoding Result: {DECODING_RESULT_MAP.get(decoding_result, 'Unknown')} (0x{decoding_result:08X})")
        print(f"SOP: {sop.hex(' ')}")
        print(
            f"Pulse Buffer: {pulse_len} pulses (ns) | \n{format_pulse_buffer(pulse_buf, cycle_time_ns)}")
        print(f"Data: {data_len} bytes | \n {hex_preview(data)}")

    except pyvisa.errors.VisaIOError as e:
        print(f"VISA I/O error fetching message: {e}")
    except (ValueError, IndexError) as e:
        print(f"Parse error fetching message: {e}")
    finally:
        instr.close()


def query_capture_cycle_time(resource_fragment: str) -> None:
    """Query the length of a capture cycle in nanoseconds."""
    response = send_scpi("BUS:CC:CAPture:CYCLETIME?", resource_fragment)
    cycle_time_ns = float(response[0])
    cycle_time_us = cycle_time_ns / 1_000
    cycle_time_ms = cycle_time_ns / 1_000_000
    print(f"Capture Cycle Time: {cycle_time_ns:,} ns")
    print(f"                  = {cycle_time_us:,.2f} µs")
    if cycle_time_ms >= 1:
        print(f"                  = {cycle_time_ms:.2f} ms")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Send a SCPI command to the connected instrument.")

    # Add global resource fragment argument
    parser.add_argument(
        "-r",
        "--resource-fragment",
        default=DEFAULT_RESOURCE_FRAGMENT,
        help="Substring used to select the VISA resource.",
    )

    # Create subcommands
    subparsers = parser.add_subparsers(
        dest='command',
        help='Available commands',
        required=False
    )

    # Reset subcommand
    reset_parser = subparsers.add_parser(
        'reset', help='Reset the instrument by sending *RST')
    reset_parser.set_defaults(
        func=lambda args: reset_instrument(args.resource_fragment))

    # Send command subcommand
    send_parser = subparsers.add_parser(
        'send', help='Send an arbitrary SCPI command')
    send_parser.add_argument(
        'command', help='SCPI command to send to the instrument')
    send_parser.set_defaults(func=lambda args: send_arbitrary_command(
        args.command, args.resource_fragment))

    # Cycle subcommand
    cycle_parser = subparsers.add_parser(
        'cycle', help='Cycle the connection on the CC lines')
    cycle_parser.set_defaults(
        func=lambda args: cycle_cc_connection(args.resource_fragment))

    # Monitor subcommand
    monitor_parser = subparsers.add_parser(
        'monitor', help='Monitor the analog values continuously')
    monitor_parser.set_defaults(
        func=lambda args: monitor_analog_values(args.resource_fragment))

    # IDN subcommand (default behavior)
    idn_parser = subparsers.add_parser(
        'idn', help='Get device identification (*IDN?)')
    idn_parser.set_defaults(
        func=lambda args: get_device_identification(args.resource_fragment))

    # Error subcommand
    error_parser = subparsers.add_parser(
        'error', help='Query system error queue (SYSTem:ERRor?)')
    error_parser.set_defaults(
        func=lambda args: query_system_error(args.resource_fragment))

    # Memory subcommand
    memory_parser = subparsers.add_parser(
        'memory', help='Query system memory (SYSTem:MEMory?)')
    memory_parser.set_defaults(
        func=lambda args: query_system_memory(args.resource_fragment))

    # Speed subcommand
    speed_parser = subparsers.add_parser(
        'speed', help='Query system clock frequency (SYSTem:SPeed?)')
    speed_parser.set_defaults(
        func=lambda args: query_system_speed(args.resource_fragment))

    # Uptime subcommand
    uptime_parser = subparsers.add_parser(
        'uptime', help='Query system uptime (SYSTem:UPTime?)')
    uptime_parser.set_defaults(
        func=lambda args: query_system_uptime(args.resource_fragment))

    # Timestamp subcommand
    timestamp_parser = subparsers.add_parser(
        'timestamp', help='Query current timestamp (SYSTem:TIMEstamp?)')
    timestamp_parser.set_defaults(
        func=lambda args: query_system_timestamp(args.resource_fragment))

    # Device status subcommand
    status_parser = subparsers.add_parser(
        'status', help='Query device status word (STATus:DEVice?)')
    status_parser.set_defaults(
        func=lambda args: query_device_status(args.resource_fragment))

    accumulation_parser = subparsers.add_parser(
        'accumulation', help='Query accumulated charge and energy (MEASure:ACCumulated?)')
    accumulation_parser.set_defaults(
        func=lambda args: query_accumulated_values(args.resource_fragment))

    accumulation_reset_parser = subparsers.add_parser(
        'accumulation_reset', help='Reset accumulated charge and energy (MEASure:ACCumulated:RESET)')
    accumulation_reset_parser.set_defaults(
        func=lambda args: reset_accumulated_values(args.resource_fragment))

    # Capture cycle time subcommand
    cycle_time_parser = subparsers.add_parser(
        'capture_cycle_time', help='Query the length of a capture cycle in nanoseconds (BUS:CC:CAPture:CYCLETIME?)')
    cycle_time_parser.set_defaults(
        func=lambda args: query_capture_cycle_time(args.resource_fragment))

    # Message count subcommand
    msg_count_parser = subparsers.add_parser(
        'message_count', help='Query captured CC bus message count (BUS:CC:CAPture:COUNT?)')
    msg_count_parser.set_defaults(
        func=lambda args: query_message_count(args.resource_fragment))

    # Capture enable subcommand
    cap_enable_parser = subparsers.add_parser(
        'capture', help='Query or set CC bus capture enable state (BUS:CC:CAP_EN? or BUS:CC:CAP:EN ON|OFF)')
    cap_enable_parser.add_argument(
        'state', help='State: query, on, or off')
    cap_enable_parser.set_defaults(
        func=lambda args: capture_enable(args.state, args.resource_fragment))

    # Capture clear subcommand
    cap_clear_parser = subparsers.add_parser(
        'capture_clear', help='Clear captured CC bus messages (BUS:CC:CAP_CLEAR)')
    cap_clear_parser.set_defaults(
        func=lambda args: capture_clear(args.resource_fragment))

    # Message subcommand
    msg_parser = subparsers.add_parser(
        'message', help='Fetch next captured CC bus message (BUS:CC:CAPture:DATA?)')
    msg_parser.set_defaults(
        func=lambda args: fetch_next_message(args.resource_fragment))

    args = parser.parse_args()

    # If no subcommand is provided, default to IDN
    if not hasattr(args, 'func'):
        get_device_identification(args.resource_fragment)
    else:
        args.func(args)


if __name__ == "__main__":
    main()
