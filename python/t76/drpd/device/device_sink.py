"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

import asyncio
from collections import deque
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING, Deque, Optional

from t76.drpd.device.device_sink_pdos import DeviceSinkPDO
from t76.drpd.device.types import (
    AuthenticationCertificateInquiryData,
    AuthenticationChallengeInquiryData,
    AuthenticationDigestsInquiryData,
    AuthenticationErrorInquiryData,
    BatteryCapabilitiesInquiryData,
    BatteryCapacity,
    BatteryCapacityMeaning,
    BatteryChargingState,
    BatteryInquiryFailureAction,
    BatteryStatusInquiryData,
    BatterySurveyResult,
    CableDiscoverIdentityInquiryRequest,
    CableDiscoverModesInquiryRequest,
    CableDiscoverSVIDsInquiryRequest,
    CableManufacturerInfoInquiryRequest,
    CablePlug,
    CableRevisionInquiryRequest,
    CableStatusInquiryData,
    CableStatusInquiryRequest,
    ChallengeInquiryRequest,
    CountryCodesInquiryData,
    CountryInfoInquiryData,
    CountryInquiryFailureAction,
    CountryInquiryWorkflowResult,
    DiscoverIdentityInquiryData,
    DiscoverIdentityInquiryRequest,
    DiscoverModesInquiryData,
    DiscoverModesInquiryRequest,
    DiscoverSVIDsInquiryData,
    DiscoverSVIDsInquiryRequest,
    ExtendedSourceCapabilitiesInquiryData,
    GetCertificateInquiryRequest,
    GetDigestsInquiryRequest,
    GetCountryCodesInquiryRequest,
    GetCountryInfoInquiryRequest,
    GetBatteryCapabilitiesInquiryRequest,
    GetBatteryStatusInquiryRequest,
    GetManufacturerInfoInquiryRequest,
    ManufacturerInfoInquiryData,
    ManufacturerInfoTarget,
    Mode,
    PPSStatusInquiryData,
    RevisionInquiryData,
    SinkInquiryDecodedData,
    SinkRequestOutcome,
    SinkRequestStatus,
    SinkInquiryOutcome,
    SinkInquiryRequest,
    SinkInquiryResult,
    SinkInquiryStatus,
    SinkInquiryType,
    SinkState,
    SourceCapabilitiesInquiryData,
    SourceInfoInquiryData,
    SourceStatusInquiryData,
    StructuredVDMHeaderData,
    StructuredVDMNegativeResponseData,
    VDMDiscoveryFailureAction,
    VDMDiscoveryWorkflowResult,
)
from t76.drpd.message.data_objects import SourcePDO

from .device_internal import DeviceInternal

if TYPE_CHECKING:
    from t76.drpd.device.device import Device


@dataclass
class SinkInfo:
    """
    Represents comprehensive information about the sink system of the DRPD device.
    """

    status: SinkState
    negotiated_pdo: Optional[DeviceSinkPDO]
    negotiated_voltage: float
    negotiated_current: float
    error_status: bool


class SinkInquirySupersededError(RuntimeError):
    """Raised when firmware's latest result no longer belongs to this run."""


