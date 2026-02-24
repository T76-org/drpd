# Refactor DRPD USBTMC and SQLite-WASM Logging Into a Dedicated Worker

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `frontend/PLANS.md`, and this ExecPlan must be maintained in accordance with `/frontend/PLANS.md`.

## Purpose / Big Picture

After this change, the frontend will no longer run DRPD USB communication and log persistence work on the UI thread. A dedicated web worker will own the DRPD device session, including USBTMC request/response traffic and SQLite-WASM-backed logging, while the main thread talks to it through a typed message protocol. The visible result is that UI interactions remain responsive during analog polling, capture draining, and log writes, and the DRPD feature continues to emit the same state and message events to the UI.

Success is visible in three ways: unit/integration tests prove the worker protocol preserves behavior and ordering, a manual browser smoke test shows connect/poll/capture/log/query still work, and a stress scenario (rapid polling plus logging) does not freeze the page.

This plan intentionally includes an early feasibility milestone and explicit stop criteria. If the prototype demonstrates that WebUSB device handles or required WebUSB calls are not reliable from a worker in the target runtime, or if the worker migration introduces race conditions that cannot be bounded without large behavior changes, stop after the prototype milestone, record evidence in this plan, and do not proceed to the full cutover.

## Progress

- [x] (2026-02-23 00:00Z) Reviewed `frontend/PLANS.md`, DRPD driver (`src/lib/device/drpd/device.ts`), USBTMC transport (`src/lib/transport/usbtmc.ts`), and logging store (`src/lib/device/drpd/logging/sqliteWasmStore.ts`) to prepare this ExecPlan.
- [x] (2026-02-23 00:00Z) Authored initial ExecPlan for moving DRPD USB communication and logging execution into a dedicated worker with explicit race-condition safeguards and stop criteria.
- [ ] Implement prototype milestone to validate worker-hosted DRPD session feasibility (WebUSB access, device-handle transfer/ownership, and worker-hosted logging API).
- [ ] Implement typed worker RPC and main-thread proxy with feature flag, preserving current DRPD public behavior.
- [ ] Move polling, interrupt handling, capture draining, and logging ownership into the worker and verify ordering under load.
- [ ] Run automated tests and browser smoke/stress validation, then decide whether to enable by default or stop and keep behind a flag.

## Surprises & Discoveries

- Observation: `DRPDDevice` currently runs multiple async flows concurrently (`runConnectTasks`, analog polling timer, capture drain timer, interrupt handler) and relies on local in-flight flags (`interruptInFlight`, `analogMonitorInFlight`, `captureDrainInFlight`) to avoid overlapping work.
  Evidence: `frontend/src/lib/device/drpd/device.ts` defines these flags and uses them in `interruptHandler`, `pollAnalogMonitor`, and `pollCaptureDrain`.

- Observation: USB request serialization is already enforced one layer lower in `USBTMCTransport` via a promise queue (`requestQueue` and `_withLock`), so any worker migration must preserve this single-transport sequencing invariant.
  Evidence: `frontend/src/lib/transport/usbtmc.ts` serializes `sendCommand`, `queryText`, `queryBinary`, and `checkError` through `_withLock`.

- Observation: Logging inserts currently occur inline on device polling/capture paths, which means log persistence latency can directly delay state/event emission on the main thread.
  Evidence: `frontend/src/lib/device/drpd/device.ts` calls `await this.logAnalogSample(...)` in `pollAnalogMonitor()` and `await this.logCapturedMessage(...)` while draining messages.

- Observation: `SQLiteWasmStore` is presently an in-memory stub with a SQLite-shaped interface, not a concrete SQLite-WASM runtime integration, so the worker migration must preserve the `DRPDLogStore` abstraction and not hard-wire a single storage engine too early.
  Evidence: `frontend/src/lib/device/drpd/logging/sqliteWasmStore.ts` stores rows in arrays and `init()` only marks `initialized = true`.

