# USB-PD Sink Compliance Audit

Source spec: USB Power Delivery Specification Revision 3.2, Version 1.1, 2024-10.

Scope: firmware Sink policy/protocol implementation under `firmware/lib/logic/sink`, with supporting PHY/proto helpers where needed.

Use this file as fix backlog. Check each item off only after implementation and targeted verification.

## P0 - Soft Reset and Core Protocol

- [x] Fix inbound `Soft_Reset` handling so receiver sends `GoodCRC`, resets protocol layer counters/state, sends `Accept`, then enters `PE_SNK_Wait_for_Capabilities`.
  - Spec anchor: 6.3.1 GoodCRC, 6.8.1 Soft Reset, 8.3.3.4.2.2 `PE_SNK_Soft_Reset`.
  - Current issue: `Sink::_onMessageReceived()` detects `Soft_Reset`, calls `reset()`, returns before sending `GoodCRC`, and never sends `Accept`.
  - Code anchor: `firmware/lib/logic/sink/sink_cc_messaging.cpp`.
  - Verification: `cmake --build firmware/build --target drpd-firmware` passes; hardware injection still pending.

- [ ] Fix outbound protocol-error `Soft_Reset` so Sink sends `Soft_Reset`, waits for `GoodCRC`, then waits for Source `Accept`; timeout escalates to Hard Reset.
  - Spec anchor: 6.6.9, 6.8.1, 8.3.3.4.2.1 `PE_SNK_Send_Soft_Reset`.
  - Current issue: `SinkContext::performReset(SoftReset)` uses `sendMessage()` without GoodCRC tracking, resets runtime immediately, and waits for capabilities without requiring Source `Accept`.
  - Code anchor: `firmware/lib/logic/sink/sink_context.cpp`, `firmware/lib/logic/sink/message_sender.cpp`.
  - Verification: cause protocol error; expect Soft_Reset AMS, Accept wait, Hard Reset on missing GoodCRC/Accept.

- [ ] Implement real Hard Reset signaling for Sink-initiated Hard Reset paths.
  - Spec anchor: 6.8.3, 8.3.3.3.8 `PE_SNK_Hard_Reset`.
  - Current issue: several paths call `performReset(HardReset)`, but `performReset()` only performs internal state reset unless type is SoftReset; no Hard Reset ordered set is sent.
  - Code anchor: `firmware/lib/logic/sink/sink_context.cpp`, `firmware/lib/phy/bmc_encoded_message.cpp`.
  - Verification: force SinkWaitCapTimer / PSTransition timeout; expect Hard Reset signaling on CC and transition to default/re-negotiate.

- [ ] Separate protocol-layer MessageID counters for sent and received messages, and reset them at required events.
  - Spec anchor: 6.8.1 Soft Reset, 6.12.2 protocol layer states.
  - Current issue: outbound `_nextMessageId` and inbound `_lastReceivedMessageId` exist, but reset sequencing is tied to broad `runtimeState.reset()` and missing proper Soft Reset AMS states.
  - Code anchor: `firmware/lib/logic/sink/message_sender.cpp`, `firmware/lib/logic/sink/sink_runtime_state.cpp`.
  - Verification: Soft Reset sets outgoing MessageID for Soft_Reset/Accept to zero as required, then resumes monotonic IDs.

- [ ] Do not treat every same MessageID as duplicate without considering SOP/message sequence reset boundaries.
  - Spec anchor: 6.12.2.3.4 `PRL_Rx_Check_MessageID`.
  - Current issue: duplicate check only compares last 3-bit MessageID; no explicit handling for protocol reset boundaries beyond broad runtime reset.
  - Code anchor: `firmware/lib/logic/sink/sink_cc_messaging.cpp`.
  - Verification: retransmission of same message gets GoodCRC only; new AMS after reset with MessageID 0 is processed.

## P0 - Ready-State Response Matrix