class SinkInquiryRunner:
    """Serialize, correlate, and retain semantic Sink inquiry executions."""

    MAX_HISTORY = 256
    MAX_POLLS = 10000
    MAX_POLL_INTERVAL_SECONDS = 60.0

    def __init__(self, sink: "DeviceSink", history_limit: int = 64):
        if not 1 <= history_limit <= self.MAX_HISTORY:
            raise ValueError(
                f"history_limit must be between 1 and {self.MAX_HISTORY}"
            )
        self._sink = sink
        self._lock = asyncio.Lock()
        self._history: Deque[SinkInquiryResult] = deque(maxlen=history_limit)

    @property
    def history(self) -> tuple[SinkInquiryResult, ...]:
        """Return oldest-to-newest completed host-side inquiry history."""
        return tuple(self._history)

    async def run(
        self,
        request: SinkInquiryRequest,
        *,
        poll_interval_seconds: float = 0.01,
        max_polls: int = 1000,
    ) -> SinkInquiryResult:
        """Run one inquiry and return its correlated terminal result."""
        self._validate_run_options(poll_interval_seconds, max_polls)

        async with self._lock:
            return await self._run_locked(
                request, poll_interval_seconds, max_polls
            )

    def _validate_run_options(
        self, poll_interval_seconds: float, max_polls: int
    ) -> None:
        if not 0 <= poll_interval_seconds <= self.MAX_POLL_INTERVAL_SECONDS:
            raise ValueError(
                "poll_interval_seconds must be between 0 and "
                f"{self.MAX_POLL_INTERVAL_SECONDS}"
            )
        if not 1 <= max_polls <= self.MAX_POLLS:
            raise ValueError(f"max_polls must be between 1 and {self.MAX_POLLS}")

    async def _run_locked(
        self,
        request: SinkInquiryRequest,
        poll_interval_seconds: float,
        max_polls: int,
    ) -> SinkInquiryResult:
        """Run one validated inquiry while caller holds the runner lock."""
        baseline = await self._sink.get_inquiry_status()
        await self._sink.send_inquiry(request)
        request_id: int | None = None

        for poll_index in range(max_polls):
            status = await self._sink.get_inquiry_status()

            if request_id is None and status.request_id == baseline.request_id:
                if poll_index + 1 < max_polls and poll_interval_seconds:
                    await asyncio.sleep(poll_interval_seconds)
                continue

            if status.type != request.type:
                raise SinkInquirySupersededError(
                    "Inquiry result type changed before this request completed"
                )

            if request_id is None:
                request_id = status.request_id
            elif status.request_id != request_id:
                raise SinkInquirySupersededError(
                    f"Inquiry {request_id} was superseded by "
                    f"inquiry {status.request_id}"
                )

            if status.outcome == SinkInquiryOutcome.PENDING:
                if poll_index + 1 < max_polls and poll_interval_seconds:
                    await asyncio.sleep(poll_interval_seconds)
                continue

            raw_response = None
            if (
                status.outcome == SinkInquiryOutcome.RESPONSE
                or status.response_length > 0
            ):
                raw_response = await self._sink.get_inquiry_response()
                if len(raw_response) != status.response_length:
                    raise ValueError(
                        "Inquiry response length does not match status: "
                        f"expected {status.response_length}, "
                        f"got {len(raw_response)}"
                    )

            decoded = None
            if raw_response is not None:
                decoded = _decode_inquiry_response(request, status, raw_response)

            result = SinkInquiryResult(request, status, raw_response, decoded)
            self._history.append(result)
            return result

        raise TimeoutError(
            "Inquiry did not publish a correlated terminal result within "
            f"{max_polls} polls"
        )

    async def run_country_information(
        self,
        country_codes: tuple[str, ...] | None = None,
        *,
        failure_action: CountryInquiryFailureAction = (
            CountryInquiryFailureAction.STOP
        ),
        max_retries: int = 1,
        max_countries: int = 12,
        poll_interval_seconds: float = 0.01,
        max_polls: int = 1000,
    ) -> CountryInquiryWorkflowResult:
        """Enumerate country codes, then fetch selected or all country data."""
        if not 0 <= max_retries <= 3:
            raise ValueError("max_retries must be between 0 and 3")
        if not 1 <= max_countries <= 12:
            raise ValueError("max_countries must be between 1 and 12")

        self._validate_run_options(poll_interval_seconds, max_polls)
        async with self._lock:
            return await self._run_country_information_locked(
                country_codes,
                failure_action,
                max_retries,
                max_countries,
                poll_interval_seconds,
                max_polls,
            )

    async def _run_country_information_locked(
        self,
        country_codes: tuple[str, ...] | None,
        failure_action: CountryInquiryFailureAction,
        max_retries: int,
        max_countries: int,
        poll_interval_seconds: float,
        max_polls: int,
    ) -> CountryInquiryWorkflowResult:
        """Run country discovery and fan-out while caller holds lock."""

        codes_result = await self._run_locked(
            GetCountryCodesInquiryRequest(),
            poll_interval_seconds,
            max_polls,
        )
        if codes_result.status.outcome != SinkInquiryOutcome.RESPONSE:
            return CountryInquiryWorkflowResult(codes_result, (), True)
        if not isinstance(codes_result.decoded, CountryCodesInquiryData):
            raise ValueError("Country Codes response did not decode")

        available = codes_result.decoded.country_codes
        if country_codes is None:
            selected = available
        else:
            selected = tuple(
                GetCountryInfoInquiryRequest(code).country_code
                for code in country_codes
            )
            unavailable = tuple(code for code in selected if code not in available)
            if unavailable:
                raise ValueError(
                    "Requested country code was not advertised: "
                    + ",".join(unavailable)
                )
        if len(selected) > max_countries:
            raise ValueError(
                f"Country workflow exceeds max_countries={max_countries}"
            )

        results: list[SinkInquiryResult] = []
        stopped = False
        for code in selected:
            attempt = 0
            while True:
                result = await self._run_locked(
                    GetCountryInfoInquiryRequest(code),
                    poll_interval_seconds,
                    max_polls,
                )
                results.append(result)
                if result.status.outcome == SinkInquiryOutcome.RESPONSE:
                    break
                if failure_action == CountryInquiryFailureAction.RETRY:
                    if attempt < max_retries:
                        attempt += 1
                        continue
                    stopped = True
                elif failure_action == CountryInquiryFailureAction.STOP:
                    stopped = True
                break
            if stopped:
                break

        return CountryInquiryWorkflowResult(
            codes_result, tuple(results), stopped
        )

    async def run_battery_survey(
        self,
        battery_references: tuple[int, ...] | None = None,
        *,
        extended_source_capabilities: (
            ExtendedSourceCapabilitiesInquiryData | None
        ) = None,
        failure_action: BatteryInquiryFailureAction = (
            BatteryInquiryFailureAction.STOP
        ),
        max_retries: int = 1,
        poll_interval_seconds: float = 0.01,
        max_polls: int = 1000,
    ) -> BatterySurveyResult:
        """Survey Battery Capabilities then Status for bounded references."""
        if not 0 <= max_retries <= 3:
            raise ValueError("max_retries must be between 0 and 3")
        if battery_references is not None:
            references = tuple(
                GetBatteryCapabilitiesInquiryRequest(ref).battery_reference
                for ref in battery_references
            )
            used_counts = False
        elif extended_source_capabilities is not None:
            fixed = extended_source_capabilities.fixed_batteries
            hot = extended_source_capabilities.hot_swappable_battery_slots
            if fixed > 4 or hot > 4:
                raise ValueError(
                    "Extended Source Capabilities battery counts exceed 4"
                )
            references = tuple(range(fixed)) + tuple(range(4, 4 + hot))
            used_counts = True
        else:
            references = tuple(range(8))
            used_counts = False
        if not references:
            if used_counts:
                return BatterySurveyResult((), (), True, False)
            raise ValueError("Battery survey requires at least one reference")
        if len(references) > 8 or len(set(references)) != len(references):
            raise ValueError(
                "Battery survey requires 1 to 8 unique references"
            )

        self._validate_run_options(poll_interval_seconds, max_polls)
        async with self._lock:
            results: list[SinkInquiryResult] = []
            stopped = False
            for reference in references:
                requests: tuple[SinkInquiryRequest, ...] = (
                    GetBatteryCapabilitiesInquiryRequest(reference),
                    GetBatteryStatusInquiryRequest(reference),
                )
                for request in requests:
                    attempts = 0
                    while True:
                        result = await self._run_locked(
                            request, poll_interval_seconds, max_polls
                        )
                        results.append(result)
                        if result.status.outcome == SinkInquiryOutcome.RESPONSE:
                            break
                        if failure_action == BatteryInquiryFailureAction.RETRY:
                            if attempts < max_retries:
                                attempts += 1
                                continue
                            stopped = True
                        elif failure_action == BatteryInquiryFailureAction.STOP:
                            stopped = True
                        break
                    if stopped:
                        break
                if stopped:
                    break
            return BatterySurveyResult(
                references, tuple(results), used_counts, stopped
            )

    async def run_vdm_discovery(
        self,
        selected_svids: tuple[int, ...] | None = None,
        *,
        failure_action: VDMDiscoveryFailureAction = (
            VDMDiscoveryFailureAction.STOP
        ),
        max_retries: int = 1,
        max_svids: int = 64,
        max_svid_pages: int = 8,
        poll_interval_seconds: float = 0.01,
        max_polls: int = 1000,
        _cable_plug: CablePlug | None = None,
    ) -> VDMDiscoveryWorkflowResult:
        """Diagnose SOP partner from UFP/Sink; SVIDs/Modes are optional."""
        def identity_request() -> SinkInquiryRequest:
            if _cable_plug is None:
                return DiscoverIdentityInquiryRequest()
            return CableDiscoverIdentityInquiryRequest(_cable_plug)

        def svid_request() -> SinkInquiryRequest:
            if _cable_plug is None:
                return DiscoverSVIDsInquiryRequest()
            return CableDiscoverSVIDsInquiryRequest(_cable_plug)

        def modes_request(svid: int) -> SinkInquiryRequest:
            if _cable_plug is None:
                return DiscoverModesInquiryRequest(svid)
            return CableDiscoverModesInquiryRequest(_cable_plug, svid)
        if not 0 <= max_retries <= 3:
            raise ValueError("max_retries must be between 0 and 3")
        if not 1 <= max_svids <= 64:
            raise ValueError("max_svids must be between 1 and 64")
        if not 1 <= max_svid_pages <= 8:
            raise ValueError("max_svid_pages must be between 1 and 8")
        requested = None
        if selected_svids is not None:
            requested = tuple(
                svid
                for svid in selected_svids
            )
            for svid in requested:
                modes_request(svid)
            if len(requested) > max_svids or len(set(requested)) != len(requested):
                raise ValueError(
                    "selected_svids must contain unique values within max_svids"
                )
        self._validate_run_options(poll_interval_seconds, max_polls)

        async with self._lock:
            identity_results, stopped = await self._run_vdm_step_locked(
                identity_request(), failure_action, max_retries,
                poll_interval_seconds, max_polls,
            )
            if stopped:
                return VDMDiscoveryWorkflowResult(
                    identity_results, (), (), (), True
                )
            all_identity_results = list(identity_results)
            all_svid_results: list[SinkInquiryResult] = []
            discovered_list: list[int] = []
            restarts = 0
            while True:
                complete = False
                restart = False
                discovered_list = []
                for _page in range(max_svid_pages):
                    page_result = await self._run_locked(
                        svid_request(),
                        poll_interval_seconds,
                        max_polls,
                    )
                    all_svid_results.append(page_result)
                    if page_result.status.outcome != SinkInquiryOutcome.RESPONSE:
                        if failure_action == VDMDiscoveryFailureAction.CONTINUE:
                            complete = True
                            break
                        if failure_action == VDMDiscoveryFailureAction.STOP:
                            return VDMDiscoveryWorkflowResult(
                                tuple(all_identity_results),
                                tuple(all_svid_results), (), (), True
                            )
                        if restarts >= max_retries:
                            return VDMDiscoveryWorkflowResult(
                                tuple(all_identity_results),
                                tuple(all_svid_results), (), (), True
                            )
                        restarts += 1
                        restart_identity, stopped = (
                            await self._run_vdm_step_locked(
                                identity_request(),
                                VDMDiscoveryFailureAction.RETRY,
                                max_retries,
                                poll_interval_seconds,
                                max_polls,
                            )
                        )
                        all_identity_results.extend(restart_identity)
                        if stopped:
                            return VDMDiscoveryWorkflowResult(
                                tuple(all_identity_results),
                                tuple(all_svid_results), (), (), True
                            )
                        restart = True
                        break
                    decoded = page_result.decoded
                    assert isinstance(decoded, DiscoverSVIDsInquiryData)
                    for svid in decoded.svids:
                        if svid not in discovered_list:
                            discovered_list.append(svid)
                    if len(discovered_list) > max_svids:
                        raise ValueError(
                            f"VDM discovery exceeds max_svids={max_svids}"
                        )
                    if decoded.complete:
                        complete = True
                        break
                if restart:
                    continue
                if not complete:
                    raise ValueError(
                        "Discover SVIDs continuation exceeds max_svid_pages"
                    )
                break
            identity_results = tuple(all_identity_results)
            svid_results = tuple(all_svid_results)
            discovered = tuple(discovered_list)
            chosen = discovered if requested is None else requested
            unavailable = tuple(svid for svid in chosen if svid not in discovered)
            if unavailable:
                raise ValueError(
                    "Selected SVID was not discovered: "
                    + ",".join(f"0x{svid:04X}" for svid in unavailable)
                )
            if len(chosen) > max_svids:
                raise ValueError(f"VDM discovery exceeds max_svids={max_svids}")

            mode_results: list[SinkInquiryResult] = []
            for svid in chosen:
                step_results, stopped = await self._run_vdm_step_locked(
                    modes_request(svid), failure_action,
                    max_retries, poll_interval_seconds, max_polls,
                )
                mode_results.extend(step_results)
                if stopped:
                    break
            return VDMDiscoveryWorkflowResult(
                identity_results,
                svid_results,
                tuple(mode_results),
                chosen,
                stopped,
            )

    async def run_cable_vdm_discovery(
        self,
        plug: CablePlug,
        selected_svids: tuple[int, ...] | None = None,
        *,
        failure_action: VDMDiscoveryFailureAction = (
            VDMDiscoveryFailureAction.STOP
        ),
        max_retries: int = 1,
        max_svids: int = 64,
        max_svid_pages: int = 8,
        poll_interval_seconds: float = 0.01,
        max_polls: int = 1000,
    ) -> VDMDiscoveryWorkflowResult:
        """Discover one explicit cable plug; never falls back to SOP."""
        return await self.run_vdm_discovery(
            selected_svids,
            failure_action=failure_action,
            max_retries=max_retries,
            max_svids=max_svids,
            max_svid_pages=max_svid_pages,
            poll_interval_seconds=poll_interval_seconds,
            max_polls=max_polls,
            _cable_plug=plug,
        )

    async def _run_vdm_step_locked(
        self,
        request: SinkInquiryRequest,
        failure_action: VDMDiscoveryFailureAction,
        max_retries: int,
        poll_interval_seconds: float,
        max_polls: int,
    ) -> tuple[tuple[SinkInquiryResult, ...], bool]:
        """Run one workflow step with bounded terminal-outcome handling."""
        results: list[SinkInquiryResult] = []
        retries = 0
        while True:
            result = await self._run_locked(
                request, poll_interval_seconds, max_polls
            )
            results.append(result)
            if result.status.outcome == SinkInquiryOutcome.RESPONSE:
                return tuple(results), False
            if failure_action == VDMDiscoveryFailureAction.CONTINUE:
                return tuple(results), False
            if failure_action == VDMDiscoveryFailureAction.STOP:
                return tuple(results), True
            if retries >= max_retries:
                return tuple(results), True
            retries += 1


