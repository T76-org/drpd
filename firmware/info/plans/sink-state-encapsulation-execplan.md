# Encapsulate Sink Runtime State in a Dedicated Class

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `firmware/PLANS.md`.

## Purpose / Big Picture

After this change, the Sink policy engine will keep all mutable runtime data in a dedicated
state class instead of spreading it across `Sink` internals. A contributor will be able to read,
reset, and evolve Sink state through one explicit object with clear getters/setters, reducing
coupling with state handlers and making later work (including removing `friend`-based access)
straightforward. The behavior remains the same: Sink negotiation, EPR flow, and SCPI-visible
status continue to work, but the internal ownership of data becomes explicit and testable.

## Progress

- [x] (2026-02-13 02:06Z) Audited current Sink structure in `firmware/lib/logic/sink/` and identified all mutable state fields currently owned by `Sink`.
- [x] (2026-02-13 02:06Z) Confirmed state handlers currently mutate `Sink` internals directly through `friend class` access (for example pending/negotiated PDO fields and EPR flags).
- [x] (2026-02-13 02:06Z) Authored initial ExecPlan for introducing a dedicated Sink state class and migrating call sites.
- [x] (2026-02-13 03:58Z) Implemented `SinkRuntimeState` class and moved Sink mutable runtime fields into `firmware/lib/logic/sink/sink_runtime_state.hpp` and `firmware/lib/logic/sink/sink_runtime_state.cpp`.
- [x] (2026-02-13 03:58Z) Rewired `Sink` internals and state handlers to use `_runtimeState` as the single owner for cached capabilities, negotiated/request state, EPR flags, deduplication state, and extended reassembly buffers.
- [x] (2026-02-13 03:58Z) Updated firmware build wiring (`firmware/CMakeLists.txt`) and validated with `cmake -S firmware -B firmware/build` plus `cmake --build firmware/build -j`.
- [x] (2026-02-13 13:48Z) Introduced a `SinkContext` interface and changed all sink handler lifecycle methods (`handleMessage`, `handleMessageSenderStateChange`, `enter`, `reset`) to receive context explicitly.
- [x] (2026-02-13 13:48Z) Updated `Sink` to implement `SinkContext` and converted handler dispatch call sites to pass context (`*this`), including timer-driven handler behavior via bound context pointers.
- [x] (2026-02-13 13:48Z) Rebuilt firmware after context refactor; `cmake --build firmware/build -j` completed successfully.
- [x] (2026-02-13 13:57Z) Extracted `SinkContext` into a standalone concrete class (`sink_context.hpp/.cpp`) owned by `Sink` as `_context`, with callback-backed operations and public methods used by handlers.
- [x] (2026-02-13 13:57Z) Removed direct handler friendship dependency from `Sink` by deleting `friend class ...` declarations and routing all handler interactions through `_context`.
- [x] (2026-02-13 13:57Z) Added shared sink enums to `sink_types.hpp` and updated build wiring for new sink context/type files.
- [x] (2026-02-13 14:11Z) Refactored `SinkContext` to own Sink policy functionality directly (state transitions, reset path, capability/negotiation updates, request path, and message sending) and removed callback-lambda plumbing from `Sink` constructor.
- [x] (2026-02-13 14:11Z) Deleted obsolete Sink private interface layer (`sink_private_interface.cpp`) and corresponding declarations that moved into `SinkContext`.

## Surprises & Discoveries

- Observation: Most policy transitions and timers are already isolated in state-handler classes, but data ownership is centralized in `Sink` and directly mutated from handlers.
  Evidence: `firmware/lib/logic/sink/state_handlers/*.cpp` accesses internal members such as `_pendingRequestedPDO`, `_negotiatedPDO`, `_eprModeActive`, and `_hasExplicitContract` via `_sink._...`.

- Observation: `Sink` currently mixes three concerns in one class: message transport/task plumbing, state machine transitions, and runtime data storage.
  Evidence: `firmware/lib/logic/sink/sink.hpp` contains FreeRTOS task/queue fields, state handler objects, and all PDO/EPR/reassembly caches in one type.

- Observation: Repository TODO already calls out removing `friend`-class driven state-machine coupling.
  Evidence: `firmware/TODO.md` includes `Implement the state machine without using friend classes` under Sink support.

## Decision Log

- Decision: Introduce a dedicated `SinkRuntimeState` class under `firmware/lib/logic/sink/` and make `Sink` own one instance.
  Rationale: This is the smallest refactor that encapsulates state without changing public API semantics.
  Date/Author: 2026-02-13 / Codex

- Decision: Keep state handler classes in place and migrate them incrementally to use `Sink` forwarding methods (or a narrow state accessor) backed by `SinkRuntimeState`.
  Rationale: Avoids risky, large-scale state-machine rewrites while still moving storage ownership immediately.
  Date/Author: 2026-02-13 / Codex