- [ ] Replace `PE_SNK_Ready` catch-all `Not_Supported` with Table 6.72 behavior.
  - Spec anchor: Table 6.72 response to incoming message, 6.13 applicability tables.
  - Current issue: `ReadySinkStateHandler::handleMessage()` sends `Not_Supported` for almost anything not `Source_Capabilities` or tracked EPR messages. Supported-but-unexpected messages should cause Soft Reset; unsupported/unrecognized messages get `Not_Supported`.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: per-message unit/smoke matrix for control, data, extended types in Ready.

- [ ] Handle incoming `Not_Supported` in Ready by informing policy/DPM or recording status, not replying with another `Not_Supported`.
  - Spec anchor: 8.3.3.6.2.2 `PE_SNK_Not_Supported_Received`.
  - Current issue: Ready falls through to `sendNotSupportedMessage()`.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: Source `Not_Supported` causes no response except GoodCRC; Sink remains Ready.

- [ ] Treat unexpected supported control messages in Ready as protocol errors leading to Soft Reset.
  - Spec anchor: Table 6.72.
  - Current issue: messages such as `Accept`, `Reject`, `Wait`, `PS_RDY`, `Data_Reset_Complete` fall to `Not_Supported`.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: inject each unexpected supported message; expect GoodCRC then Soft_Reset AMS.

- [ ] Respond to deprecated/unsupported control messages in Ready with `Not_Supported`.
  - Spec anchor: 6.3.2 `GotoMin`, 6.3.5 `Ping`, Table 6.77.
  - Current issue: behavior happens by broad fallback, but should be explicit and covered by tests.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: `GotoMin` and `Ping` receive GoodCRC then Not_Supported.

## P0 - Required Sink Responses

- [ ] Implement `Get_Sink_Cap` response with `Sink_Capabilities`.
  - Spec anchor: 6.3.8, Table 6.77, 8.3.3.3.10 `PE_SNK_Give_Sink_Cap`.
  - Current issue: no firmware Sink capability sender exists; Ready falls to `Not_Supported`.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`, `firmware/lib/proto/pd_message_types.hpp`.
  - Verification: Source sends `Get_Sink_Cap`; Sink sends `Sink_Capabilities` and returns Ready.

- [ ] Implement `Get_Sink_Cap_Extended` response with `Sink_Capabilities_Extended`.
  - Spec anchor: 6.3.22, 6.5.13, Table 6.77, Table 6.79.
  - Current issue: `Get_Sink_Cap_Extended` received by Sink is normative, but no firmware Sink extended capability sender exists; Ready falls to `Not_Supported`.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`, `firmware/lib/proto/pd_message_types.hpp`.
  - Verification: Source sends `Get_Sink_Cap_Extended`; Sink sends extended `Sink_Capabilities_Extended` and returns Ready.

- [ ] Implement `Get_Revision` response with `Revision`.
  - Spec anchor: 6.3.24, 6.4.12, Table 6.77.
  - Current issue: no firmware `Revision` response path exists for Sink; Ready falls to `Not_Supported`.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`, `firmware/lib/proto/pd_message_types.hpp`.
  - Verification: Source sends `Get_Revision`; Sink returns one RMDO for PD Revision 3.2 Version 1.1 or supported local version.

- [ ] Decide and implement `Get_Status` behavior: support with `Status` if feature exists, else explicit `Not_Supported`.
  - Spec anchor: 6.3.18, 6.5.2, Table 6.77.
  - Current issue: broad fallback gives `Not_Supported`, but capability is not documented or tested.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: `Get_Status` gets correct `Status` or `Not_Supported` per configured feature flag.

- [ ] Decide and implement `Get_Country_Codes` / `Get_Country_Info` behavior.
  - Spec anchor: 6.3.21, 6.4.7, Table 6.77, Table 6.78.
  - Current issue: broad fallback is not feature-gated or tested.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: unsupported configurations return `Not_Supported`; supported configurations return specified data.

- [ ] Decide and implement `Alert`/`Battery_Status` support or explicit `Not_Supported`.
  - Spec anchor: Table 6.78.
  - Current issue: no feature gate or explicit response matrix.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: unsupported received messages return `Not_Supported`; supported paths update policy.

- [ ] Decide and implement `Data_Reset` support.
  - Spec anchor: 6.3.14, 8.3.3.5.2 UFP Data Reset, Table 6.77 note for USB4.
  - Current issue: if unsupported, Ready should explicitly `Not_Supported`; if USB4/data-reset supported, Sink must send `Accept` and complete Data Reset process.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: `Data_Reset` path matches selected product capability.

## P0 - Extended Message Response Matrix

- [ ] Add explicit Table 6.79 handling for every extended message received by a Sink.
  - Spec anchor: 6.13.3 Table 6.79.
  - Current issue: `SinkRuntimeState::trackedTypeIndex()` only tracks `EPR_Source_Capabilities` and `Extended_Control`; all other extended types return immediate `Not_Supported` or fall into generic behavior without feature gates.
  - Code anchor: `firmware/lib/logic/sink/sink_runtime_state.cpp`, `firmware/lib/logic/sink/sink.cpp`, `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: one test vector per extended message type below.