def _decode_inquiry_response(
    request: SinkInquiryRequest,
    status: SinkInquiryStatus,
    body: bytes,
) -> SinkInquiryDecodedData:
    """Decode one validated logical response body."""
    inquiry_type = request.type
    expected_metadata = {
        SinkInquiryType.GET_SOURCE_CAP: (2, 0x01),
        SinkInquiryType.GET_SOURCE_CAP_EXTENDED: (0, 0x01),
        SinkInquiryType.GET_STATUS: (0, 0x02),
        SinkInquiryType.GET_REVISION: (2, 0x0C),
        SinkInquiryType.GET_SOURCE_INFO: (2, 0x0B),
        SinkInquiryType.GET_PPS_STATUS: (0, 0x0C),
        SinkInquiryType.GET_MANUFACTURER_INFO: (0, 0x07),
        SinkInquiryType.GET_COUNTRY_CODES: (0, 0x0E),
        SinkInquiryType.GET_COUNTRY_INFO: (0, 0x0D),
        SinkInquiryType.GET_BATTERY_CAP: (0, 0x05),
        SinkInquiryType.GET_BATTERY_STATUS: (2, 0x05),
        SinkInquiryType.DISCOVER_IDENTITY: (2, 0x0F),
        SinkInquiryType.DISCOVER_SVIDS: (2, 0x0F),
        SinkInquiryType.DISCOVER_MODES: (2, 0x0F),
        SinkInquiryType.GET_DIGESTS: (0, 0x09),
        SinkInquiryType.GET_CERTIFICATE: (0, 0x09),
        SinkInquiryType.CHALLENGE: (0, 0x09),
    }
    expected_class, expected_type = expected_metadata[inquiry_type]
    if (
        status.response_class != expected_class
        or status.response_type != expected_type
    ):
        raise ValueError(
            "Inquiry response metadata does not match request: "
            f"expected class/type {expected_class}/{expected_type}, got "
            f"{status.response_class}/{status.response_type}"
        )

    if inquiry_type in (
        SinkInquiryType.GET_DIGESTS,
        SinkInquiryType.GET_CERTIFICATE,
        SinkInquiryType.CHALLENGE,
    ):
        if len(body) < 4 or len(body) > 260:
            raise ValueError("Authentication body must contain 4 to 260 bytes")
        version, response_type, parameter1, parameter2 = body[:4]
        if version not in (0x10, 0x01):
            raise ValueError("Unsupported authentication protocol version")
        if response_type == 0x7F:
            if len(body) != 4:
                raise ValueError("Authentication ERROR body must be exactly 4 bytes")
            return AuthenticationErrorInquiryData(parameter1, parameter2)
        expected_auth_type = {
            SinkInquiryType.GET_DIGESTS: 0x01,
            SinkInquiryType.GET_CERTIFICATE: 0x02,
            SinkInquiryType.CHALLENGE: 0x03,
        }[inquiry_type]
        if response_type != expected_auth_type:
            raise ValueError("Authentication response type does not match request")
        if inquiry_type == SinkInquiryType.GET_DIGESTS:
            if parameter1 != 0x01:
                raise ValueError("DIGESTS capabilities must advertise USB authentication")
            slots = tuple(slot for slot in range(8) if parameter2 & (1 << slot))
            if len(body) != 4 + 32 * len(slots):
                raise ValueError("DIGESTS length does not match populated slot mask")
            return AuthenticationDigestsInquiryData(parameter2, tuple(
                (slot, body[4 + index * 32:36 + index * 32])
                for index, slot in enumerate(slots)
            ))
        if inquiry_type == SinkInquiryType.GET_CERTIFICATE:
            if not isinstance(request, GetCertificateInquiryRequest):
                raise ValueError("CERTIFICATE response has incompatible request")
            if parameter1 != request.slot or parameter2 != 0:
                raise ValueError("CERTIFICATE response does not correlate with slot")
            part = body[4:]
            if not part or request.offset + len(part) > 4096 or len(part) > request.length:
                raise ValueError("CERTIFICATE part violates progress/request/chain bounds")
            return AuthenticationCertificateInquiryData(request.slot, request.offset, part)
        if not isinstance(request, ChallengeInquiryRequest):
            raise ValueError("CHALLENGE_AUTH response has incompatible request")
        if parameter1 != request.slot or len(body) != 168:
            raise ValueError("CHALLENGE_AUTH response does not correlate or has wrong length")
        if not parameter2 & (1 << request.slot):
            raise ValueError("CHALLENGE_AUTH slot mask omits selected slot")
        if body[4:8] != b"\x01\x01\x01\x00":
            raise ValueError("CHALLENGE_AUTH version/capabilities/reserved fields are invalid")
        if any(body[72:104]):
            raise ValueError("CHALLENGE_AUTH PD Source context hash must be all zero")
        return AuthenticationChallengeInquiryData(request.slot, body[:104], body[104:])

    if inquiry_type == SinkInquiryType.GET_SOURCE_CAP:
        if not 4 <= len(body) <= 28 or len(body) % 4:
            raise ValueError(
                "Source_Capabilities body must contain 1 to 7 four-byte PDOs"
            )
        return SourceCapabilitiesInquiryData(tuple(
            SourcePDO.from_raw(int.from_bytes(body[offset:offset + 4], "little"))
            for offset in range(0, len(body), 4)
        ))

    if inquiry_type == SinkInquiryType.GET_SOURCE_CAP_EXTENDED:
        if len(body) not in (24, 25):
            raise ValueError(
                "Source_Capabilities_Extended body must be 24 or 25 bytes"
            )
        battery_slots = body[22]
        return ExtendedSourceCapabilitiesInquiryData(
            payload_length=len(body),
            vendor_id=int.from_bytes(body[0:2], "little"),
            product_id=int.from_bytes(body[2:4], "little"),
            xid=int.from_bytes(body[4:8], "little"),
            firmware_version=body[8],
            hardware_version=body[9],
            voltage_regulation=body[10],
            holdup_time_ms=body[11],
            compliance=body[12],
            touch_current=body[13],
            peak_current=(
                int.from_bytes(body[14:16], "little"),
                int.from_bytes(body[16:18], "little"),
                int.from_bytes(body[18:20], "little"),
            ),
            touch_temperature=body[20],
            source_inputs=body[21],
            hot_swappable_battery_slots=(battery_slots >> 4) & 0x0F,
            fixed_batteries=battery_slots & 0x0F,
            spr_source_pdp_w=body[23] & 0x7F,
            epr_source_pdp_w=body[24] if len(body) == 25 else None,
            has_epr_source_pdp=len(body) == 25,
        )

    if inquiry_type == SinkInquiryType.GET_STATUS:
        if isinstance(request, CableStatusInquiryRequest):
            if len(body) != 2:
                raise ValueError("Cable Status body must be exactly 2 bytes")
            if body[1] & 0xFE:
                raise ValueError("Cable Status reserved flag bits must be zero")
            temperature = body[0]
            return CableStatusInquiryData(
                internal_temperature_raw=temperature,
                internal_temperature_c=(
                    temperature if temperature >= 2 else None
                ),
                below_2_c=temperature == 1,
                flags_raw=body[1],
                thermal_shutdown=bool(body[1] & 0x01),
            )
        if len(body) not in (6, 7):
            raise ValueError("Status body must be 6 or 7 bytes for SOP")
        events = body[3]
        return SourceStatusInquiryData(
            payload_length=len(body),
            internal_temperature=body[0],
            present_input=body[1],
            present_battery_input=body[2],
            event_flags=events,
            temperature_status=(body[4] >> 1) & 0x03,
            power_status=body[5],
            power_state=body[6] if len(body) == 7 else None,
            has_power_state_change=len(body) == 7,
            over_current_event=bool(events & (1 << 1)),
            over_temperature_event=bool(events & (1 << 2)),
            over_voltage_event=bool(events & (1 << 3)),
            operating_in_current_limit=bool(events & (1 << 4)),
        )

    if inquiry_type == SinkInquiryType.GET_MANUFACTURER_INFO:
        if not 5 <= len(body) <= 26:
            raise ValueError(
                "Manufacturer_Info body must contain 5 to 26 bytes"
            )
        manufacturer_bytes = body[4:]
        terminator = manufacturer_bytes.find(b"\x00")
        if terminator < 0 or any(manufacturer_bytes[terminator + 1:]):
            raise ValueError(
                "Manufacturer_Info string must be null terminated"
            )
        text_bytes = manufacturer_bytes[:terminator]
        try:
            text = text_bytes.decode("ascii")
        except UnicodeDecodeError as exc:
            raise ValueError(
                "Manufacturer_Info string must contain ASCII bytes"
            ) from exc
        return ManufacturerInfoInquiryData(
            vendor_id=int.from_bytes(body[0:2], "little"),
            product_id=int.from_bytes(body[2:4], "little"),
            manufacturer_string=text,
            manufacturer_string_bytes=text_bytes,
        )

    if inquiry_type == SinkInquiryType.GET_COUNTRY_CODES:
        if not 4 <= len(body) <= 26:
            raise ValueError("Country_Codes body must contain 4 to 26 bytes")
        count = body[0]
        if body[1] != 0 or len(body) != 2 + count * 2:
            raise ValueError(
                "Country_Codes length/reserved fields do not match body"
            )
        codes: list[str] = []
        for offset in range(2, len(body), 2):
            pair = body[offset:offset + 2]
            if any(byte < ord("A") or byte > ord("Z") for byte in pair):
                raise ValueError(
                    "Country_Codes entries must be uppercase ASCII letters"
                )
            code = pair.decode("ascii")
            if code in codes:
                raise ValueError("Country_Codes contains a duplicate entry")
            codes.append(code)
        return CountryCodesInquiryData(tuple(codes))

    if inquiry_type == SinkInquiryType.GET_COUNTRY_INFO:
        if not 4 <= len(body) <= 26:
            raise ValueError("Country_Info body must contain 4 to 26 bytes")
        if body[2:4] != b"\x00\x00":
            raise ValueError("Country_Info reserved bytes must be zero")
        try:
            echoed_code = body[0:2].decode("ascii")
        except UnicodeDecodeError as exc:
            raise ValueError("Country_Info code must be ASCII") from exc
        if (
            len(echoed_code) != 2
            or not echoed_code.isalpha()
            or echoed_code != echoed_code.upper()
        ):
            raise ValueError(
                "Country_Info code must contain uppercase ASCII letters"
            )
        if not isinstance(request, GetCountryInfoInquiryRequest):
            raise ValueError("Country_Info response has incompatible request")
        if echoed_code != request.country_code:
            raise ValueError(
                "Country_Info response code does not match requested country"
            )
        return CountryInfoInquiryData(echoed_code, body[4:])

    if inquiry_type == SinkInquiryType.GET_BATTERY_CAP:
        if len(body) != 9:
            raise ValueError(
                "Battery_Capabilities body must be exactly 9 bytes"
            )
        battery_type = body[8]
        if battery_type & 0xFE:
            raise ValueError(
                "Battery_Capabilities reserved battery type bits must be zero"
            )

        def capacity(raw: int) -> BatteryCapacity:
            if raw == 0:
                meaning = BatteryCapacityMeaning.BATTERY_NOT_PRESENT
            elif raw == 0xFFFF:
                meaning = BatteryCapacityMeaning.UNKNOWN
            else:
                meaning = BatteryCapacityMeaning.VALUE
            return BatteryCapacity(raw, meaning)

        design = capacity(int.from_bytes(body[4:6], "little"))
        last_full = capacity(int.from_bytes(body[6:8], "little"))
        return BatteryCapabilitiesInquiryData(
            vendor_id=int.from_bytes(body[0:2], "little"),
            product_id=int.from_bytes(body[2:4], "little"),
            design_capacity=design,
            last_full_charge_capacity=last_full,
            battery_type_raw=battery_type,
            invalid_battery_reference=bool(battery_type & 0x01),
            battery_present=(
                design.meaning != BatteryCapacityMeaning.BATTERY_NOT_PRESENT
            ),
        )

    if inquiry_type == SinkInquiryType.GET_BATTERY_STATUS:
        if len(body) != 4:
            raise ValueError("Battery_Status body must be exactly 4 bytes")
        raw = int.from_bytes(body, "little")
        if raw & 0x0000F0FF:
            raise ValueError("Battery_Status reserved bits must be zero")
        present_capacity = (raw >> 16) & 0xFFFF
        battery_present = bool(raw & (1 << 9))
        charging_raw = (raw >> 10) & 0x03
        if charging_raw == BatteryChargingState.RESERVED.value:
            raise ValueError("Battery_Status charging state is reserved")
        if not battery_present and charging_raw != 0:
            raise ValueError(
                "Battery_Status absent battery must use charging state zero"
            )
        if present_capacity == 0xFFFF:
            capacity_meaning = BatteryCapacityMeaning.UNKNOWN
        elif not battery_present:
            capacity_meaning = BatteryCapacityMeaning.BATTERY_NOT_PRESENT
        else:
            capacity_meaning = BatteryCapacityMeaning.VALUE
        return BatteryStatusInquiryData(
            present_capacity_raw_tenths_wh=present_capacity,
            present_capacity_meaning=capacity_meaning,
            present_capacity_wh=(
                Decimal(present_capacity) / Decimal(10)
                if capacity_meaning == BatteryCapacityMeaning.VALUE
                else None
            ),
            invalid_battery_reference=bool(raw & (1 << 8)),
            battery_present=battery_present,
            charging_state=BatteryChargingState(charging_raw),
        )

    if inquiry_type in (
        SinkInquiryType.DISCOVER_IDENTITY,
        SinkInquiryType.DISCOVER_SVIDS,
        SinkInquiryType.DISCOVER_MODES,
    ):
        if not 4 <= len(body) <= 28 or len(body) % 4:
            raise ValueError(
                "Structured VDM response must contain 1 to 7 VDOs"
            )
        raw_vdos = tuple(
            int.from_bytes(body[offset:offset + 4], "little")
            for offset in range(0, len(body), 4)
        )
        raw_header = raw_vdos[0]
        svid = (raw_header >> 16) & 0xFFFF
        structured = (raw_header >> 15) & 0x01
        version_major_raw = (raw_header >> 13) & 0x03
        version_minor = (raw_header >> 11) & 0x03
        object_position = (raw_header >> 8) & 0x07
        command_type = (raw_header >> 6) & 0x03
        reserved = (raw_header >> 5) & 0x01
        command = raw_header & 0x1F
        if not structured or reserved or object_position:
            raise ValueError("Structured VDM ACK header fields are malformed")
        expected_command_type = {
            SinkInquiryOutcome.RESPONSE: 1,
            SinkInquiryOutcome.NAK: 2,
            SinkInquiryOutcome.BUSY: 3,
        }.get(status.outcome)
        if expected_command_type is None or command_type != expected_command_type:
            raise ValueError(
                "Structured VDM command type does not match terminal outcome"
            )
        if version_major_raw > 1 or version_minor > 1 or (
            version_major_raw == 0 and version_minor != 0
        ):
            raise ValueError("Structured VDM ACK version is unsupported")
        expected_command = {
            SinkInquiryType.DISCOVER_IDENTITY: 1,
            SinkInquiryType.DISCOVER_SVIDS: 2,
            SinkInquiryType.DISCOVER_MODES: 3,
        }[inquiry_type]
        if command != expected_command:
            raise ValueError("Structured VDM ACK command does not match request")
        expected_svid = 0xFF00
        if isinstance(
            request,
            (DiscoverModesInquiryRequest, CableDiscoverModesInquiryRequest),
        ):
            expected_svid = request.svid
        if svid != expected_svid:
            raise ValueError("Structured VDM ACK SVID does not match request")
        header = StructuredVDMHeaderData(
            raw_header, svid, version_major_raw + 1, version_minor, command
        )
        if status.outcome in (
            SinkInquiryOutcome.NAK, SinkInquiryOutcome.BUSY
        ):
            if len(raw_vdos) != 1:
                raise ValueError("Structured VDM NAK/BUSY must be header-only")
            return StructuredVDMNegativeResponseData(header, status.outcome)
        payload_vdos = raw_vdos[1:]
        if inquiry_type == SinkInquiryType.DISCOVER_IDENTITY:
            if len(payload_vdos) < 3:
                raise ValueError(
                    "Discover Identity ACK requires at least three Identity VDOs"
                )
            return DiscoverIdentityInquiryData(header, payload_vdos)
        if inquiry_type == SinkInquiryType.DISCOVER_SVIDS:
            if not payload_vdos:
                raise ValueError("Discover SVIDs ACK requires an SVID VDO")
            ordered: list[int] = []
            terminated = False
            for raw_vdo in payload_vdos:
                for candidate in ((raw_vdo >> 16) & 0xFFFF, raw_vdo & 0xFFFF):
                    if candidate == 0:
                        terminated = True
                    elif terminated:
                        raise ValueError(
                            "Discover SVIDs contains data after terminator"
                        )
                    elif candidate not in ordered:
                        ordered.append(candidate)
            return DiscoverSVIDsInquiryData(
                header, payload_vdos, tuple(ordered), terminated
            )
        if not payload_vdos:
            raise ValueError("Discover Modes ACK requires at least one Mode VDO")
        assert isinstance(
            request,
            (DiscoverModesInquiryRequest, CableDiscoverModesInquiryRequest),
        )
        return DiscoverModesInquiryData(header, request.svid, payload_vdos)

    if len(body) != 4:
        raise ValueError(f"{inquiry_type.value} body must be exactly 4 bytes")

    raw = int.from_bytes(body, "little")
    if inquiry_type == SinkInquiryType.GET_REVISION:
        return RevisionInquiryData(
            revision_major=(raw >> 28) & 0x0F,
            revision_minor=(raw >> 24) & 0x0F,
            version_major=(raw >> 20) & 0x0F,
            version_minor=(raw >> 16) & 0x0F,
        )
    if inquiry_type == SinkInquiryType.GET_SOURCE_INFO:
        return SourceInfoInquiryData(
            port_type=(raw >> 31) & 0x01,
            port_maximum_pdp_w=(raw >> 16) & 0xFF,
            port_present_pdp_w=(raw >> 8) & 0xFF,
            port_reported_pdp_w=raw & 0xFF,
        )

    voltage_raw = int.from_bytes(body[0:2], "little")
    current_raw = body[2]
    flags = body[3]
    return PPSStatusInquiryData(
        output_voltage_mv=None if voltage_raw == 0xFFFF else voltage_raw * 20,
        output_current_ma=None if current_raw == 0xFF else current_raw * 50,
        present_temperature_flag=(flags >> 1) & 0x03,
        operating_in_current_limit=bool(flags & 0x08),
        real_time_flags=flags,
    )


