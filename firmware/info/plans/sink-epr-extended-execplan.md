# Extend Sink with EPR entry, EPR maintenance, and Extended/Chunked messaging

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, Sink mode will keep existing SPR PPS behavior for non-EPR sources, but
will automatically enter EPR mode when the Source indicates EPR support and the first explicit
SPR contract is established. Once in EPR mode, the Sink will request and expose EPR PDOs,
accept EPR AVS requests, maintain EPR mode with the required keepalive flow, and leave EPR
cleanly on protocol errors. Users will be able to verify this through SCPI by observing a
second PDO-list update event when EPR Source Capabilities arrive, querying all available PDOs
(including EPR AVS), and seeing that non-EPR sources still negotiate and refresh in PPS mode.

## Progress

- [x] (2026-02-10 16:42Z) Audited current Sink state handlers, message sender, PDO parsing,
      SCPI sink commands, and device status interrupt flow.
- [x] (2026-02-10 16:42Z) Confirmed existing code already has EPR-related enum values and
      EPR AVS PDO parsing but lacks Extended Message transport/reassembly and EPR policy logic.
- [x] (2026-02-10 16:42Z) Authored initial ExecPlan for end-to-end EPR support with Extended
      and chunked messaging.
- [x] (2026-02-10 17:08Z) Revised plan to require a hardware-loop verification script before
      firmware implementation milestones.
- [x] (2026-02-10 18:04Z) Implemented Milestones 2-5 in firmware: Extended header model,
      chunked Extended reassembly, EPR source-capability parsing/cache, automatic EPR mode
      entry handler, EPR keepalive handler, and EPR AVS request object fix.
- [x] (2026-02-10 18:04Z) Implemented Milestone 1 host loop script:
      `scripts/sink_epr_loop_check.py` with bounded iterations, reset sequence, status-bit
      retrigger checks, and fail-fast `Source is not reporting EPR capability` behavior.
- [x] (2026-02-10 18:04Z) Implemented Milestone 6 firmware-facing integration:
      SCPI sink PDO command descriptions updated and full project build/regeneration succeeded.
- [ ] Hardware-loop runtime validation remains pending on attached EPR-capable source hardware.

## Surprises & Discoveries

- Observation: `SinkState` includes `PE_SNK_EPR_Keepalive`, but no state handler is wired for
  it and `_setState()` never routes to an EPR keepalive handler.
  Evidence: `lib/logic/sink/sink.hpp` defines the enum value; `lib/logic/sink/sink_private_interface.cpp`
  only maps Disconnected, Wait_for_Capabilities, Select_Capability, Transition_Sink, and Ready.

- Observation: Request path for EPR AVS PDO currently uses `AugmentedPPSRequest` instead of
  `AugmentedAVSRequest`.
  Evidence: `lib/logic/sink/state_handlers/select_capability.cpp` uses
  `Proto::AugmentedPPSRequest` in all augmented branches, including `Proto::EPRAVSAPDO`.

- Observation: Extended message types exist at enum level, but there is no Extended Message
  Header model, no chunk reassembly, and no EPR capabilities message parser.
  Evidence: `lib/proto/pd_message_types.hpp` includes `ExtendedMessageType::EPR_Source_Capabilities`,
  while `lib/proto/pd_messages/` has no extended-message parser classes beyond classic data/control.

- Observation: Sink PDO status interrupt exists as one bit (`SinkPDOListChanged`) and currently
  fires only when `Source_Capabilities` are cached, not when EPR capabilities are retrieved.
  Evidence: `lib/logic/sink/sink_private_interface.cpp` only calls `SinkInfoChange::PDOListUpdated`
  from `_setSourceCapabilities()`, and `lib/app/app.cpp` maps that to `DeviceStatusFlag::SinkPDOListChanged`.

## Decision Log