- [ ] Handle `Source_Capabilities_Extended` received by Sink as conditionally normative or `Not_Supported`.
  - Spec anchor: 6.5.1, Table 6.79 note 2.
  - Current issue: Sink cannot parse or store Source extended capabilities; unsupported path is not feature-gated.
  - Code anchor: `firmware/lib/proto/pd_message_types.hpp`, `firmware/lib/logic/sink/sink_runtime_state.cpp`.
  - Verification: if Sink can transmit `Get_Source_Cap_Extended`, Source response is accepted; otherwise `Not_Supported`.

- [ ] Handle `Status` received by Sink as conditionally normative or `Not_Supported`.
  - Spec anchor: 6.5.2, Table 6.79 note 3.
  - Current issue: no Status extended-message parser or Ready handling exists.
  - Code anchor: `firmware/lib/proto/pd_message_types.hpp`, `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: if Sink can transmit `Get_Status`, Status is processed; otherwise `Not_Supported`.

- [ ] Handle `Get_Battery_Cap` and `Get_Battery_Status` received by Sink.
  - Spec anchor: 6.5.3, 6.5.4, Table 6.79 note 1.
  - Current issue: no battery capability/status response path exists.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: battery-capable product returns `Battery_Capabilities`/`Battery_Status`; otherwise `Not_Supported`.

- [ ] Handle `Battery_Capabilities` and `Battery_Status` received by Sink.
  - Spec anchor: 6.5.5, 6.4.5, Table 6.79 note 4, Table 6.78 note 3.
  - Current issue: no parsers/feature-gated handling in Sink policy.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: process responses only when corresponding request was sent; unexpected supported responses trigger protocol-error behavior per AMS state.

- [ ] Handle `Get_Manufacturer_Info` and `Manufacturer_Info` received by Sink.
  - Spec anchor: 6.5.6, 6.5.7, Table 6.79 note 5.
  - Current issue: no manufacturer-info response or response-processing path exists.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: supported product responds to `Get_Manufacturer_Info`; unsupported product returns `Not_Supported`.

- [ ] Handle USB Security extended messages.
  - Spec anchor: 6.5.8.1, 6.5.8.2, Table 6.79 note 6.
  - Current issue: `Security_Request` and `Security_Response` are not parsed or feature-gated in firmware Sink policy.
  - Code anchor: `firmware/lib/logic/sink/sink_runtime_state.cpp`, `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: if USB Type-C Authentication is unsupported, both receive `Not_Supported`; if supported, request/response AMS works.