## Decision Log

- Decision: Use one dedicated DRPD session worker that owns both USB communication and logging, instead of separate USB and logging workers.
  Rationale: A single worker gives actor-style serialization (one event loop, one mailbox) and avoids cross-worker ordering races between capture reads and log inserts, or between `clear/query` requests and active writes.
  Date/Author: 2026-02-23 / Codex

- Decision: Keep the existing `DRPDDevice` public API shape on the main thread by introducing a proxy class rather than exposing raw worker RPC to UI code.
  Rationale: This minimizes UI churn and allows a feature-flagged rollout and fallback to the current in-thread implementation.
  Date/Author: 2026-02-23 / Codex

- Decision: Add an explicit prototype/feasibility milestone before any broad refactor and stop if runtime support is insufficient or unstable.
  Rationale: WebUSB worker support and device-handle ownership/transfer details are browser/runtime-sensitive; proving feasibility first reduces the risk of landing a partially broken architecture.
  Date/Author: 2026-02-23 / Codex

- Decision: Treat worker communication as a typed request/response + event protocol with `requestId`, `sessionId` (or generation), and serialized error payloads.
  Rationale: This prevents stale responses from a prior connect/disconnect cycle from mutating current UI state and makes race handling observable in tests.
  Date/Author: 2026-02-23 / Codex

- Decision: Preserve the existing `DRPDLogStore` abstraction and implement worker ownership around it before changing the concrete SQLite-WASM backend.
  Rationale: This isolates two risks (threading refactor vs. storage engine refactor) and keeps tests runnable with a deterministic store.
  Date/Author: 2026-02-23 / Codex

## Outcomes & Retrospective

Initial planning outcome only: this ExecPlan captures the current DRPD concurrency model, identifies the transport and logging ordering invariants that must be preserved, and defines a staged migration with hard stop conditions. No code changes are implemented yet.

The main risk remains runtime feasibility for worker-hosted WebUSB flows and the correctness of disconnect/reconnect sequencing when multiple async operations are in flight. The plan addresses that by requiring a prototype milestone and a feature-flagged rollout before default enablement.

## Context and Orientation

The DRPD driver entry point is `frontend/src/lib/device/drpd/device.ts`. It currently lives on the main thread, owns polling timers, listens for transport interrupt events, refreshes device state, drains captured USB-PD messages, and emits `EventTarget` events such as `stateupdated`, `analogmonitorchanged`, and `messagecaptured`. It also owns logging lifecycle (`startLogging`, `stopLogging`) and issues log writes inline during polling and message drain.

The DRPD driver talks to the device through a transport interface in `frontend/src/lib/device/drpd/transport.ts`. The concrete transport today is `frontend/src/lib/transport/usbtmc.ts`, which wraps WebUSB + USBTMC. This transport already serializes device requests with an internal promise queue (`requestQueue`) so SCPI commands and queries do not overlap on the physical device.

The logging subsystem entry points are in `frontend/src/lib/device/drpd/logging/`. `frontend/src/lib/device/drpd/logging/types.ts` defines `DRPDLogStore`, query types, export types, and logging configuration. `frontend/src/lib/device/drpd/logging/sqliteWasmStore.ts` currently implements a SQLite-shaped in-memory store (array-backed), which means the interface is stable but the backend is not yet a real SQLite-WASM runtime.

In this plan, a “worker” means a dedicated browser thread created with `new Worker(...)` that has its own JavaScript event loop. Work posted to that worker does not block the page’s main thread. An “RPC protocol” means a typed `postMessage` contract where the main thread sends commands and receives either responses or async events.

The critical concurrency requirement is preserving ordering across these activities:

1. USB requests to the physical device (must remain serialized).
2. Device state updates and emitted events (must not apply stale results after disconnect/reconnect).
3. Log writes/queries/clears (must not race so that callers see impossible states).

