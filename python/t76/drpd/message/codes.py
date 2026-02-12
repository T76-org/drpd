"""
Copyright (c) 2025 MTA, Inc.

This module defines the various k-codes used by USB-PD communications.
"""

KCODE_SYNC_1 = 0b11000      # Sync-1
KCODE_SYNC_2 = 0b10001      # Sync-2
KCODE_SYNC_3 = 0b00110      # Sync-3

KCODE_EOP = 0b01101         # End of Packet

KCODE_RST_1 = 0b00111       # RST-1
KCODE_RST_2 = 0b11001       # RST-2

INVALID_5B_VALUE = 0xFF     # Used when an invalid k-code is received

FIVE_TO_FOUR_LUT = [
    INVALID_5B_VALUE,   # 00000 - Error
    INVALID_5B_VALUE,   # 00001 - Error
    INVALID_5B_VALUE,   # 00010 - Error
    INVALID_5B_VALUE,   # 00011 - Error
    INVALID_5B_VALUE,   # 00100 - Error
    INVALID_5B_VALUE,   # 00101 - Error
    INVALID_5B_VALUE,   # 00110 - K-code Sync-3
    INVALID_5B_VALUE,   # 00111 - K-code RST-1
    INVALID_5B_VALUE,   # 01000 - Error
    0x01,               # 01001 - 1
    0x04,               # 01010 - 4
    0x05,               # 01011 - 5
    INVALID_5B_VALUE,   # 01100 - Error
    INVALID_5B_VALUE,   # 01101 - K-code EOP
    0x06,               # 01110 - 6
    0x07,               # 01111 - 7
    INVALID_5B_VALUE,   # 10000 - Error
    INVALID_5B_VALUE,   # 10001 - K-code Sync-2
    0x08,               # 10010 - 8
    0x09,               # 10011 - 9
    0x02,               # 10100 - 2
    0x03,               # 10101 - 3
    0x0A,               # 10110 - A
    0x0B,               # 10111 - B
    INVALID_5B_VALUE,   # 11000 - K-code Sync-1
    INVALID_5B_VALUE,   # 11001 - K-code RST-2
    0x0C,               # 11010 - C
    0x0D,               # 11011 - D
    0x0E,               # 11100 - E
    0x0F,               # 11101 - F
    0x00,               # 11110 - 0
    INVALID_5B_VALUE    # 11111 - Error
]