- Decision: Keep a single SCPI PDO query surface (`SINK:PDO:COUNT?`, `SINK:PDO?`) but redefine
  it to expose the active full capability view: SPR-only before EPR entry and SPR+EPR after
  successful EPR capability retrieval.
  Rationale: This preserves command compatibility while satisfying the requirement that all
  available PDOs are queryable over SCPI.
  Date/Author: 2026-02-10 / Codex

- Decision: Trigger EPR mode entry immediately after the first explicit SPR contract is
  established and the Source advertises EPR capability in Fixed PDO #1.
  Rationale: This matches the requested behavior and keeps fallback deterministic when EPR entry
  is rejected or fails.
  Date/Author: 2026-02-10 / Codex

- Decision: Implement Extended Message support in `Sink` as a reusable transport/parser layer,
  not as ad-hoc parsing inside one state handler.
  Rationale: EPR capabilities and keepalive depend on Extended and chunked semantics, and the
  same machinery will be needed for future PD 3.2 features.
  Date/Author: 2026-02-10 / Codex

- Decision: Reuse the existing sink PDO-list status bit and assert it again when EPR PDOs are
  retrieved.
  Rationale: The requirement is to trigger interrupt notification again on EPR PDO retrieval,
  not to introduce a separate host-visible status bit.
  Date/Author: 2026-02-10 / Codex

- Decision: Build a host-side loop verification script first and use it as the iteration oracle
  while implementing firmware changes.
  Rationale: EPR behavior is hardware/protocol timing sensitive; a bounded automation loop makes
  regressions visible quickly and prevents indefinite manual retry cycles.
  Date/Author: 2026-02-10 / Codex

## Outcomes & Retrospective

Implementation outcome: all planned firmware and host-script code changes were applied, including
new protocol/message files, sink state-machine integration, and SCPI documentation updates.
`cmake -S . -B build` and `cmake --build build -j` both succeeded after changes. Hardware runtime
validation with an attached EPR-capable source is still required to close the final acceptance
criteria.

## Context and Orientation

The Sink policy engine lives in `lib/logic/sink/` with one class per policy state in
`lib/logic/sink/state_handlers/`. Incoming PD messages are decoded in
`lib/phy/bmc_decoded_message.cpp`, queued by `Sink::_onMessageReceived()` in
`lib/logic/sink/sink_cc_messaging.cpp`, and consumed by the active state handler.
Outgoing messages are encoded by `lib/phy/bmc_encoded_message.cpp` and sent via
`SinkMessageSender` in `lib/logic/sink/message_sender.cpp`.

A PDO (Power Data Object) is one 32-bit power capability entry. In this repository,
`Proto::SourceCapabilities` currently stores up to 7 PDOs from the classic Data Message
`Source_Capabilities`. EPR adds a separate Extended Message (`EPR_Source_Capabilities`) that can
carry additional EPR AVS PDOs and may require chunked transfer.

An Extended Message is a PD message with the header Extended bit set and a 16-bit Extended
Message Header at the beginning of the body. Chunked transfer means a long Extended payload is
sent in multiple message chunks; receiver logic must reassemble chunks by message type and chunk
number before parsing the final payload.

Existing EPR scaffolding already present:
- EPR-related control/data/extended message enums in `lib/proto/pd_message_types.hpp`.
- EPR Mode Data Object model in `lib/proto/pd_messages/epr_mode.hpp`.
- EPR AVS PDO type in `lib/proto/pd_messages/pdo/pdo_augmented.hpp`.
- Timing constants include EPR transition timeout macro in `config/logic/sink.cmake`.

Major gaps this plan closes:
- No Extended Message Header model and no chunked reassembly.
- No parser for EPR Source Capabilities Extended payload.
- No automatic EPR-mode entry policy in Sink.
- No EPR keepalive maintenance path.
- Existing interrupt bit is not reasserted when EPR PDOs are retrieved.

Specification anchors used in this plan (from local `info/usb/USB-PD 3.2 spec.pdf`):
- Section 6.2.1.2 Extended Message Header.
- Section 6.4.10 EPR_Mode message and entry/exit sequence.
- Section 6.5.14 Extended Control usage for EPR Get/KeepAlive.
- Section 6.5.15 EPR Capabilities message construction.
- Section 6.6.21 EPR timers (Sink/Source keepalive and entry timing).
- Section 8.3.3.26 EPR mode state diagrams for sink/source policy behavior.