The safest design is to make the worker the single owner of all three, then expose a main-thread proxy that only mirrors worker events and forwards method calls.

## Plan of Work

Start with a feasibility spike that does not replace the current DRPD path. Add a small worker prototype under `frontend/src/lib/device/drpd/worker/` plus a debug-only harness (or test-only entry) that can answer simple RPC calls and report capability probes. The prototype must answer: whether the target runtime exposes the needed APIs in the worker context, whether a selected/authorized USB device can be used from the worker in the way this app needs, and whether worker-hosted logging calls can round-trip typed query/export results (including `bigint` timestamps and typed arrays) without lossy serialization. If any of these fail in the actual target browser/runtime, stop the refactor after documenting the evidence and fallback recommendation in this plan.

If the prototype succeeds, build a typed worker protocol with two message categories: command/response messages for methods (`connect`, `disconnect`, `refreshState`, `query...`, `clearLogs`, etc.) and async event messages mirroring DRPD events (`stateupdated`, `messagecaptured`, `stateerror`, and related events). Every command must include a monotonically increasing `requestId`, and every worker-generated event/response must include a `sessionGeneration` (incremented on each logical connect/disconnect lifecycle) so the main thread proxy can discard stale messages that arrive after reconnects.

Introduce a main-thread proxy class, for example `DRPDWorkerDeviceProxy`, that preserves the external behavior expected by UI code. It should extend `EventTarget` and expose the same public methods used by current DRPD consumers. Internally, it owns the worker instance, performs RPC calls, and re-emits worker events as `CustomEvent`s with the same event names and compatible payload shapes. Keep the existing `DRPDDevice` implementation intact and add a feature-flagged construction path so the application can select the legacy in-thread implementation or the worker-backed proxy at runtime.

Move ownership of the active DRPD session into the worker. The worker should create and own the transport, the `DRPDDevice` (or a small worker-only controller that wraps it), the polling timers, interrupt subscriptions, and the active log store instance. The main thread must not run duplicate polling timers or logging calls after cutover. This avoids split-brain behavior where both threads are trying to talk to the same device or write logs.

Preserve ordering and prevent race conditions explicitly. Inside the worker, route all external commands through a single async command queue (separate from the transport queue) so that state-affecting operations such as `disconnect`, `stopLogging`, `clearLogs`, and `configureLogging` execute in a deterministic order relative to each other. Keep USBTMC request serialization in place inside the transport. On top of that, use a session generation token to guard every async completion path (polling callbacks, interrupt handlers, drain loops, logging writes): if the generation changed because of disconnect/reconnect, drop the completion result instead of publishing it.

Add backpressure rules for event traffic. The current driver emits one event per captured message and frequent analog updates. When moved to a worker, that can overwhelm `postMessage` and create UI lag from serialization overhead even if USB work is off-thread. Preserve behavior first, but add bounded batching for high-volume notifications where possible (for example, batch message-captured notifications behind a feature flag or send a summary event plus explicit query methods). Any batching must not break existing UI assumptions; if the UI depends on per-message events, keep them and document the cost.

Keep logging store access worker-owned and serialized. All insert/query/export/clear calls must execute in the same worker that receives device events, so the ordering of “message captured” and “message inserted” remains deterministic. If the concrete SQLite-WASM backend later requires a specific worker mode or initialization flow, encapsulate that behind `DRPDLogStore` or a worker-local adapter and avoid leaking SQLite runtime objects across the worker boundary.

Handle error and shutdown semantics carefully. Worker-side thrown errors should be converted into serializable `{ name, message, stack? }` payloads for RPC responses and `stateerror` events. On disconnect or worker teardown, stop timers first, detach interrupt listeners, abort any long-running loops if possible, close logging, and only then mark the session inactive. The proxy must reject in-flight RPC promises when the worker terminates and surface a clear error rather than hanging.