- [ ] Handle USB PD Firmware Update extended messages.
  - Spec anchor: 6.5.9.1, 6.5.9.2, Table 6.79 note 7.
  - Current issue: `Firmware_Update_Request` and `Firmware_Update_Response` are not parsed or feature-gated in firmware Sink policy.
  - Code anchor: `firmware/lib/logic/sink/sink_runtime_state.cpp`, `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: unsupported product returns `Not_Supported`; supported firmware-update path processes requests/responses.

- [ ] Handle `PPS_Status` received by Sink.
  - Spec anchor: 6.5.10, Table 6.79 note 9.
  - Current issue: no PPS status parser or response-processing path exists.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: if Sink sends `Get_PPS_Status`, incoming `PPS_Status` is accepted; otherwise `Not_Supported`.

- [ ] Handle `Country_Codes` and `Country_Info` extended messages.
  - Spec anchor: 6.5.11, 6.5.12, Table 6.79 note 10.
  - Current issue: no country data parser/response path exists.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: unsupported product returns `Not_Supported`; supported country-authority product responds/processes correctly.

- [ ] Implement `Sink_Capabilities_Extended` transmit and reject/process received `Sink_Capabilities_Extended` correctly.
  - Spec anchor: 6.5.13, Table 6.79.
  - Current issue: received `Sink_Capabilities_Extended` by Sink is not supported; transmitted `Sink_Capabilities_Extended` is required for `Get_Sink_Cap_Extended`.
  - Code anchor: `firmware/lib/proto/pd_message_types.hpp`, `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: receiving this message as Sink returns `Not_Supported`; sending works in response to `Get_Sink_Cap_Extended`.

- [ ] Handle `Vendor_Defined_Extended` with explicit product policy.
  - Spec anchor: 6.5.16, Table 6.79.
  - Current issue: vendor-defined extended messages are not routed to vendor policy; unsupported path is generic and untested.
  - Code anchor: `firmware/lib/logic/sink/sink_runtime_state.cpp`, `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: unsupported VDEM returns `Not_Supported`; supported vendor policy receives payload.

- [ ] Handle reserved extended message types explicitly.
  - Spec anchor: 6.5 Table 6.53, Table 6.72.
  - Current issue: reserved/unrecognized extended types fall into `UnsupportedType`; response behavior should be explicit and tested.
  - Code anchor: `firmware/lib/logic/sink/sink.cpp`, `firmware/lib/proto/pd_header.cpp`.
  - Verification: reserved extended type receives GoodCRC then `Not_Supported` in Ready, or Soft Reset if unexpected during non-interruptible AMS.

## P0 - EPR Entry

- [ ] Implement full Sink EPR entry state machine with distinct `PE_SNK_Send_EPR_Mode_Entry` and `PE_SNK_EPR_Mode_Wait_For_Response` behavior.
  - Spec anchor: 6.4.10.1, 8.3.3.26.2.
  - Current issue: one handler accepts `EnterAcknowledged`, waits in same state, then enters EPR keepalive on `EnterSucceeded`.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_mode_entry.cpp`.
  - Verification: EPR entry success follows Enter -> GoodCRC -> EnterAcknowledged -> EnterSucceeded -> wait for EPR capabilities.

- [ ] On EPR entry timeout, non-succeeded EPR_Mode, SenderResponse timeout, or SinkEPREnter timeout, initiate Soft Reset.
  - Spec anchor: 6.4.10.1 steps 3 and 8, 8.3.3.26.2.1, 8.3.3.26.2.2.
  - Current issue: timeout, `EnterFailed`, `Reject`, `Wait`, `Not_Supported`, and `Exit` return to Ready without Soft Reset.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_mode_entry.cpp`.
  - Verification: each failure stimulus produces Soft_Reset AMS.

- [ ] Start both EPR entry SenderResponseTimer and SinkEPREnterTimer at the required times.
  - Spec anchor: 8.3.3.26.2.1.
  - Current issue: one timer starts only after Sink's EPR_Mode receives GoodCRC; no full entry timer that persists through all entry states.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_mode_entry.cpp`, `firmware/config/logic/sink.cmake`.
  - Verification: missing GoodCRC and missing EnterSucceeded fail differently but both recover by Soft Reset/Hard Reset as specified.