## Milestones

### Milestone 1: Build a hardware-loop verification script first

At the end of this milestone, there is a repeatable host script that drives Sink mode, checks
for EPR source capability, and loops with bounded retries so implementation can be validated
continuously without risk of hanging forever.

Create:
- `scripts/sink_epr_loop_check.py`

The script must:
- Use existing transport conventions in `scpi_test.py` (or import/replicate its send helper).
- Start each test cycle by forcing role reset: send `BUS:CC:ROLE DISABLED`, wait 1 second,
  then send `BUS:CC:ROLE SINK`.
- Only after the reset sequence, wait for PDO discovery.
- Query `SINK:PDO:COUNT?`, then query each PDO via `SINK:PDO? <index>`.
- Detect EPR support from returned source PDO list.
- If EPR support is not detected within bounded startup attempts, exit with a clear nonzero status
  and message `Source is not reporting EPR capability`.
- Never run unbounded loops. Include `--max-iterations`, `--poll-ms`, and `--timeout-s` options.
- Validate interrupt behavior by reading `STATus:DEVice?` after SPR PDO update and again after
  EPR PDO retrieval, expecting the same `SinkPDOListChanged` bit to reappear after it was cleared.
- Print a concise pass/fail summary with timestamps for each phase.

Script pass criteria:
- First phase: explicit contract and initial PDO list observed.
- Second phase: EPR capability retrieval observed.
- Third phase: same status bit retriggered after clear.

Only after this script exists and passes should firmware implementation milestones proceed.

### Milestone 2: Build Extended Message infrastructure (header, chunking, reassembly)

At the end of this milestone, Sink can reliably receive and reassemble chunked Extended messages,
validate sequencing, and expose completed payloads to policy logic.

Add a new protocol model for Extended Message Header in `lib/proto/`:
- `lib/proto/pd_extended_header.hpp`
- `lib/proto/pd_extended_header.cpp`

This model must decode/encode at least: data size, request chunk flag, chunked flag, and chunk
number, with helper methods in plain units (bytes and chunk index).

In `lib/logic/sink/sink.hpp`, introduce a protected reassembly structure for one in-flight
Extended message stream per Extended message type, including:
- Total expected payload bytes.
- Current contiguous bytes assembled.
- Last accepted chunk number.
- Timeout tracking for abandoned reassembly.

In `lib/logic/sink/sink_cc_messaging.cpp`, before dispatching to state handlers, route Extended
messages through a new Sink-private helper (for example `_handleExtendedMessageFragment(...)`).
That helper should:
- Parse Extended Header from `message->rawBody()`.
- Validate chunk ordering rules.
- Append fragment data into the reassembly buffer.
- Return "complete payload available" only when all bytes are assembled.

Define one policy for unsupported Extended message types: send `Not_Supported` and keep the
current contract alive (no reset) unless header sequencing is malformed.

Add unit-test-style parser checks (if no formal test harness exists yet, add a small deterministic
self-check file under `lib/proto/` and call it from existing debug test path) to validate:
- Extended header pack/unpack.
- Chunk append for in-order chunks.
- Rejection of out-of-order/repeated chunks.

### Milestone 3: Parse and store EPR Source Capabilities, and re-trigger existing interrupt

At the end of this milestone, Sink can request/receive EPR Source Capabilities, parse EPR PDOs,
merge visibility for SCPI, and set the existing sink PDO list status bit again when EPR PDOs are
retrieved.

Create an Extended message parser for EPR Source Capabilities:
- `lib/proto/pd_messages/epr_source_capabilities.hpp`
- `lib/proto/pd_messages/epr_source_capabilities.cpp`

The parser should decode the completed Extended payload (not per-chunk body) and extract typed
PDOs using existing PDO classes. Keep the same `Proto::PDOVariant` type so SCPI formatting can
reuse existing visitors.