Roll out in phases behind a feature flag. First land the worker protocol and proxy with a minimal command set and tests. Then migrate polling/interrupt/logging ownership. Then add query/export/clear logging calls. Only enable by default after browser smoke and stress tests pass and race-condition tests are stable.

## Milestones

### Milestone 1: Feasibility Prototype and Stop-Go Decision

Build a small worker prototype that proves the repository’s frontend runtime can support the required architecture. This milestone is intentionally narrow and may end with a stop decision.

At the end of this milestone, a developer can run the frontend, invoke a debug/test hook, and see a capability report from a worker plus a successful typed RPC round trip that includes `bigint` and typed arrays. If the prototype includes a WebUSB probe, it should report whether the required WebUSB methods are available and usable in the worker in the target browser/runtime.

If the prototype demonstrates any of the following, stop the refactor and document the evidence in this ExecPlan instead of continuing:

- Worker context cannot reliably perform the required WebUSB operations for this app in the target runtime.
- Selected/authorized device handles cannot be used from the worker in a stable way required by the DRPD session model.
- Message serialization costs or API constraints force a redesign that would materially change DRPD behavior or UI expectations.

Validation for this milestone is a manual browser run plus unit tests for the RPC message envelope and serialization of representative payloads.

### Milestone 2: Worker RPC + Main-Thread Proxy (No Default Cutover)

Implement the typed RPC protocol and a `DRPDWorkerDeviceProxy` that mirrors the public DRPD API and event interface. Keep the existing main-thread `DRPDDevice` path intact and selectable.

At the end of this milestone, the UI can instantiate the proxy behind a feature flag, call a small subset of methods (for example `getState`, `configureLogging`, `query...` stubs, `disconnect`), and receive mirrored events from the worker without changing existing UI event listeners. This milestone can use mock/fake transport and log store implementations in tests before real USB movement is complete.

Validation is primarily automated: protocol tests, proxy lifecycle tests, and stale-response rejection tests (disconnect/reconnect generation changes).

### Milestone 3: Move DRPD Session Ownership (USB, Polling, Interrupts, Logging) Into Worker

Move the live DRPD session execution into the worker, including transport ownership, interrupt subscriptions, analog polling, capture draining, and logging lifecycle. Ensure there is exactly one owner of polling timers and one active log store.

At the end of this milestone, the worker-backed path should produce the same main-thread events and query results as the current implementation while keeping USB and logging work off the UI thread. The legacy path remains available for fallback.

Validation includes integration tests with mock transport behavior that force overlapping interrupts/polls, plus a manual browser smoke test with a real device.

### Milestone 4: Stress Validation, Race Hardening, and Default-Enable Decision

Run targeted stress and disconnect/reconnect tests, measure whether event ordering remains correct, and check for UI responsiveness regressions. If stability is acceptable, enable the worker-backed path by default; otherwise keep it behind a flag and record blockers.

At the end of this milestone, there is a clear go/no-go outcome backed by test results and manual observations, and the ExecPlan documents the decision.

## Concrete Steps

Work from `frontend/` unless stated otherwise.

1. Create worker scaffolding and protocol types.

   Create a new folder such as `frontend/src/lib/device/drpd/worker/` and add:

   - `protocol.ts` for request/response/event message types.
   - `serialization.ts` for error and typed payload helpers.
   - `drpdSession.worker.ts` for the worker entrypoint.
   - `proxy.ts` for the main-thread `EventTarget` proxy.

   Keep protocol types explicit and versioned enough to evolve without silent breakage.

2. Implement prototype capability probe (Milestone 1).

   Add a minimal worker command like `probeCapabilities` that returns a structured object describing worker-visible APIs and serialization round-trip results for `bigint`, `Uint8Array`, and representative DRPD/logging payload shapes. Add a temporary debug harness or test hook that can invoke the probe from the app or from a dedicated test.

   If a WebUSB probe is added, keep it read-only and non-destructive; the goal is capability detection, not full session behavior yet.