- [ ] After `EnterSucceeded`, transition to EPR wait-for-capabilities/evaluate flow, not immediately to keepalive.
  - Spec anchor: 6.4.10.1, 6.5.15.2, 8.3.3.3.
  - Current issue: `EnterSucceeded` sets EPR active and transitions to `PE_SNK_EPR_Keepalive`, which sends `EPR_Get_Source_Cap` if cache empty.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_mode_entry.cpp`, `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: after entry, Source `EPR_Source_Capabilities` is evaluated and Sink sends `EPR_Request`.

- [ ] Do not auto-attempt EPR entry solely because Source fixed PDO has EPR bit set unless local policy says this Sink is EPR-capable and wants EPR.
  - Spec anchor: 6.4.10.1 conditions for EPR entry.
  - Current issue: first explicit contract with `_sourceSupportsEpr` triggers EPR entry automatically.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/transition_sink.cpp`.
  - Verification: SPR-only local policy stays in SPR Ready even with EPR-capable Source.

## P0 - EPR Capabilities and Requests

- [ ] Validate `EPR_Source_Capabilities` object-position rules.
  - Spec anchor: 6.5.15.1, 6.4.10.3.3, 8.3.3.3.8.
  - Current issue: parser accepts EPR PDO/APDO in positions 1..7; in EPR Mode this should cause Hard Reset.
  - Code anchor: `firmware/lib/proto/pd_messages/epr_source_capabilities.cpp`, `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: EPR AVS at position 1 triggers Hard Reset; EPR AVS at position 8 accepted.

- [ ] Validate EPR capabilities construction: first seven positions mirror SPR capability positions and unused positions are zero-filled.
  - Spec anchor: 6.5.15.1.
  - Current issue: parser compacts nonzero PDOs and loses zero-padding structure in exposed index list, making policy selection ambiguous.
  - Code anchor: `firmware/lib/proto/pd_messages/epr_source_capabilities.cpp`, `SinkContext::requestObjectPositionAtIndex`.
  - Verification: object positions remain spec positions; UI/policy index maps correctly.

- [ ] In EPR Mode, every valid `EPR_Source_Capabilities` message must be evaluated and answered with `EPR_Request`.
  - Spec anchor: 6.5.15.2.
  - Current issue: handler always requests index 0 at 5V instead of policy-selected capability and does not handle "no EPR PDO" source-exit path specially.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: Source caps change causes Sink-selected `EPR_Request` with matching PDO copy.

- [ ] Ensure EPR requests are sent only in EPR Mode and always use `EPR_Request`.
  - Spec anchor: 6.4.9, 6.4.10.2.
  - Current issue: code uses `EPR_Request` when `_eprModeActive && _eprCapabilities`; this is mostly correct but needs tests and guard against EPR capability cache being set while not in EPR.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/select_capability.cpp`.
  - Verification: EPR PDO cannot be requested with SPR `Request`; SPR-mode EPR caps are informational only.

- [ ] Clamp EPR AVS requested current to advertised power/current limits.
  - Spec anchor: 6.4.2 request data object rules, EPR AVS PDO fields.
  - Current issue: `_requestAugmentedPDO()` uses caller current directly for EPR AVS when nonzero; no upper clamp against max power at voltage.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/select_capability.cpp`.
  - Verification: out-of-range current request is clamped or rejected before transmit.

