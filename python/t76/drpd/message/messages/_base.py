"""
Copyright (c) 2025 MTA, Inc.

Base message classes and factory for USB-PD messages.
"""
from abc import ABC, abstractmethod
import re
from typing import List, Dict, Optional, Callable, Any
from enum import Enum

from ..header import ExtendedHeader, Header, MessageCategory


class Origin(Enum):
    """
    Enum representing the origin of a USB-PD message.
    """
    SOURCE = "Source"
    SINK = "Sink"
    CABLE = "Cable"
    UNKNOWN = "Unknown"


class Message(ABC):
    """
    Base class representing a USB-PD message.
    It encapsulates the header, SOP, and data objects of the message.
    """

    # Factory registry: maps message types to factory functions
    _factory_registry: Dict[str, Callable[..., 'Message']] = {}
    _extended_chunk_state: Dict[tuple, dict] = {}

    def __init__(self, body: Optional[List[int]] = None):
        self.body = body or []

    @classmethod
    def register_factory(cls, key: str, factory_func: Callable[..., 'Message']) -> None:
        """Register a factory function for a specific message type."""
        cls._factory_registry[key] = factory_func

    @classmethod
    def from_body(cls, header: Header, body: List[int]) -> 'Message':
        """
        Factory method to create a Message instance from a body.

        :param header: The message header
        :param body: The body of the message as a list of integers.
        :return: An instance of a subclass of Message.
        """
        # Prefer specific factory for extended messages, fallback to generic
        if header.extended:
            body = cls._maybe_reassemble_extended_body(header, body)
            # Try specific extended type first
            specific_factory = cls._factory_registry.get(
                str(header.message_type.value))
            if specific_factory:
                return specific_factory(body)
            # Fallback to generic extended wrapper that accepts message_type
            generic_factory = cls._factory_registry.get('extended')
            if generic_factory:
                return generic_factory(body, header.message_type)

        # Check if control message
        if header.category == MessageCategory.CONTROL:
            factory = cls._factory_registry.get('control')
            if factory:
                return factory(body, header.message_type)

        # Try to get factory for specific message type
        key = str(header.message_type.value)
        factory = cls._factory_registry.get(key)
        if factory:
            return factory(body)

        # Default to UnknownMessage
        factory = cls._factory_registry.get('unknown')
        if factory:
            return factory(body)

        raise RuntimeError(
            f"No factory registered for message type: {header.message_type}")

    @classmethod
    def _extended_chunk_key(cls, header: Header) -> tuple:
        """Key used for chunk reassembly for one communication path."""
        return (
            str(header.sop),
            str(header.message_type.value),
            str(header.port_power_role.value),
            str(header.port_data_role.value),
            str(header.cable_plug.value),
        )

    @classmethod
    def _maybe_reassemble_extended_body(
        cls,
        header: Header,
        body: List[int],
    ) -> List[int]:
        """
        Reassemble chunked extended payloads when fragments arrive in order.

        If a full payload is reconstructed, returns a synthetic complete body:
          [extended_header_of_chunk0(2B)] + full_payload(data_size bytes)
        Otherwise returns the original fragment body.
        """
        if len(body) < 2:
            return body

        ext_raw = body[0] | (body[1] << 8)
        ext = ExtendedHeader(ext_raw)
        payload_fragment = bytes(body[2:])
        key = cls._extended_chunk_key(header)

        # Requests for chunks are control traffic from receiver; nothing to reassemble.
        if ext.request_chunk:
            return body

        if not ext.chunked:
            cls._extended_chunk_state.pop(key, None)
            return body

        if ext.chunk_number == 0:
            cls._extended_chunk_state[key] = {
                "expected_size": ext.data_size_bytes,
                "next_chunk": 1,
                "first_ext_raw": ext_raw,
                "payload": bytearray(payload_fragment),
            }
        else:
            state = cls._extended_chunk_state.get(key)
            if state is None:
                return body
            if (
                state["expected_size"] != ext.data_size_bytes
                or state["next_chunk"] != ext.chunk_number
            ):
                cls._extended_chunk_state.pop(key, None)
                return body
            state["payload"].extend(payload_fragment)
            state["next_chunk"] += 1

        state = cls._extended_chunk_state.get(key)
        if state is None:
            return body

        if len(state["payload"]) >= state["expected_size"]:
            payload = bytes(state["payload"][:state["expected_size"]])
            first_ext_raw = state["first_ext_raw"]
            cls._extended_chunk_state.pop(key, None)
            return [
                first_ext_raw & 0xFF,
                (first_ext_raw >> 8) & 0xFF,
                *payload,
            ]

        return body

    @property
    @abstractmethod
    def name(self) -> str:
        """
        Abstract property to get the name of the message.
        Must be implemented by subclasses.
        """

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """
        Returns a dictionary of properties that can be rendered for display.
        Subclasses can override this to provide additional properties.
        """
        return {
            "Message Type": self.name,
            # Each data object is 4 bytes
            "Data Objects": str(len(self.body) // 4)
        }

    @staticmethod
    def _is_internal_field(label: str) -> bool:
        text = label.strip().lower()
        blocked_terms = (
            "raw",
            "bit",
            "bits",
            "spec reference",
            "reserved",
            "word hi16",
            "word lo16",
            "binary",
            "class",
        )
        return any(term in text for term in blocked_terms)

    @staticmethod
    def _humanize_label(label: str) -> str:
        text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", label.replace("_", " "))
        text = " ".join(text.split()).title()
        replacements = {
            "Usb": "USB",
            "Pd": "PD",
            "Pdo": "Power Data Object",
            "Rdo": "Request Data Object",
            "Vdo": "Vendor Data Object",
            "Apdo": "Augmented Power Data Object",
            "Vid": "Vendor ID",
            "Pid": "Product ID",
            "Xid": "XID",
            "Vbus": "VBUS",
            "Vconn": "VCONN",
            "Pps": "PPS",
            "Avs": "AVS",
            "Epr": "EPR",
            "Spr": "SPR",
            "Svid": "SVID",
            "Sop": "SOP",
            "Bdo": "Bist Data Object",
            "Eprmdo": "Extended Power Range Mode Data Object",
            "Skedb": "Sink Capabilities Extended Data Block",
        }
        for old, new in replacements.items():
            text = re.sub(rf"\b{old}\b", new, text)
        return text

    @classmethod
    def _sanitize_fields(cls, fields: Dict[str, Any]) -> Dict[str, str]:
        cleaned: Dict[str, str] = {}
        for key, value in fields.items():
            label = cls._humanize_label(str(key))
            if cls._is_internal_field(label):
                continue
            if isinstance(value, bool):
                rendered = "Yes" if value else "No"
            elif value is None:
                rendered = "Not provided"
            else:
                rendered = str(value)
                if "spec section" in rendered.lower():
                    continue
            cleaned[label] = rendered
        return cleaned

    @classmethod
    def _format_fields_block(cls, fields: Dict[str, Any]) -> str:
        cleaned = cls._sanitize_fields(fields)
        return "\n".join(f"{k:<30}: {v}" for k, v in cleaned.items())


# ---------- Base class for ALL extended messages ----------

class ExtendedMessage(Message):
    """
    Mixin/base for PD Extended Messages.
    Assumes `self.body: List[int]` exists (from your Message base) and contains:
      [0:2]   -> Extended Header (little-endian)
      [2:2+N] -> Payload bytes (N = data_size_bytes)
    Provides:
      - extended_header: ExtendedHeader
      - payload_bytes: bytes
      - payload_words_le: List[int] of 32-bit little-endian words (for VDO-like parsing)
    """

    @property
    def extended_header(self) -> ExtendedHeader:
        # Expect at least 2 bytes. If not, treat as zeroed header safely.
        if len(self.body) < 2:
            return ExtendedHeader(0)
        raw16 = self.body[0] | (self.body[1] << 8)
        return ExtendedHeader(raw16)

    @property
    def payload_bytes(self) -> bytes:
        eh = self.extended_header
        start = 2
        end = min(len(self.body), start + eh.data_size_bytes)
        return bytes(self.body[start:end])

    @property
    def payload_expected_length(self) -> int:
        """Expected payload length from the extended header Data Size field."""
        return self.extended_header.data_size_bytes

    @property
    def payload_available_length(self) -> int:
        """Payload bytes currently available in this message body."""
        return max(0, len(self.body) - 2)

    @property
    def payload_complete(self) -> bool:
        """True when available payload is at least the extended header Data Size."""
        return self.payload_available_length >= self.payload_expected_length

    @property
    def payload_words_le(self) -> List[int]:
        """View payload as 32-bit little-endian words (ignore trailing <4 bytes)."""
        b = self.payload_bytes
        out: List[int] = []
        for i in range(0, len(b), 4):
            if i + 4 <= len(b):
                out.append(int.from_bytes(b[i:i+4], "little", signed=False))
        return out

    @property
    def renderable_extended(self) -> Dict[str, str]:
        """Convenience block to merge into subclass renderables."""
        eh = self._sanitize_fields(self.extended_header.to_dict())
        return {
            "Extended Header": "\n".join(f"{k:<22}: {v}" for k, v in eh.items()),
            "Payload Complete": "Yes" if self.payload_complete else "No",
            "Payload Progress": (
                f"{self.payload_available_length}/{self.payload_expected_length} bytes"
            ),
        }


class StandardMessage(Message):
    """Base class for standard (non-extended) data messages."""