3. Add automated tests for protocol and race guards.

   Create tests near the new worker/proxy files (for example `frontend/src/lib/device/drpd/worker/protocol.test.ts` and `frontend/src/lib/device/drpd/worker/proxy.test.ts`) that verify:

   - Request/response correlation by `requestId`.
   - Generation-based dropping of stale responses/events after reconnect.
   - Error serialization and proxy-side rejection behavior.
   - Cleanup behavior when the worker terminates with pending RPCs.

4. Implement worker-owned DRPD session controller.

   In the worker entrypoint, create a controller that owns the transport, driver instance, timers, and logging store. Wire worker commands to driver methods and worker events to proxy events. Preserve event names and payload compatibility where the UI already depends on them.

   Add a worker-side command queue for state-affecting commands (`connect`, `disconnect`, `configureLogging`, `startLogging`, `stopLogging`, `clearLogs`) and a session generation guard checked by async completion handlers.

5. Add feature-flagged construction and keep fallback path.

   Update the DRPD feature entry path (where the UI constructs the device session) to choose between the legacy `DRPDDevice` path and the worker proxy. The flag can be temporary and local to the DRPD feature until validation completes.

6. Add integration tests for concurrency scenarios.

   Extend DRPD tests (or add worker-specific integration tests) to simulate:

   - Interrupt arrives while capture drain timer is already running.
   - Rapid connect/disconnect/reconnect while polling and logging are active.
   - `clearLogs` called while inserts are ongoing.
   - `configureLogging` restart while queries are in flight.

   The expected behavior is deterministic ordering or safe dropping of stale results, never duplicated timers, and no uncaught promise rejections.

7. Run manual smoke and stress validation.

   With a real DRPD device connected, validate connect, state refresh, analog polling, capture drain, message events, logging queries, export, and clear under both legacy and worker-backed paths. Exercise rapid reconnects and a period of sustained polling/capture activity while interacting with the UI to confirm responsiveness.

8. Make the go/no-go decision.

   If tests and manual validation show stable behavior, enable the worker path by default (legacy path retained briefly for rollback if desired). If not, leave the feature flag off by default and record blockers in this ExecPlan.

## Validation and Acceptance

Acceptance is satisfied only if all of the following are true:

1. The worker-backed DRPD path preserves the observable event contract used by the UI (`stateupdated`, `analogmonitorchanged`, `messagecaptured`, `stateerror`, and related DRPD events), with payloads compatible enough that existing UI code does not need semantic changes.

2. USB device communication remains serialized (no overlapping SCPI request corruption), and disconnect/reconnect does not apply stale async results from a previous session generation.

3. Logging inserts, queries, exports, and clears run in the worker without main-thread stalls and without race-visible anomalies (for example, `clearLogs` reporting success while stale inserts reappear from the same cleared generation).

4. The page remains responsive during sustained polling/capture/logging activity in a manual browser smoke test.

5. Automated tests cover RPC correlation, stale message dropping, worker teardown behavior, and at least one integration scenario with overlapping async triggers.

The implementation must stop (do not continue cutover) if the prototype or validation reveals unstable WebUSB worker behavior in the target runtime, or if correctness depends on unsupported assumptions about worker/device ownership. In that case, record findings and keep the legacy path as the only supported mode.

Suggested validation commands from `frontend/`:

- `npm run test`
- `npm run test -- src/lib/device/drpd/__tests__/loggingIntegration.test.ts`
- `npm run test -- src/lib/device/drpd/__tests__/deviceState.test.ts`

Add worker-specific test commands once files exist and record expected pass output in this section as implementation progresses.

## Idempotence and Recovery

This migration should be implemented additively and behind a feature flag, so the legacy main-thread DRPD path remains available throughout development. That makes retries safe: if a worker milestone fails, disable the flag and continue using the current implementation while iterating.