- [ ] Use local EPR Sink Operational PDP, not hard-coded 100 W.
  - Spec anchor: 6.4.10 Table 6.50.
  - Current issue: `sendEPRMode(Enter, 100)` is hard-coded.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_mode_entry.cpp`.
  - Verification: configured Sink PDP appears in EPR_Mode Enter data byte.

## P0 - EPR Exit and Error Handling

- [ ] Enforce EPR exit precondition: explicit contract must be SPR `(A)PDO` at 20 V or less before sending or accepting `EPR_Mode(Exit)`.
  - Spec anchor: 2.5.3, 6.4.10.3.1, 6.4.10.3.3.
  - Current issue: `_exitEPRMode()` sends Exit immediately; incoming Exit immediately exits regardless of current contract.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: Exit while contracted above 20 V causes Hard Reset; graceful exit first negotiates <=20 V EPR/SPR contract.

- [ ] After commanded EPR exit, wait for SPR `Source_Capabilities` and Hard Reset if missing.
  - Spec anchor: 6.4.10.3.1.
  - Current issue: code transitions directly to Ready or Wait_for_Capabilities without specific exit timer/expectation.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: Sink Exit -> Source_Capabilities within tTypeCSinkWaitCap; timeout Hard Reset.

- [ ] Treat unsolicited SPR `Source_Capabilities` in EPR Mode as Hard Reset condition unless it was requested with `Get_Source_Cap`.
  - Spec anchor: 6.4.10.2, 6.4.10.3.3, 8.3.3.3.8.
  - Current issue: handler performs internal reset and requests PDO.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: unsolicited SPR caps in EPR cause Hard Reset; requested SPR caps are informational per request path.

- [ ] Handle Source-initiated "no EPR PDOs" exit flow.
  - Spec anchor: 6.5.15.2, 6.4.10.3.1.
  - Current issue: handler treats all valid EPR_Source_Capabilities the same and requests index 0.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`, `EPRSourceCapabilities`.
  - Verification: EPR caps with no EPR PDOs leads Sink to negotiate <=20 V then process EPR_Mode Exit.

- [ ] Escalate EPR critical errors to Hard Reset, not internal reset or Ready fallback.
  - Spec anchor: 6.4.10.3.3.
  - Current issue: invalid EPR caps and several EPR anomalies call Soft Reset or Ready fallback.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`, `epr_mode_entry.cpp`.
  - Verification: invalid EPR object positions, Exit under EPR PDO, unsolicited Source_Capabilities trigger Hard Reset.

## P0 - EPR Keepalive

- [ ] Implement `PE_SNK_EPR_Keep_Alive` as specified: send `EPR_KeepAlive`, start SenderResponseTimer, return Ready on `EPR_KeepAlive_Ack`, Hard Reset on timeout.
  - Spec anchor: 6.5.14.3, 6.5.14.4, 8.3.3.3.11.
  - Current issue: periodic keepalive sends fire-and-forget and does not wait for GoodCRC or Ack.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: missing Ack after GoodCRC causes Hard Reset; valid Ack returns Ready/continues stable EPR state.

- [ ] Maintain "send EPR_KeepAlive only if no other Sink traffic for more than tSinkEPRKeepAlive".
  - Spec anchor: 6.4.10.2.
  - Current issue: code sends on a fixed interval regardless of other Sink messages.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`, `message_sender.cpp`.
  - Verification: regular EPR_Request traffic suppresses keepalive; idle EPR sends keepalive before source watchdog.

- [ ] Remove local three-strike EPR watchdog exit behavior or map it to spec Hard Reset behavior.
  - Spec anchor: 2.5.3, 6.4.10.2, 8.3.3.3.11.
  - Current issue: after three failures, code sends EPR Exit and leaves EPR. Spec says communication loss/keepalive failure results in Hard Reset.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: no EPR KeepAlive Ack or no required traffic causes Hard Reset, not EPR Exit.

