"""
Copyright (c) 2025 MTA, Inc.

Helper functions for bit manipulation in 32-bit integers.
These are used in various data objects to extract specific bits or ranges of bits.
"""


def _bits(x: int, hi: int, lo: int) -> int:
    """Return bits [hi:lo] (inclusive) from 32-bit value x."""
    mask = (1 << (hi - lo + 1)) - 1
    return (x >> lo) & mask


def _u32(x: int) -> int:
    """Coerce to unsigned 32-bit (accepts Python int)."""
    return x & 0xFFFFFFFF


def _byte(x: int, n: int) -> int:
    """Return byte n (0=LSB .. 3=MSB) from 32-bit integer x."""
    return (x >> (n * 8)) & 0xFF


__all__ = [
    "_bits",
    "_u32",
    "_byte",
]