Do not remove the legacy path until the worker-backed path passes the race-condition and smoke validations. If a milestone uncovers instability, stop at the current checkpoint, update `Progress`, `Surprises & Discoveries`, and `Decision Log`, and document the fallback decision in `Outcomes & Retrospective`.

Worker teardown and proxy cleanup must be idempotent. Calling disconnect/teardown multiple times should not leave hanging timers, duplicate listeners, or unresolved RPC promises.

## Artifacts and Notes

Current concurrency invariants that must be preserved during migration:

    DRPDDevice (`frontend/src/lib/device/drpd/device.ts`)
      - `interruptInFlight` prevents overlapping interrupt handlers.
      - `analogMonitorInFlight` prevents overlapping analog poll requests.
      - `captureDrainInFlight` prevents overlapping capture drain polls.

    USBTMCTransport (`frontend/src/lib/transport/usbtmc.ts`)
      - `_withLock()` serializes transport operations via `requestQueue`.

Migration hazard summary:

    If the worker and main thread both retain paths that can touch the same transport/device,
    the app can create split ownership and race the physical instrument. This plan avoids that by
    making the worker the single owner in the worker-backed mode.

Representative protocol shapes to implement (names can vary, but semantics must match):

    type WorkerRequest =
      | { kind: 'rpc'; requestId: number; sessionGeneration: number; method: 'connect'; params: ... }
      | { kind: 'rpc'; requestId: number; sessionGeneration: number; method: 'queryCapturedMessages'; params: ... }

    type WorkerResponse =
      | { kind: 'rpc-result'; requestId: number; sessionGeneration: number; result: ... }
      | { kind: 'rpc-error'; requestId: number; sessionGeneration: number; error: { name: string; message: string; stack?: string } }

    type WorkerEvent =
      | { kind: 'event'; sessionGeneration: number; eventName: 'stateupdated'; detail: ... }
      | { kind: 'event'; sessionGeneration: number; eventName: 'messagecaptured'; detail: ... }

## Interfaces and Dependencies

No new third-party dependency is required for the worker refactor itself. Reuse existing dependencies, including `@sqlite.org/sqlite-wasm` already present in `frontend/package.json`, but keep the worker code dependent on the repository-level `DRPDLogStore` abstraction so the concrete SQLite runtime can evolve independently.

Define a worker protocol module in `frontend/src/lib/device/drpd/worker/protocol.ts` with explicit exported TypeScript types for:

- RPC request/response envelopes (`requestId`, `sessionGeneration`, `method`, `params`, `result`, serialized error).
- Async event envelopes (`eventName`, `detail`, `sessionGeneration`).
- Capability probe result shape used by Milestone 1.

Define a serialization helper module in `frontend/src/lib/device/drpd/worker/serialization.ts` with functions like:

- `serializeError(error: unknown): { name: string; message: string; stack?: string }`
- `isSerializableDRPDEventDetail(value: unknown): boolean` (or equivalent assertions/tests)

Define a main-thread proxy in `frontend/src/lib/device/drpd/worker/proxy.ts` that:

- Extends `EventTarget`.
- Preserves the DRPD event names used by the UI.
- Exposes async methods mirroring the DRPD operations actually used by the frontend.
- Tracks pending RPC promises by `requestId`.
- Drops stale worker events/responses using `sessionGeneration`.

Define a worker entrypoint in `frontend/src/lib/device/drpd/worker/drpdSession.worker.ts` that:

- Owns the DRPD session state for the worker-backed mode.
- Serializes state-affecting commands through a worker-local command queue.
- Forwards DRPD driver events to the main thread as protocol events.
- Performs idempotent teardown on disconnect/terminate.

Change note (2026-02-23): Initial ExecPlan created to de-risk and stage a worker migration for DRPD USBTMC communication and SQLite-WASM logging, with explicit stop criteria to avoid shipping instability.