- [ ] Treat incoming Source `EPR_KeepAlive` carefully.
  - Spec anchor: 6.5.14.3 says `EPR_KeepAlive` is sent by Sink; 6.5.14.4 says Ack sent by Source.
  - Current issue: Sink handler accepts incoming `EPR_KeepAlive` and sends `EPR_KeepAlive_Ack`, which appears role-reversed.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`.
  - Verification: incoming role-invalid Extended_Control gets proper protocol-error / Not_Supported behavior per message matrix.

## P1 - Extended Messages and Chunking

- [ ] Correct Extended Message `Request Chunk` validation.
  - Spec anchor: 6.2.1.2.3.
  - Current issue: `_handleExtendedMessageFragment()` treats any received `requestChunk()` as malformed and Soft Resets. If Sink ever supports responses to chunk requests, it must respond with requested chunk; if not applicable, classify correctly.
  - Code anchor: `firmware/lib/logic/sink/sink_cc_messaging.cpp`.
  - Verification: chunk request for supported outbound extended message returns chunk or expected unsupported behavior.

- [ ] For unsupported multi-chunk incoming messages, use `ChunkingNotSupportedTimer` before `Not_Supported`.
  - Spec anchor: 6.6.18.1, 8.3.3.6.2.3.
  - Current issue: unsupported extended message type returns immediate `Not_Supported`.
  - Code anchor: `firmware/lib/logic/sink/sink.cpp`, `sink_cc_messaging.cpp`.
  - Verification: first chunk of unsupported multi-chunk message starts timer, then sends `Not_Supported`.

- [ ] Enforce chunk count maximum of 10 chunks, not 16.
  - Spec anchor: 6.2.1.2.2.
  - Current issue: code permits `nextChunkNumber` through 0x0F; spec allows chunk numbers 0..9 for 10 chunks total.
  - Code anchor: `firmware/lib/logic/sink/sink_cc_messaging.cpp`.
  - Verification: chunk 10+ is treated as malformed/protocol error.

- [ ] Set Data Size to zero in generated Chunk Request messages.
  - Spec anchor: 6.2.1.2.3.
  - Current issue: `_sendExtendedChunkRequest()` sets `dataSizeBytes(payloadSizeBytes)` for request chunk; spec says Data Size field is zero when Request Chunk is one.
  - Code anchor: `firmware/lib/logic/sink/sink_public_interface.cpp`.
  - Verification: captured Chunk Request has Request Chunk=1 and Data Size=0.

- [ ] Decide whether unchunked extended messages are supported and advertise/request consistently.
  - Spec anchor: 6.2.1.2.1, Request unchunked extended support bit.
  - Current issue: Request sets `unchunkedExtendedMessageSupported(true)` for fixed PDO requests, but extended TX code often sends unchunked messages without clear product-level policy.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/select_capability.cpp`, `sink_context.cpp`.
  - Verification: partner behavior uses chunked vs unchunked consistently with RDO advertised bit.

- [ ] Validate extended message body length against `Number of Data Objects` and extended header Data Size.
  - Spec anchor: 6.2.1.2.4.
  - Current issue: handler checks minimal sizes, but does not clearly reject impossible NDO/Data Size combinations or trailing garbage beyond allowed padding.
  - Code anchor: `firmware/lib/logic/sink/sink_cc_messaging.cpp`.
  - Verification: malformed NDO/Data Size cases produce expected Soft Reset/protocol error.

## P1 - Swap, VCONN, and Role Messages

- [ ] Decide and implement `DR_Swap` behavior for this product.
  - Spec anchor: 6.3.9, Table 6.77.
  - Current issue: if unsupported, return `Not_Supported`; if supported, respond Accept/Wait/Reject and update data role. Broad Ready fallback hides decision.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: `DR_Swap` response matches configured DRD capability.

- [ ] Decide and implement `PR_Swap` behavior.
  - Spec anchor: 6.3.10, Table 6.77.
  - Current issue: Sink-only product likely `Not_Supported`; DRP must implement full swap. Broad fallback is not explicit.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: `PR_Swap` response matches configured DRP capability; EPR mode rejects/forces exit as required.

- [ ] Decide and implement `VCONN_Swap` behavior.
  - Spec anchor: 6.3.11, Table 6.77.
  - Current issue: EPR entry path can receive VCONN_Swap; current EPR entry does not handle it.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`, `epr_mode_entry.cpp`.
  - Verification: VCONN swap during EPR entry follows 8.3.3.26.2 path or rejects if unsupported.

- [ ] Decide and implement `FR_Swap` behavior.
  - Spec anchor: 6.3.19, Table 6.77.
  - Current issue: likely unsupported, but needs explicit `Not_Supported` and tests.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`.
  - Verification: incoming `FR_Swap` gets correct configured response.