class DeviceSink:
    """
    Represents the sink system of the DRPD device.
    """

    def __init__(
        self,
        device_internal: DeviceInternal,
        device: Optional["Device"] = None
    ):
        """
        Initialize the DeviceSink with the given DeviceInternal.

        :param device_internal: The internal device communication
            handler.
        :type device_internal: DeviceInternal
        :param device: The parent Device instance for event
            subscription.
        :type device: Optional[Device]
        """
        self._internal = device_internal
        self._device = device
        self._current_role: Optional[Mode] = None
        self.inquiry_runner = SinkInquiryRunner(self)

        if device is not None:
            device.events.register_event_observer(
                self._on_device_event
            )

    async def _on_device_event(self, event) -> None:
        """
        Handle device events, specifically tracking RoleChanged
        events to maintain the current role.

        :param event: The device event.
        :type event: DeviceEvent
        """
        from .events import RoleChanged

        if isinstance(event, RoleChanged):
            self._current_role = event.new_role

    async def _validate_sink_mode(self) -> None:
        """
        Validate that the device is in SINK mode.

        Uses the cached role from RoleChanged events if available,
        otherwise queries the device.

        :raises RuntimeError: If the device is not in SINK mode.
        """
        # Use cached role if available
        if self._current_role is not None:
            device_mode = self._current_role
        else:
            # Fallback to querying device if role hasn't been
            # tracked yet
            mode = await self._internal.query_ascii_values_and_check(
                "BUS:CC:ROLE?", "s"
            )
            device_mode = Mode.from_string(mode[0].strip())
            self._current_role = device_mode

        if device_mode != Mode.SINK:
            raise RuntimeError(
                f"Device must be in SINK mode, but is in "
                f"{device_mode.value} mode"
            )

    async def load_config(self, config: dict) -> None:
        """
        Load the sink configuration from a dictionary.

        :param config: A dictionary representing the sink
            configuration.
        :type config: dict
        """

    async def save_config(self) -> dict:
        """
        Save the current sink configuration to a dictionary.

        :return: A dictionary representing the sink configuration.
        :rtype: dict
        """
        return {}

    async def get_pdo_count(self) -> int:
        """
        Get the number of available PDOs from the source.

        :return: The number of available PDOs.
        :rtype: int
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:PDO:COUNT?"
            )
        )
        return int(response[0])

    async def get_pdo_at_index(self, index: int) -> Optional[DeviceSinkPDO]:
        """
        Get the PDO at the specified index.

        :param index: The index of the requested PDO (0-based).
        :type index: int
        :return: The PDO at the specified index.
        :rtype: DeviceSinkPDO
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                f"SINK:PDO? {index}", "s"
            )
        )
        return DeviceSinkPDO.from_response(list(response))

    async def set_pdo(
        self, index: int, voltage_mv: int, current_ma: int
    ) -> None:
        """
        Request a Fixed Supply PDO at the specified index with a
        specific current.

        :param index: The index of the Fixed Supply PDO to request
            (0-based).
        :type index: int
        :param current_ma: The desired current in milliamps. Set to 0
            to request the maximum available current.
        :type current_ma: int
        """
        await self._validate_sink_mode()
        await self._internal.write_ascii_and_check(
            f"SINK:PDO {index} {voltage_mv} {current_ma}"
        )

    async def set_epr_enabled(self, enabled: bool) -> None:
        """
        Set whether Sink policy may enter EPR mode during future negotiation.

        :param enabled: True to allow EPR entry, False to stay SPR-only.
        :type enabled: bool
        """
        await self._validate_sink_mode()
        state = "ON" if enabled else "OFF"
        await self._internal.write_ascii_and_check(f"SINK:EPR:EN {state}")

    async def get_epr_enabled(self) -> bool:
        """
        Get whether Sink policy may enter EPR mode during negotiation.

        :return: True if EPR entry is enabled.
        :rtype: bool
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:EPR:EN?", "s"
            )
        )
        return response[0].strip().upper() == "ON"

    async def set_pps_status_query_enabled(self, enabled: bool) -> None:
        """
        Set whether Sink policy sends Get_PPS_Status after SPR PPS transitions.
        """
        await self._validate_sink_mode()
        state = "ON" if enabled else "OFF"
        await self._internal.write_ascii_and_check(
            f"SINK:PPS:STATUS:EN {state}"
        )

    async def get_pps_status_query_enabled(self) -> bool:
        """
        Query whether Sink policy sends Get_PPS_Status after PPS transitions.
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:PPS:STATUS:EN?", "s"
            )
        )
        return response[0].strip().upper() == "ON"

    async def get_request_status(self) -> SinkRequestStatus:
        """
        Query the most recent Sink PDO request outcome.
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:REQUEST:STATUS?", "s"
            )
        )
        parts = [str(part).strip() for part in response]
        if len(parts) == 1 and "," in parts[0]:
            parts = [part.strip() for part in parts[0].split(",")]
        if not parts:
            raise ValueError("Empty SINK:REQUEST:STATUS? response")

        outcome = SinkRequestOutcome.from_string(parts[0])
        if outcome == SinkRequestOutcome.NONE:
            return SinkRequestStatus(outcome, None, None, None)
        if len(parts) != 4:
            raise ValueError(
                "SINK:REQUEST:STATUS? response must contain "
                "outcome,index,voltage_mv,current_ma"
            )
        return SinkRequestStatus(
            outcome=outcome,
            index=int(parts[1]),
            voltage_mv=int(parts[2]),
            current_ma=int(parts[3]),
        )

    async def send_inquiry(
        self, inquiry: SinkInquiryType | SinkInquiryRequest
    ) -> None:
        """Start an enum-compatible or semantic Sink-to-Source inquiry."""
        if isinstance(inquiry, SinkInquiryType):
            command = f"SINK:INQ {inquiry.value}"
        elif isinstance(inquiry, GetCertificateInquiryRequest):
            command = (
                f"SINK:INQ {inquiry.type.value},{inquiry.slot},"
                f"{inquiry.offset},{inquiry.length}"
            )
        elif isinstance(inquiry, ChallengeInquiryRequest):
            command = (
                f'SINK:INQ {inquiry.type.value},{inquiry.slot},'
                f'"{inquiry.nonce.hex().upper()}"'
            )
        elif isinstance(inquiry, CableDiscoverModesInquiryRequest):
            command = (
                f'SINK:INQ {inquiry.type.value},"{inquiry.plug.value}",'
                f"{inquiry.svid}"
            )
        elif isinstance(
            inquiry,
            (
                CableStatusInquiryRequest,
                CableRevisionInquiryRequest,
                CableManufacturerInfoInquiryRequest,
                CableDiscoverIdentityInquiryRequest,
                CableDiscoverSVIDsInquiryRequest,
            ),
        ):
            command = (
                f'SINK:INQ {inquiry.type.value},"{inquiry.plug.value}"'
            )
        elif isinstance(inquiry, GetManufacturerInfoInquiryRequest):
            command = (
                f'SINK:INQ {inquiry.type.value},"{inquiry.target.value}"'
            )
            if inquiry.target == ManufacturerInfoTarget.BATTERY:
                command += f",{inquiry.battery_reference}"
        elif isinstance(inquiry, GetCountryInfoInquiryRequest):
            command = (
                f'SINK:INQ {inquiry.type.value},"{inquiry.country_code}"'
            )
        elif isinstance(
            inquiry,
            (GetBatteryCapabilitiesInquiryRequest, GetBatteryStatusInquiryRequest),
        ):
            command = (
                f"SINK:INQ {inquiry.type.value},{inquiry.battery_reference}"
            )
        elif isinstance(inquiry, DiscoverModesInquiryRequest):
            command = f"SINK:INQ {inquiry.type.value},{inquiry.svid}"
        else:
            command = f"SINK:INQ {inquiry.type.value}"
        await self._internal.write_ascii_and_check(command)

    async def get_inquiry_status(self) -> SinkInquiryStatus:
        """Query the most recent Sink-to-Source inquiry status."""
        response = await self._internal.query_ascii_values_and_check(
            "SINK:INQ:STAT?", "s"
        )
        parts = [str(part).strip() for part in response]
        if len(parts) == 1:
            parts = [part.strip() for part in parts[0].split(",")]
        if len(parts) != 6:
            raise ValueError(
                "SINK:INQuiry:STATus? response must contain 6 fields"
            )
        try:
            inquiry_type = SinkInquiryType(parts[2].upper())
        except ValueError as exc:
            raise ValueError(
                f"Unknown sink inquiry type: {parts[2]}"
            ) from exc
        request_id = int(parts[1])
        response_class = int(parts[3])
        response_type = int(parts[4])
        response_length = int(parts[5])
        if min(
            request_id, response_class, response_type, response_length
        ) < 0:
            raise ValueError(
                "Sink inquiry numeric fields must be non-negative"
            )
        return SinkInquiryStatus(
            outcome=SinkInquiryOutcome.from_string(parts[0]),
            request_id=request_id,
            type=inquiry_type,
            response_class=response_class,
            response_type=response_type,
            response_length=response_length,
        )

    async def get_inquiry_response(self) -> bytes:
        """Fetch the raw response bytes for the most recent inquiry."""
        response = await self._internal.query_binary_value_and_check(
            "SINK:INQ:RESP?"
        )
        return bytes(int(value) for value in response)

    async def run_inquiry(
        self,
        request: SinkInquiryRequest,
        *,
        poll_interval_seconds: float = 0.01,
        max_polls: int = 1000,
    ) -> SinkInquiryResult:
        """Run one semantic inquiry through this Sink's serialized runner."""
        return await self.inquiry_runner.run(
            request,
            poll_interval_seconds=poll_interval_seconds,
            max_polls=max_polls,
        )

    async def get_spr_capability_count(self) -> int:
        response = await self._internal.query_ascii_values_and_check(
            "SINK:CAP:SPR:COUNT?"
        )
        return int(response[0])

    async def get_spr_capability_pdo(self, index: int) -> int:
        response = await self._internal.query_ascii_values_and_check(
            f"SINK:CAP:SPR? {index}"
        )
        return int(str(response[0]), 0)

    async def set_spr_capability_pdo(self, index: int, raw_pdo: int) -> None:
        await self._internal.write_ascii_and_check(
            f"SINK:CAP:SPR {index} {raw_pdo}"
        )

    async def get_epr_capability_count(self) -> int:
        response = await self._internal.query_ascii_values_and_check(
            "SINK:CAP:EPR:COUNT?"
        )
        return int(response[0])

    async def get_epr_capability_pdo(self, index: int) -> int:
        response = await self._internal.query_ascii_values_and_check(
            f"SINK:CAP:EPR? {index}"
        )
        return int(str(response[0]), 0)

    async def set_epr_capability_pdo(self, index: int, raw_pdo: int) -> None:
        await self._internal.write_ascii_and_check(
            f"SINK:CAP:EPR {index} {raw_pdo}"
        )

    async def get_status(self) -> SinkState:
        """
        Get the current state of the sink state machine.

        :return: The current sink state.
        :rtype: SinkState
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS?", "s"
            )
        )
        return SinkState.from_string(response[0].strip())

    async def get_negotiated_pdo(self) -> Optional[DeviceSinkPDO]:
        """
        Get information about the negotiated PDO.

        :return: The negotiated PDO.
        :rtype: DeviceSinkPDO
        """
        await self._validate_sink_mode()

        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS:PDO?", "s"
            )
        )

        return DeviceSinkPDO.from_response(list(response))

    async def get_negotiated_voltage(self) -> int:
        """
        Get the negotiated voltage in millivolts.

        :return: The negotiated voltage in millivolts.
        :rtype: int
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS:VOLTAGE?"
            )
        )
        return int(response[0])

    async def get_negotiated_current(self) -> int:
        """
        Get the negotiated current in milliamps.

        :return: The negotiated current in milliamps.
        :rtype: int
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS:CURRENT?"
            )
        )
        return int(response[0])

    async def get_error_status(self) -> bool:
        """
        Get the error status of the sink.

        :return: True if the sink is in an error state, False
            otherwise.
        :rtype: bool
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS:ERROR?"
            )
        )
        return int(response[0]) == 1

    async def get_sink_info(self) -> SinkInfo:
        """
        Get comprehensive information about the sink system.

        :return: A SinkInfo object containing the PDO count, sink status,
                 negotiated PDO, negotiated voltage, negotiated current,
                 and error status.
        :rtype: SinkInfo
        """
        status = await self.get_status()
        negotiated_pdo = await self.get_negotiated_pdo()
        negotiated_voltage = await self.get_negotiated_voltage()
        negotiated_current = await self.get_negotiated_current()
        error_status = await self.get_error_status()

        return SinkInfo(
            status=status,
            negotiated_pdo=negotiated_pdo,
            negotiated_voltage=negotiated_voltage,
            negotiated_current=negotiated_current,
            error_status=error_status
        )