- Decision: Preserve existing SCPI and Sink public method signatures (`pdoCount`, `pdo`, `requestPDO`, `negotiatedVoltage`, etc.) while changing only internal implementation.
  Rationale: Encapsulation refactor should not introduce host-facing behavior changes.
  Date/Author: 2026-02-13 / Codex

- Decision: Keep the initial `SinkRuntimeState` data members directly accessible to `Sink` and current friend state handlers for this step, while consolidating ownership first.
  Rationale: This keeps the refactor low-risk and behavior-preserving; stricter accessor-only encapsulation can now be done as a follow-up without moving storage again.
  Date/Author: 2026-02-13 / Codex

- Decision: Introduce `SinkContext` as an interface implemented by `Sink`, and pass it into all handler lifecycle callbacks.
  Rationale: This removes the need for handlers to own a direct `Sink&`, enables explicit dependency boundaries, and is the practical bridge toward removing friend-based access.
  Date/Author: 2026-02-13 / Codex

- Decision: Promote `SinkContext` from interface-on-`Sink` to a concrete standalone class owned by `Sink`.
  Rationale: This provides a real, explicit collaboration object for handlers and removes the need for handler friendship with `Sink` while preserving existing behavior through callback-backed context methods.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

Implementation outcome: Sink runtime data now lives in `SinkRuntimeState`, owned by `Sink` via
`_runtimeState`. The existing state machine behavior compiles and links with the same public Sink
interface. Firmware configure/build succeeded after changes.

Remaining gap versus ideal end-state: handler friendship has been removed and handlers now rely on
`SinkContext`, but handlers can still access `runtimeState()` members directly in some paths. A
future pass can narrow this to accessor-only context methods where desirable.

## Context and Orientation

Sink logic lives in `firmware/lib/logic/sink/`. The `Sink` class in
`firmware/lib/logic/sink/sink.hpp` orchestrates USB-PD policy states and message transport.
State-specific behavior is implemented in `firmware/lib/logic/sink/state_handlers/` where each
handler currently receives `Sink&` and mutates internal fields directly.

In this repository, “Sink state” means mutable runtime data that represents protocol/session
status, not the current handler object itself. This includes:

- Current policy state enum and current handler pointer.
- Capability caches (`SourceCapabilities`, `EPRSourceCapabilities`).
- Negotiation/pending request data (requested PDO, negotiated PDO, voltage/current values).
- EPR/session flags (`_hasExplicitContract`, `_eprModeActive`, `_eprEntryAttempted`, `_sourceSupportsEpr`).
- Message deduplication fields (`_hasLastReceivedMessageId`, `_lastReceivedMessageId`).
- Extended-message reassembly arrays and completed payload caches.

Transport/service objects such as `_messageSender`, FreeRTOS task/queue handles, decoder/encoder,
and controller references remain owned by `Sink` because they are runtime services, not policy state.

## Plan of Work

### Milestone 1: Add dedicated Sink state class

Create:

- `firmware/lib/logic/sink/sink_runtime_state.hpp`
- `firmware/lib/logic/sink/sink_runtime_state.cpp`

Define `SinkRuntimeState` as the single owner of mutable Sink runtime data currently stored in
`Sink`. Keep naming close to existing field semantics to reduce migration risk. Include methods for:

- Resetting all runtime fields (`reset()`), including EPR/capability and extended reassembly data.
- Read/write accessors for pending/negotiated PDO and electrical values.
- Read/write accessors for capability caches and state flags.
- Read/write accessors for message-ID deduplication and extended payload buffers.

State defaults in this class must exactly match current `Sink::reset()` behavior.

### Milestone 2: Make `Sink` use `SinkRuntimeState`

Edit:

- `firmware/lib/logic/sink/sink.hpp`
- `firmware/lib/logic/sink/sink_public_interface.cpp`
- `firmware/lib/logic/sink/sink_private_interface.cpp`
- `firmware/lib/logic/sink/sink_cc_messaging.cpp`

Remove direct runtime-state member fields from `Sink` and replace with one member,
for example `_runtimeState`. Update all internal helper methods (`_totalPDOCount`, `_pdoAtIndex`,
`_requestObjectPositionAtIndex`, `_setSourceCapabilities`, `_setNegotiatedValues`, and reset flow)
to operate on `_runtimeState`.

Keep external behavior unchanged:

- State transitions still call `_sinkInfoChangedCallback` for the same conditions.
- `reset(SinkResetType)` still sends Soft_Reset when requested and then clears runtime data.
- Extended-message chunk handling still supports EPR Source Capabilities and Extended Control.

