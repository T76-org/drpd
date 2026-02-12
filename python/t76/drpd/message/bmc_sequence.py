"""
Copyright (c) 2025 MTA, Inc.

This module defines the BMCSequence class for decoding USB-PD BMC sequences, including
the extraction of SOP, kcodes, and CRC validation.
"""
import logging

from dataclasses import dataclass
from typing import List

from t76.drpd.message.header import CablePlug, Header, MessageType, PortDataRole, PortPowerRole
from t76.drpd.message import Message
from t76.drpd.message.sop import SOP


@dataclass
class BMCSequence:
    """
    Represents a decoded BME sequence with its associated SOP and kcodes.

    Attributes:
        sop (SOP): The SOP block associated with the BME sequence.
        kcodes (List[int]): The list of kcodes that form the BME sequence.
        matched_kcodes (int): The number of kcodes that matched the expected SOP pattern.
    """
    start_timestamp: int
    end_timestamp: int
    preamble_clock: float
    preamble_frequency: float
    message_clock: float
    message_frequency: float
    pulse_lengths: List[float]
    decoded_bytes: List[int]
    sop: SOP
    header: Header
    message: Message
    crc: int
    expected_crc: int
    crc_valid: bool

    @classmethod
    def _compute_crc32(cls, data: list[int]) -> int:
        """
        Compute CRC32 checksum for the given data according
        to the USB-PD specification.

        Args:
            data (bytes): The data to compute the CRC32 for.

        Returns:
            int: The computed CRC32 checksum.
        """
        crc = 0xFFFFFFFF
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if (crc & 1) == 1:
                    crc = (crc >> 1) ^ 0xEDB88320
                else:
                    crc >>= 1
        return crc ^ 0xFFFFFFFF

    @classmethod
    def from_scpi_response(cls, scpi_data: list[int], pulse_cycle_duration: float) -> 'BMCSequence':
        """
        Create a BMESequence instance from a list of transition times.

        Args:
            transitions (List[int]): A list of transition times.

        Returns:
            BMESequence: An instance of BMESequence with the provided transitions.
        """

        # The format of the message as sent by the device is as follows:
        #
        # - 8 bytes: timestamp (uint64_t)
        # - 1 byte: message decoding result
        # - 4 bytes: SOP
        # - 4 bytes: number of pulses that follows (pulse_count, uint32_t)
        # - <pulse_count> bytes: pulse lengths (uint16_t[])
        # - 4 bytes: number of data bytes that follows (data_count, uint32_t)
        # - <data_count> bytes: data bytes (uint8_t[])

        # The first 8 bytes are going to be the start timestamp, expressed as a
        # unsigned 64-bit integer.
        start_timestamp = int.from_bytes(scpi_data[:8], 'little')

        # The next 8 bytes are the end timestamp.
        end_timestamp = int.from_bytes(scpi_data[8:16], 'little')

        # The next 4 bytes are the decoding result, we currently ignore it.
        _ = scpi_data[16:20]

        # The next 4 bytes are the SOP. We extract is a series of 4 integers.
        sop_bytes = scpi_data[20:24]
        sop = SOP.from_kcodes(sop_bytes)

        # The next 4 bytes are the number of pulses that follow.
        pulse_count = int.from_bytes(scpi_data[24:28], 'little')

        preamble_clock = 0.0
        preamble_frequency = 0.0
        message_clock = 0.0
        message_frequency = 0.0

        # The next <pulse_count> bytes are the pulse lengths.
        pulse_data_start = 28
        pulse_data_end = pulse_data_start + pulse_count * 2
        pulse_lengths = []
        counter = 0

        for i in range(pulse_data_start, pulse_data_end, 2):
            pulse_length = int.from_bytes(
                scpi_data[i:i+2], 'little') * pulse_cycle_duration
            pulse_lengths.append(pulse_length * 1e6)

            if counter < 96:
                preamble_clock += pulse_length * 2 if counter % 3 == 0 else pulse_length
            elif pulse_length > preamble_clock * 2 / 3:
                message_clock += pulse_length
            else:
                message_clock += pulse_length * 2

            counter += 1

            if counter == 96:
                preamble_clock /= 96

        message_clock /= (len(pulse_lengths) - 96)

        preamble_frequency = 1 / preamble_clock
        message_frequency = 1 / message_clock

        # The next 4 bytes are the number of data bytes that follow.
        data_count_start = pulse_data_end
        data_count_end = data_count_start + 4
        data_count = int.from_bytes(
            scpi_data[data_count_start:data_count_end], 'little')

        # The next <data_count> bytes are the data bytes.
        data_start = data_count_end
        data_end = data_start + data_count
        decoded_bytes = scpi_data[data_start:data_end]

        # Validate the CRC32

        if len(decoded_bytes) >= 4:
            try:
                body = decoded_bytes[:-4]
                crc = int.from_bytes(decoded_bytes[-4:], 'little')
                expected_crc = cls._compute_crc32(body)
            except ValueError as e:
                logging.error("Error computing CRC: %s", e)
                body = decoded_bytes
                crc = 0xffffffff
                expected_crc = 0
        else:
            body = decoded_bytes
            crc = 0xffffffff
            expected_crc = 0
            logging.error("Not enough data to validate CRC.")

        header = Header(
            sop=sop, header_data=int.from_bytes(body[:2], 'little'))

        msg = Message.from_body(header, list(body[2:]))

        return cls(
            start_timestamp=start_timestamp,
            end_timestamp=end_timestamp,
            preamble_clock=preamble_clock,
            preamble_frequency=preamble_frequency,
            message_clock=message_clock,
            message_frequency=message_frequency,
            pulse_lengths=pulse_lengths,
            decoded_bytes=decoded_bytes,
            sop=sop,
            header=header,
            message=msg,
            crc=crc,
            expected_crc=expected_crc,
            crc_valid=crc == expected_crc,
        )

    def generate_goodcrc(self, port_power_role: PortPowerRole, port_data_role: PortDataRole, cable_plug: CablePlug) -> Header:
        """
        Generate a GoodCRC header for the current BMCSequence.

        Returns:
            Header: A Header instance representing a GoodCRC message.
        """
        return Header.from_fields(
            sop=self.sop,
            message_type=MessageType.GOOD_CRC,
            data_object_count=0,
            message_id=self.header.message_id,
            specification_revision=self.header.specification_revision,
            port_power_role=port_power_role,
            port_data_role=port_data_role,
            cable_plug=cable_plug
        )

    def __repr__(self):
        return (f"BMESequence(sop={self.sop}, "
                f"header={self.header}, "
                f"message={self.message}, "
                f"crc={self.crc}, "
                f"expected_crc={self.expected_crc}, "
                f"crc_valid={self.crc_valid})")