## P1 - Message Sending and Timing

- [ ] Track successful transmission of response messages before returning to previous state.
  - Spec anchor: Not Supported, Give Sink Cap, Soft Reset state diagrams.
  - Current issue: many responses call `sendMessageAndAwaitGoodCRC()` but state transitions often do not wait for GoodCRC or completion.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/ready.cpp`, `sink_context.cpp`.
  - Verification: missing GoodCRC for response triggers retry then Soft/Hard Reset as appropriate.

- [ ] Apply Sink collision avoidance before Sink-initiated AMS messages.
  - Spec anchor: 6.10 Collision Avoidance, 6.6.16.
  - Current issue: Sink initiates requests/keepalives without visible Rp SinkTxOK/SinkTxNG gating.
  - Code anchor: `firmware/lib/logic/sink/sink_public_interface.cpp`, `sink_context.cpp`, CC bus role/monitor code.
  - Verification: Sink does not start AMS while Source advertises SinkTxNG.

- [ ] Implement message discarding rules for pending SOP messages.
  - Spec anchor: 6.11 Message Discarding.
  - Current issue: outbound sender has a single pending message and incoming SOP does not clearly discard pending SOP messages except by reset/error paths.
  - Code anchor: `firmware/lib/logic/sink/message_sender.cpp`, `sink_cc_messaging.cpp`.
  - Verification: incoming SOP during pending outbound AMS discards or errors according to Table 6.74.

## P2 - Policy, Capability, and Observability

- [ ] Add configurable Sink capability model for SPR and EPR.
  - Spec anchor: 6.4.1.6 Sink_Capabilities, 6.5.15.3 EPR_Sink_Capabilities.
  - Current issue: no local Sink capabilities model exists for Get_Sink_Cap / EPR_Get_Sink_Cap.
  - Code anchor: app config, SCPI sink interface, proto messages.
  - Verification: host can configure Sink PDOs; emitted capabilities match config.

- [ ] Add policy callback/result reporting for Reject/Wait/Not_Supported outcomes.
  - Spec anchor: Policy Engine state diagrams inform DPM on outcomes.
  - Current issue: code has TODO for request rejected; app cannot distinguish failed negotiation cause.
  - Code anchor: `firmware/lib/logic/sink/state_handlers/select_capability.cpp`, public Sink API.
  - Verification: app/UI receives structured event for Reject, Wait, Not_Supported, timeout.

- [ ] Add tests or capture fixtures for Sink message response matrix.
  - Spec anchor: Table 6.72, Tables 6.77-6.79.
  - Current issue: no targeted firmware tests were found for policy response matrix.
  - Code anchor: add unit tests near firmware test harness or host-side protocol simulator.
  - Verification: one test vector per message class and state.

- [ ] Add integration captures against real PD analyzer/source for SPR and EPR happy paths.
  - Spec anchor: end-to-end state diagrams.
  - Current issue: audit is static; timing and electrical GoodCRC behavior need capture validation.
  - Code anchor: docs/test scripts.
  - Verification: traces show spec-correct GoodCRC, request, response, reset, and EPR flows.

## Notes

- Existing good behavior: ordinary incoming SOP Source messages get immediate GoodCRC and duplicate MessageID retransmissions get GoodCRC without double-processing.
- Existing good behavior: EPR_Request encoding includes RDO plus copied Source PDO, matching the basic 2 Data Object structure.
- Most issues above are state-machine issues, not parser-only issues. Fixing them cleanly likely requires adding explicit substates for Soft Reset, Give Sink Cap, Get Source Cap, EPR Entry, EPR Exit, and EPR KeepAlive rather than expanding catch-all handlers.