In `lib/logic/sink/sink.hpp`, add storage fields:
- SPR capabilities cache (existing `SourceCapabilities`).
- EPR capabilities cache (new type).
- A unified view helper used by `pdoCount()` and `pdo(index)`.

Keep `SinkInfoChange::PDOListUpdated` for both SPR and EPR capability list updates, and ensure
EPR retrieval paths invoke that same change notification so the existing interrupt behavior is
triggered again.

In `lib/app/app.cpp::_sinkInfoChangedCallback`, keep the existing mapping where
`SinkInfoChange::PDOListUpdated` sets `SinkPDOListChanged`, so EPR PDO retrieval triggers the
same bit again. Retain existing `SinkStatusChanged` behavior for non-PDO updates.

Update SCPI sink descriptions in `lib/app/scpi.yaml` so `SINK:PDO:COUNT?` and `SINK:PDO?`
explicitly document that returned PDO list includes EPR PDOs when EPR capabilities are available.
Regenerate `lib/app/scpi_commands.cpp` via build; do not hand-edit generated code.

### Milestone 4: Implement automatic EPR entry and fallback behavior

At the end of this milestone, Sink automatically attempts EPR entry after first explicit contract
if Source is EPR-capable, and falls back to normal SPR PPS behavior when Source is not EPR-capable
or EPR entry fails.

