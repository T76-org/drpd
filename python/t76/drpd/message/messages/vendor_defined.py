"""
Vendor Defined Message
"""
from typing import List, Dict, Any

from ._base import StandardMessage
from ..data_objects import (
    UvdmHeaderVDO,
    SvdmHeaderVDO,
    GenericPayloadVDO,
    VDO,
    IdHeaderVDO, CertStatVDO, ProductVDO,
    ProductTypeUfpVDO, ProductTypeDfpVDO,
    PassiveCableVDO, ActiveCableVDO1, ActiveCableVDO2, ActiveCableVDO3,
    AmaVDO, VpdVDO,
    SvidsVDO, ModesVDO,
    EnterModePayloadVDO, ExitModePayloadVDO,
    AttentionVDO,
)


class VendorDefinedMessage(StandardMessage):
    """
    Display-oriented wrapper for a USB-PD Vendor Defined (VDM) message.

    Parses the body into 32-bit VDOs (little-endian). VDO[0] is the header:
      - If VDM Type bit == 1 => Structured VDM (SVDM)
      - If VDM Type bit == 0 => Unstructured VDM (UVDM)

    Payload VDOs are decoded into specific subclasses where the spec layout is standard
    (e.g., Discover Identity, Discover SVIDs, Discover Modes). Otherwise, payload words
    are wrapped as GenericPayloadVDO for display. No validation or vendor-specific decoding.
    """

    # ---------- Raw parsing ----------

    @property
    def name(self) -> str:
        return "Vendor_Defined"

    @property
    def data_objects_raw(self) -> List[int]:
        """
        Parse the message body into 32-bit words (little-endian).
        Any trailing bytes < 4 are ignored.
        """
        words: List[int] = []
        for i in range(0, len(self.body), 4):
            if i + 3 >= len(self.body):
                break
            words.append(int.from_bytes(
                self.body[i:i + 4], byteorder="little", signed=False))
        return words

    @property
    def vdo_count(self) -> int:
        """Number of 32-bit VDOs present."""
        return len(self.data_objects_raw)

    # ---------- Header ----------

    @property
    def is_structured(self) -> bool:
        """
        True if VDO[0] indicates a Structured VDM (SVDM). False for Unstructured or empty body.
        """
        raws = self.data_objects_raw
        if not raws:
            return False
        return ((raws[0] >> 15) & 0x1) == 1  # B15 = VDM Type

    @property
    def header(self) -> "SvdmHeaderVDO | UvdmHeaderVDO | None":
        """Decode and return the VDM header object, or None if there are no VDOs."""
        raws = self.data_objects_raw
        if not raws:
            return None
        return SvdmHeaderVDO(raws[0]) if self.is_structured else UvdmHeaderVDO(raws[0])

    # ---------- Payload decoding ----------

    @property
    def payload_vdos(self) -> List["VDO"]:
        """
        Decode payload VDOs into specific subclasses when possible (display-only).
        For UVDM: payload is opaque → GenericPayloadVDO.
        For SVDM: use header.command to choose known layouts for standard commands.

        Returns a list of VDO instances in payload order (index 0 == first after header).
        """
        raws = self.data_objects_raw
        if len(raws) <= 1:
            return []

        header = self.header
        payload_words = raws[1:]

        if header is None:
            return [GenericPayloadVDO(raw=w, index=i) for i, w in enumerate(payload_words)]

        if isinstance(header, UvdmHeaderVDO):
            # Unstructured: payload is opaque vendor data.
            return [GenericPayloadVDO(raw=w, index=i) for i, w in enumerate(payload_words)]

        # Structured: decode based on the standard command number (0..15).
        if isinstance(header, SvdmHeaderVDO):
            cmd = getattr(header, "command", None)

            if cmd == 1:  # Discover Identity (response path)
                return self._parse_discover_identity(payload_words)

            if cmd == 2:  # Discover SVIDs (response)
                return [SvidsVDO(w) for w in payload_words]

            if cmd == 3:  # Discover Modes (response)
                return [ModesVDO(w) for w in payload_words]

            if cmd == 4:  # Enter Mode
                return [EnterModePayloadVDO(w) for w in payload_words] if payload_words else []

            if cmd == 5:  # Exit Mode
                return [ExitModePayloadVDO(w) for w in payload_words] if payload_words else []

            if cmd == 6:  # Attention
                return [AttentionVDO(w) for w in payload_words] if payload_words else []

        # Default for other commands or header types: generic display
        return [GenericPayloadVDO(raw=w, index=i) for i, w in enumerate(payload_words)]

    # ---------- Heuristics for Discover Identity payload ----------

    def _parse_discover_identity(self, payload_words: List[int]) -> List["VDO"]:
        """
        Decode Discover Identity response payload (display-oriented).
        Expected order on the wire:
          0: IdHeaderVDO
          1: CertStatVDO (XID)
          2: ProductVDO
          3+: Product-type-specific VDOs

        Product Type VDO parsing is selected from the ID Header product type
        fields for SOP and SOP' paths. Unknown/extra words are preserved as
        generic payload VDOs for display.
        """
        vdos: List[VDO] = []
        if not payload_words:
            return vdos

        # 0: Identity Header
        idh = IdHeaderVDO(payload_words[0])
        vdos.append(idh)

        # 1: Cert Stat (if present)
        idx = 1
        if idx < len(payload_words):
            vdos.append(CertStatVDO(payload_words[idx]))
            idx += 1

        # 2: Product VDO (if present)
        if idx < len(payload_words):
            vdos.append(ProductVDO(payload_words[idx]))
            idx += 1

        # Remaining: product-type-specific path.
        remaining = payload_words[idx:]
        if not remaining:
            return vdos

        cable_type = idh.sop_prime_cable_vpd_product_type
        ufp_type = idh.sop_ufp_product_type
        dfp_type = idh.sop_dfp_product_type

        if cable_type == 0b011:
            vdos.append(PassiveCableVDO(remaining[0]))
            for i, raw in enumerate(remaining[1:], start=1):
                vdos.append(GenericPayloadVDO(raw=raw, index=i))
            return vdos

        if cable_type == 0b100:
            vdos.append(ActiveCableVDO1(remaining[0]))
            if len(remaining) >= 2:
                vdos.append(ActiveCableVDO2(remaining[1]))
            if len(remaining) >= 3:
                vdos.append(ActiveCableVDO3(remaining[2]))
            for i, raw in enumerate(remaining[3:], start=3):
                vdos.append(GenericPayloadVDO(raw=raw, index=i))
            return vdos

        if cable_type == 0b110:
            vdos.append(VpdVDO(remaining[0]))
            for i, raw in enumerate(remaining[1:], start=1):
                vdos.append(GenericPayloadVDO(raw=raw, index=i))
            return vdos

        # SOP identity path (UFP/DFP based on ID Header product types).
        index = 0
        if ufp_type in (0b001, 0b010):
            vdos.append(ProductTypeUfpVDO(remaining[index]))
            index += 1
        elif ufp_type != 0b000:
            vdos.append(AmaVDO(remaining[index]))
            index += 1

        if index < len(remaining) and dfp_type in (0b001, 0b010, 0b011):
            if remaining[index] == 0 and index + 1 < len(remaining):
                vdos.append(GenericPayloadVDO(raw=remaining[index], index=index))
                index += 1
            if index < len(remaining):
                vdos.append(ProductTypeDfpVDO(remaining[index]))
                index += 1

        for i, raw in enumerate(remaining[index:], start=index):
            vdos.append(GenericPayloadVDO(raw=raw, index=i))

        return vdos

    # ---------- UI-friendly dump ----------

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """
        A dictionary of stringified properties suitable for UI rendering.

        Includes decoded VDM header and payload fields.
        """
        props = super().renderable_properties

        hdr = self.header
        if hdr is not None:
            hdr_dict: Dict[str, Any] = hdr.to_dict()
            props["Vendor Data Message Header"] = self._format_fields_block(
                hdr_dict
            )
            props["Structured"] = "Yes" if self.is_structured else "No"

        payload_blocks: List[str] = []
        for p in self.payload_vdos:
            d = p.to_dict()
            payload_blocks.append(self._format_fields_block(d))
        props["Vendor Data Message Payload"] = "\n\n".join(
            payload_blocks) if payload_blocks else "(none)"

        return props