### Milestone 3: Migrate state handlers off direct field mutation

Edit all handlers in `firmware/lib/logic/sink/state_handlers/` that currently use `_sink._...`
state fields, especially:

- `ready.cpp`
- `select_capability.cpp`
- `transition_sink.cpp`
- `wait_for_capabilities.cpp`
- `epr_mode_entry.cpp`
- `epr_keepalive.cpp`

Replace direct member access with stable `Sink` methods that proxy into `SinkRuntimeState`.
Start with high-traffic fields:

- Pending/negotiated PDO data.
- EPR flags and capability caches.
- Message reassembly payload retrieval.

If practical within this milestone, reduce `friend class` declarations in `sink.hpp` for handlers
that no longer need privileged access. If any friend remains temporarily, document why in this plan.

### Milestone 4: Validate behavior and lock acceptance

Confirm that the refactor is behavior-preserving by running full firmware configure/build and at
least one Sink-flow exercise command path.

Expected acceptance:

- Project builds successfully.
- SCPI Sink queries still return valid values when Sink mode is active.
- No regressions in EPR entry/keepalive flow caused by state migration.

## Concrete Steps

Run from repository root (`/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/monorepo`).

1. Create and wire new state class:

    cd firmware
    rg -n "_pendingRequestedPDO|_negotiatedPDO|_eprModeActive|_sourceCapabilities" lib/logic/sink -S

2. Update Sink and state handlers to use encapsulated state APIs:

    cd firmware
    rg -n "_sink\._" lib/logic/sink/state_handlers -S

3. Build to verify compile correctness:

    cd firmware
    cmake -S . -B build
    cmake --build build -j

Expected build transcript excerpt:

    -- Configuring done
    -- Generating done
    [100%] Built target drpd-firmware

4. Spot-check Sink SCPI path on connected target (if hardware is available):

    cd firmware
    python3 scpi_test.py sink pdo-count

Expected behavior: command returns a non-error response in Sink mode and does not crash/reset
unexpectedly due to missing state fields.

## Validation and Acceptance

The change is accepted when all of the following are true:

- `cmake -S . -B build` and `cmake --build build -j` succeed after the refactor.
- Search for direct handler mutations against `Sink` internals is eliminated or intentionally
  minimized and documented:

    cd firmware
    rg -n "_sink\._" lib/logic/sink/state_handlers -S

- Existing Sink public methods still behave the same from host perspective:
  `SINK:PDO:COUNT?`, `SINK:PDO?`, negotiated voltage/current queries, and Sink reset path.
- EPR-related flow remains operational (entry/keepalive transitions still reachable under source support).

## Idempotence and Recovery

This refactor is idempotent: rerunning the file edits and build commands is safe.

If the migration breaks compilation, recover in small steps:

- First restore compile by routing all moved fields through temporary `Sink` forwarding methods.
- Then tighten encapsulation by removing now-redundant forwarding or friend usage.
- Use `rg -n "_sink\._"` to identify remaining direct accesses and convert incrementally.

No destructive data migration is involved.

## Artifacts and Notes

Key files expected to change:

- `firmware/lib/logic/sink/sink.hpp`
- `firmware/lib/logic/sink/sink_public_interface.cpp`
- `firmware/lib/logic/sink/sink_private_interface.cpp`
- `firmware/lib/logic/sink/sink_cc_messaging.cpp`
- `firmware/lib/logic/sink/state_handlers/*.cpp`
- `firmware/lib/logic/sink/sink_runtime_state.hpp` (new)
- `firmware/lib/logic/sink/sink_runtime_state.cpp` (new)

Document concrete evidence snippets here while implementing (build output and key diffs).

## Interfaces and Dependencies

Define the new encapsulation interface in `firmware/lib/logic/sink/sink_runtime_state.hpp` as a
plain C++ class under `T76::DRPD::Logic` using current protocol types:

- `std::optional<Proto::SourceCapabilities>`
- `std::optional<Proto::EPRSourceCapabilities>`
- `std::optional<Proto::PDOVariant>`
- `Sink::ExtendedReassemblyState` or an equivalent moved type definition

`Sink` remains the owner of platform dependencies (FreeRTOS handles, `BMCDecoder`, `BMCEncoder`,
`CCBusController`, `SinkMessageSender`) and delegates runtime data storage to `SinkRuntimeState`.

Revision note (2026-02-13): Updated after implementation to record completed state extraction into
`SinkRuntimeState`, handler migration to explicit `SinkContext`-based callbacks, and successful
firmware build validation.

Revision note (2026-02-13): Updated again after extracting `SinkContext` into its own class,
removing handler `friend` declarations from `Sink`, and validating with a full firmware rebuild.