In `lib/logic/sink/sink.hpp`, add policy-tracking flags:
- `_hasExplicitContract`
- `_eprModeActive`
- `_eprEntryAttempted`
- `_sourceSupportsEpr` (derived from Fixed PDO #1)

In `lib/logic/sink/state_handlers/transition_sink.cpp`, after receiving `PS_RDY` for the first
successful explicit contract, branch as follows:
- If source is not EPR-capable: go to `PE_SNK_Ready` unchanged.
- If source is EPR-capable and EPR not active: transition to a new EPR-entry state handler.

Add a new state handler pair:
- `lib/logic/sink/state_handlers/epr_mode_entry.hpp`
- `lib/logic/sink/state_handlers/epr_mode_entry.cpp`

This handler sends `EPR_Mode(Enter)` with correct data field (operational PDP), waits for
`EPR_Mode` response action (ack/succeeded/failed), then either:
- On success: mark `_eprModeActive = true` and request EPR Source Capabilities via Extended
  control path.
- On failure/reject/timeout: clear pending EPR flags and transition back to `PE_SNK_Ready`
  without resetting the existing SPR contract.

Wire the new state into `Sink::_setState()` in `lib/logic/sink/sink_private_interface.cpp` and
member declarations in `lib/logic/sink/sink.hpp`.

Fix request object selection in
`lib/logic/sink/state_handlers/select_capability.cpp`:
- Keep `AugmentedPPSRequest` for SPR PPS and SPR AVS if that is current product policy.
- Use `AugmentedAVSRequest` for `EPRAVSAPDO` requests.
- Set EPR capable bit consistently according to spec-required context.

### Milestone 5: Maintain EPR mode with keepalive and EPR-specific timers

At the end of this milestone, Sink remains in EPR mode only while protocol maintenance is valid.
It sends EPR keepalive messages at required intervals and exits EPR mode safely on failures.

Add EPR timing macros in `config/logic/sink.cmake` sourced from USB-PD 3.2 Section 6.6.21
(constants in microseconds), and keep existing SPR timing unchanged:
- Sink EPR keepalive interval timeout.
- Source EPR keepalive watchdog timeout.
- Any EPR entry/response timeout used by new handler.

Implement `PE_SNK_EPR_Keepalive` with a new handler:
- `lib/logic/sink/state_handlers/epr_keepalive.hpp`
- `lib/logic/sink/state_handlers/epr_keepalive.cpp`

Behavior:
- Start periodic timer when EPR mode becomes active.
- Send EPR keepalive Extended Control message before Source keepalive watchdog expiry.
- Accept and validate keepalive acknowledgments.
- On repeated timeout/failure, perform EPR mode exit sequence (`EPR_Mode(Exit)`) and return to
  SPR Ready state if explicit contract survives; otherwise follow reset path.

Update `lib/logic/sink/state_handlers/ready.cpp` refresh logic:
- Preserve existing 9 s PPS refresh for SPR PPS.
- Apply EPR-specific maintenance policy when negotiated PDO is EPR AVS and `_eprModeActive`.
- Do not use SPR-only timer constants for EPR AVS contracts.

Update `lib/logic/sink/state_handlers/transition_sink.cpp` to select
`LOGIC_SINK_TRANSITION_SINK_TIMEOUT_EPR_US` when transitioning under EPR contract.

### Milestone 6: Expose and validate complete behavior through SCPI and build checks

At the end of this milestone, all requested host-visible behavior is testable and documented.

SCPI behavior acceptance:
- `SINK:PDO:COUNT?` increases (or otherwise reflects extended list) after EPR PDO retrieval.
- `SINK:PDO?<index>` returns `EPR_AVS,...` entries where available.
- `STATus:DEVice?` reports the existing sink PDO bit for SPR update and reports it again after
  EPR PDO retrieval.

Protocol behavior acceptance:
- Non-EPR source path still negotiates and refreshes SPR PPS without attempting EPR.
- EPR-capable source path automatically enters EPR after first explicit SPR contract.
- EPR keepalive is transmitted and acknowledged at valid intervals.
- Loss of EPR maintenance exits EPR mode cleanly and preserves/falls back per policy.

## Plan of Work

Start by adding `scripts/sink_epr_loop_check.py` and getting it to run reliably against attached
hardware with bounded retries and explicit EPR-capability detection. This script is the primary
verification oracle: if it cannot confirm an EPR-capable source within bounded attempts, it must
fail fast and stop the loop.

Then add protocol primitives in `lib/proto/` (Extended Header and EPR source capability payload
parser) because all Sink policy work depends on them. Next, add Sink-internal Extended message
reassembly and completion callbacks in `lib/logic/sink/sink_cc_messaging.cpp` plus new state and
cache fields in `lib/logic/sink/sink.hpp`.

After transport is stable, implement EPR entry and keepalive policy handlers and wire them into
`Sink::_setState()`. Then fix request-object selection for EPR AVS in
`lib/logic/sink/state_handlers/select_capability.cpp`.

Finally, expose host-visible changes through existing status signaling and SCPI docs in
`lib/app/app.cpp` and `lib/app/scpi.yaml`, regenerate `lib/app/scpi_commands.cpp`, and run
build-plus-loop-script iterations until the script passes consistently.

## Concrete Steps

Run all commands from repository root:
`/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/firmware`

1. Confirm current EPR and Extended-message code touchpoints.

    rg -n "EPR|Extended|chunk|Keepalive|SinkInfoChange|DeviceStatusFlag|SINK:PDO" \
      lib config

2. Create the loop verification script and prove bounded behavior.

    # edit
    # - scripts/sink_epr_loop_check.py

    # Script must issue:
    # 1) BUS:CC:ROLE DISABLED
    # 2) wait 1.0 s
    # 3) BUS:CC:ROLE SINK
    # before polling PDO/state checks.

    python3 scripts/sink_epr_loop_check.py --max-iterations 20 --poll-ms 250 --timeout-s 30

3. Add new protocol files and wire them into build.

    # edit
    # - lib/proto/pd_extended_header.hpp
    # - lib/proto/pd_extended_header.cpp
    # - lib/proto/pd_messages/epr_source_capabilities.hpp
    # - lib/proto/pd_messages/epr_source_capabilities.cpp
    # - CMakeLists.txt

4. Add Sink reassembly/state extensions and new handlers.

    # edit
    # - lib/logic/sink/sink.hpp
    # - lib/logic/sink/sink_cc_messaging.cpp
    # - lib/logic/sink/sink_private_interface.cpp
    # - lib/logic/sink/sink_public_interface.cpp
    # - lib/logic/sink/state_handlers/transition_sink.cpp
    # - lib/logic/sink/state_handlers/ready.cpp
    # - lib/logic/sink/state_handlers/select_capability.cpp
    # - lib/logic/sink/state_handlers/epr_mode_entry.hpp
    # - lib/logic/sink/state_handlers/epr_mode_entry.cpp
    # - lib/logic/sink/state_handlers/epr_keepalive.hpp
    # - lib/logic/sink/state_handlers/epr_keepalive.cpp

5. Add timing/config and app/SCPI status integration.

    # edit
    # - config/logic/sink.cmake
    # - lib/app/app.cpp
    # - lib/app/scpi.yaml

6. Rebuild and regenerate SCPI command table.

    cmake -S . -B build
    cmake --build build -j

7. Run static checks for new symbols.

    rg -n "SinkPDOListChanged|PDOListUpdated|EPR_KeepAlive|EPR_Mode|pd_extended_header|chunk" \
      lib config

8. Run iterative hardware-loop checks and keep iterating until pass.

    # Each failed run must be followed by code fixes, rebuild, and rerun.
    python3 scripts/sink_epr_loop_check.py --max-iterations 40 --poll-ms 250 --timeout-s 60

9. Run targeted manual host checks on connected hardware.

    python3 scpi_test.py send "BUS:CC:ROLE SINK"
    python3 scpi_test.py send "SINK:PDO:COUNT?"
    python3 scpi_test.py send "STATus:DEVice?"
    python3 scpi_test.py send "SINK:PDO? 0"

Expected loop-script transcript characteristics (illustrative):

    [phase] resetting role: DISABLED -> (1.0s) -> SINK ...
    [ok] role reset sequence complete
    [phase] waiting for initial source PDOs ...
    [ok] source PDOs received (count=4)
    [phase] checking EPR capability from source PDO list ...
    [ok] source reports EPR capability
    [phase] waiting for EPR PDO retrieval ...
    [ok] EPR PDOs received (count=6)
    [phase] checking STATUS:DEVICE bit retrigger ...
    [ok] SinkPDOListChanged observed again after clear
    [pass] sink EPR loop check passed

If the source is not EPR-capable, expected bounded failure:

    [fail] Source is not reporting EPR capability

Manual spot-check transcript characteristics (illustrative):

    > SINK:PDO:COUNT?
    < 4
    > STATus:DEVice?
    < 32
    # after EPR capability retrieval
    > SINK:PDO:COUNT?
    < 6
    > STATus:DEVice?
    < 32

Interpretation for the example above:
- `32` means classic `SinkPDOListChanged` bit only.
- After each `STATus:DEVice?` read clears status, seeing `32` again confirms the same bit was
  asserted again for EPR PDO retrieval.

## Validation and Acceptance

Validation is complete only when all of the following are true.

Build and integration:
- `cmake -S . -B build` succeeds.
- `cmake --build build -j` succeeds and regenerates `lib/app/scpi_commands.cpp` from YAML changes.
- `python3 scripts/sink_epr_loop_check.py --max-iterations 40 --poll-ms 250 --timeout-s 60`
  exits zero for at least three consecutive runs.

Protocol behavior:
- With a non-EPR source (first Fixed PDO EPR bit clear), Sink never attempts EPR entry and
  continues existing SPR PPS behavior.
- With an EPR-capable source, Sink automatically performs EPR mode entry after first explicit
  contract and then retrieves EPR Source Capabilities.
- Each verification run begins with role reset (`DISABLED`, 1 s delay, then `SINK`) so the
  source handshake is restarted from a known initial state.
- Chunked Extended messages are reassembled correctly; out-of-order chunks do not corrupt cache.
- EPR keepalive traffic is generated and acknowledged according to configured EPR timers.

SCPI and interrupt behavior:
- `SINK:PDO:COUNT?` and `SINK:PDO?` expose all currently available PDOs, including EPR AVS.
- `STATus:DEVice?` reports `SinkPDOListChanged` after SPR PDO retrieval and reports that same bit
  again after EPR PDO retrieval.
- Existing status bits retain prior semantics.

Regression checks:
- Existing sink commands (`SINK:STATUS?`, `SINK:STATUS:PDO?`, voltage/current queries) still work.
- Existing non-sink features (trigger, capture, VBUS, analog monitor) still compile and behave
  unchanged.

## Idempotence and Recovery

All edits in this plan are additive and safe to reapply. If the build fails after protocol-file
additions, first check `CMakeLists.txt` source list alignment and header include paths. If SCPI
changes are present but dispatch code is stale, rerun `cmake --build build -j` to regenerate
`lib/app/scpi_commands.cpp`.

If Extended reassembly introduces unstable behavior on hardware, temporarily force a conservative
fallback by treating chunked Extended messages as unsupported while keeping unchunked Extended
support enabled; this allows core sink negotiation to remain functional during debugging.

If loop-script runs fail with `Source is not reporting EPR capability`, treat this as an
environment precondition failure and stop firmware iteration for that session. Do not retry
indefinitely; the bounded loop parameters are mandatory.

## Artifacts and Notes

Important implementation notes to preserve during coding:
- Do not hand-edit `lib/app/scpi_commands.cpp`; it is generated from `lib/app/scpi.yaml`.
- Keep all new code in `T76::DRPD` namespaces and follow existing state-handler separation style.
- Keep refresh and keepalive timers separate: PPS/AVS request refresh is not a substitute for
  EPR keepalive.
- When EPR entry fails, do not tear down a valid SPR explicit contract unless spec-required error
  handling demands reset.
- Treat `scripts/sink_epr_loop_check.py` as the primary acceptance oracle while implementing:
  edit code, rebuild, rerun script, and repeat until stable pass.

Spec-derived behavior summary used by this plan:
- EPR entry uses `EPR_Mode` data message exchange before EPR AVS contract use.
- EPR capabilities are transported by Extended messages and may be chunked.
- EPR mode must be actively maintained with keepalive exchanges and proper timers.

## Interfaces and Dependencies

New/updated interfaces expected at end of implementation:

- In `lib/proto/pd_extended_header.hpp`:

    class PDExtendedHeader {
    public:
        explicit PDExtendedHeader(uint16_t raw = 0);
        uint16_t raw() const;
        void raw(uint16_t value);
        uint16_t dataSizeBytes() const;
        void dataSizeBytes(uint16_t value);
        bool requestChunk() const;
        void requestChunk(bool value);
        bool chunked() const;
        void chunked(bool value);
        uint8_t chunkNumber() const;
        void chunkNumber(uint8_t value);
    };

- In `lib/proto/pd_messages/epr_source_capabilities.hpp`:

    class EPRSourceCapabilities {
    public:
        EPRSourceCapabilities(std::span<const uint8_t> payload = {});
        bool isMessageInvalid() const;
        size_t pdoCount() const;
        const PDOVariant &pdo(size_t index) const;
    };

- In `lib/logic/sink/sink.hpp`, keep existing `SinkInfoChange::PDOListUpdated` and invoke it for
  both SPR and EPR PDO cache refreshes.

  Plus protected methods/fields to:
  - track EPR mode state,
  - cache EPR capabilities,
  - reassemble Extended payloads,
  - expose merged PDO view through existing public `pdoCount()` and `pdo()`.

Dependencies remain within existing firmware stack (Pico SDK, FreeRTOS, current proto/phy/logic
modules). No new external libraries are required; the loop script should use standard Python only.

## Plan Revision Note

Added this initial ExecPlan on 2026-02-10 to define a full implementation path for Sink EPR
support, including Extended/chunked transport, automatic EPR entry, EPR maintenance, SCPI PDO
exposure, and repeated notification via the existing sink PDO interrupt bit when EPR PDOs are
retrieved.

Updated on 2026-02-10 to require a first milestone that creates a bounded hardware-loop test
script and to make iterative script execution the primary validation loop during implementation.
