"""
Copyright (c) 2025 MTA, Inc.

This module defines the SOP (Start of Packet) structure for USB-PD communications.
"""
from enum import Enum
from typing import List

from .codes import KCODE_SYNC_1, KCODE_SYNC_2, KCODE_SYNC_3, KCODE_RST_1, KCODE_RST_2


SOP_KCODE_COMBINATIONS = {
    "SOP": [KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_2],
    "SOP'": [KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_3, KCODE_SYNC_3],
    "SOP''": [KCODE_SYNC_1, KCODE_SYNC_3, KCODE_SYNC_1, KCODE_SYNC_3],
    "SOP' Debug": [KCODE_SYNC_1, KCODE_RST_2,  KCODE_RST_2,  KCODE_SYNC_3],
    "SOP'' Debug": [KCODE_SYNC_1, KCODE_RST_2,  KCODE_SYNC_3, KCODE_SYNC_2],
    "Hard Reset": [KCODE_RST_1,  KCODE_RST_1,  KCODE_RST_1,  KCODE_RST_2],
    "Cable Reset": [KCODE_RST_1,  KCODE_SYNC_1, KCODE_RST_1,  KCODE_SYNC_3],
}


class SOPType(Enum):
    """
    Enum representing the different types of SOP blocks
    """
    SOP = "SOP"
    SOP_PRIME = "SOP'"
    SOP_DOUBLE_PRIME = "SOP''"
    HARD_RESET = "Hard Reset"
    CABLE_RESET = "Cable Reset"
    SOP_PRIME_DEBUG = "SOP' Debug"
    SOP_DOUBLE_PRIME_DEBUG = "SOP'' Debug"
    INVALID = "Invalid"

    def encode(self) -> bytes:
        """
        Encode the SOP into bytes for transmission.
        """
        return bytes(SOP_KCODE_COMBINATIONS[self.value])


class SOP:
    """
    Class representing a SOP (Start of Packet) block in USB-PD communication.
    It encapsulates the SOP type, the kcodes that form the SOP, and provides methods
    for validation and instantiation from kcodes.
    """

    def __init__(self, sop_type: SOPType, kcodes: List[int], matched_kcodes: int):
        self.sop_type = sop_type
        self.kcodes = kcodes
        self.matched_kcodes = matched_kcodes

    def __repr__(self):
        return f"SOP(type={self.sop_type.value}, kcodes={self.kcodes})"

    @property
    def is_valid(self) -> bool:
        """
        Check if the SOP is valid.
        A SOP is valid if its type is not INVALID and it contains exactly 4 kcodes.
        """
        return self.sop_type != SOPType.INVALID and len(self.kcodes) == 4

    @classmethod
    def from_kcodes(cls, kcodes: list[int]) -> 'SOP':
        """
        Create a SOP instance from a list of kcodes.
        The kcodes must be a list of 4 elements, and the method will determine
        the SOP type based on the provided kcodes.
        If the kcodes do not match any known SOP pattern, an invalid SOP is returned.

        As per the PD specification, a SOP will be valid if at least 3 of the provided kcodes match
        the expected kcodes for a specific SOP type. This allows for some flexibility in communication,
        especially in noisy environments or when dealing with partial data.
        """
        if len(kcodes) == 4:
            # Go through the list of SOP kcode combinations and
            # check if at least 3 of the provided kcodes match.
            # If so, return a new instance of SOP with the appropriate type
            # and number of matches.
            #
            # Otherwise, return an invalid SOP.

            for sop_type, sop_kcodes in SOP_KCODE_COMBINATIONS.items():
                matches = sum(1 for kcode, sop_kcode in zip(
                    kcodes, sop_kcodes) if kcode == sop_kcode)
                if matches >= 3:
                    return cls(sop_type=SOPType(sop_type), kcodes=kcodes, matched_kcodes=matches)

        return cls(sop_type=SOPType.INVALID, kcodes=kcodes, matched_kcodes=0)
