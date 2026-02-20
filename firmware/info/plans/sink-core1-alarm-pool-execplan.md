# Move Sink Timers to a Core-1-Owned Pico Alarm Pool

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `firmware/PLANS.md`.

## Purpose / Big Picture

After this change, Sink code that already runs on Core 1 will keep using the same timer style (`add_alarm_in_us`/`cancel_alarm` pattern), but through a Sink-owned Pico SDK alarm pool that is explicitly tied to Core 1. This gives deterministic timer ownership with minimal code churn. You will be able to see this working by running Sink negotiation and confirming timer creation/cancel flows through the new Core-1 alarm-pool wrapper APIs.

## Progress

- [x] (2026-02-18 00:00Z) Audited firmware for Core 1 entry points and timer APIs.
- [x] (2026-02-18 00:00Z) Identified all current Core-1-reachable timer call sites and separated Sink vs non-Sink scope.
- [x] (2026-02-18 00:00Z) Authored initial ExecPlan with implementation and validation steps.
- [ ] Implement Sink Core-1 alarm pool owner and wrapper APIs.
- [ ] Migrate Sink timer creation/cancellation call sites to the Core-1 alarm API.
- [ ] (Optional follow-up) Move timeout policy effects out of timer callback context.
- [ ] Build and run validation commands in this plan; capture evidence in this file.

## Surprises & Discoveries

- Observation: Sink receives decoded PD messages in a Core 1 callback (`Sink::_onMessageReceived`) but executes state-machine policy in a FreeRTOS task (`Sink::_processTaskHandler`).
  Evidence: `firmware/lib/logic/sink/sink_cc_messaging.cpp` and `firmware/lib/logic/sink/sink.cpp`.

- Observation: Many Sink timers are currently created from state-handler paths that execute in the Sink processing task, not in the Core 1 callback path.
  Evidence: `add_alarm_in_us(...)` usage in `firmware/lib/logic/sink/state_handlers/*.cpp` and `firmware/lib/logic/sink/message_sender.cpp`.

- Observation: Two non-Sink modules that are expected to execute from Core 1 also use Pico timers today.
  Evidence: `firmware/lib/phy/vbus_manager.cpp` (`add_repeating_timer_us`) and `firmware/lib/phy/sync_manager.cpp` (`add_alarm_in_us`), both reachable from Core-1-driven flows.

## Decision Log

- Decision: Scope implementation changes to Sink timers only, while documenting all Core-1 timer users.
  Rationale: The request is to make Sink create its own Core-1 alarm pool; changing VBus/Sync timer semantics in the same patch increases risk and is not required to satisfy the goal.
  Date/Author: 2026-02-18 / Codex

- Decision: Start with a compatibility layer that preserves existing Sink timer callback behavior and only changes alarm-pool selection for Core-1-running paths.
  Rationale: This is the smallest, lowest-risk first step requested before any larger callback-context refactor.
  Date/Author: 2026-02-18 / Codex

## Outcomes & Retrospective

Initial planning outcome: Core-1 timer inventory is complete and a concrete migration strategy exists for Sink timers. No code changes have been applied yet in this plan revision.

Expected final outcome after implementation: all Sink timers are allocated/canceled by Core 1 through a dedicated alarm pool; timeout effects are observable in existing Sink behavior with no regressions in negotiation, EPR, or GoodCRC handling.

## Context and Orientation

This firmware uses RP2350 dual-core execution. Core 0 hosts the FreeRTOS scheduler and application tasks; Core 1 runs a bare-metal loop in `App::_startCore1()` (`firmware/lib/app/app.cpp`).

Sink is orchestrated by `firmware/lib/logic/sink/sink.hpp`. It has two execution paths:

- Core 1 ingress path: `Sink::_onMessageReceived(...)` is registered via `BMCDecoder::messageReceivedCallbackCore1(...)`.
- Core 0 policy path: `Sink::_processTaskHandler()` dequeues work and runs state handlers.

Current Core-1-related timer users discovered in firmware are:

- Sink timers (target of this plan):
  - `firmware/lib/logic/sink/message_sender.cpp` (`_resetGoodCRCTimer` / `cancel_alarm`)
  - `firmware/lib/logic/sink/state_handlers/wait_for_capabilities.cpp`
  - `firmware/lib/logic/sink/state_handlers/select_capability.cpp`
  - `firmware/lib/logic/sink/state_handlers/transition_sink.cpp`
  - `firmware/lib/logic/sink/state_handlers/ready.cpp`
  - `firmware/lib/logic/sink/state_handlers/epr_mode_entry.cpp`
  - `firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp`

- Non-Sink Core-1 timer users (explicitly out of scope for this plan implementation):
  - `firmware/lib/phy/vbus_manager.cpp` creates a repeating timer in `initCore1()`.
  - `firmware/lib/phy/sync_manager.cpp` creates one-shot alarms in `performSync()`, and that function is reached from `TriggerController` callbacks driven by decoder events.

The key problem to solve is not only API replacement; it is execution context correctness. If Sink timers are created in a Core-1 pool, timer callbacks will execute in Core-1 context, so callbacks must not directly mutate Sink policy state that is owned by the Sink processing task.

## Plan of Work

Milestone 1 introduces a Sink-internal timer service that owns one `alarm_pool_t*` and is initialized on Core 1. Add new Sink timer service files under `firmware/lib/logic/sink/` (for example `sink_alarm_service.hpp/.cpp`) and wire them in `firmware/CMakeLists.txt`. This service is a direct wrapper around `alarm_pool_add_alarm_in_us(...)` and `alarm_pool_cancel_alarm(...)` so existing timer call sites can keep their current control flow.

Milestone 2 introduces a compatibility wrapper API so existing Sink timer code can stay structurally the same while choosing a dedicated Core-1 alarm pool. Implement helpers such as `sinkAlarmAddInUs(...)` and `sinkAlarmCancel(...)` (exact names may vary) that call `alarm_pool_add_alarm_in_us(...)` and `alarm_pool_cancel_alarm(...)` on the Sink-owned pool. At this stage, avoid cross-core command queues and avoid changing timeout state-machine behavior; the goal is only to route timer allocation/cancellation through the explicit Core-1 pool for Core-1-running Sink paths.

Milestone 3 migrates all Sink timer call sites to the new abstraction. Replace direct `add_alarm_in_us` and `cancel_alarm` in `SinkMessageSender` and each Sink state handler with service API calls that name a logical timer key (for example `GoodCRC`, `WaitForCapabilities`, `TransitionSink`, `ReadySinkRequest`, `ReadyPdoRefresh`, `EprEntry`, `EprKeepaliveInterval`, `EprKeepaliveWatchdog`, `SelectCapabilityResponse`). Store returned logical handles in existing `alarm_id_t` fields only as compatibility placeholders if needed, or migrate fields to a dedicated handle type.

Milestone 4 is optional follow-up hardening: move policy work out of timer callback context into task-consumed events. This is intentionally deferred from the first implementation pass unless behavior issues appear during validation.

Milestone 5 validates end-to-end behavior and acceptance. Build firmware, exercise Sink negotiation and EPR paths, and confirm that every Sink timer creation/cancel occurs through the Core-1 alarm service path and no direct `add_alarm_in_us` remain in Sink state handlers/message sender.

## Concrete Steps

Run from repository root:

    cd /Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/monorepo

1. Reconfirm timer inventory before coding:

    rg -n "add_alarm_in_us|cancel_alarm\(|alarm_pool|add_repeating_timer" firmware/lib/logic/sink firmware/lib/phy -S
    rg -n "_startCore1|messageReceivedCallbackCore1|_onMessageReceived|_processTaskHandler" firmware/lib/app firmware/lib/logic/sink firmware/lib/phy -S

2. Add Sink alarm service implementation and wire build:

    # edit: firmware/lib/logic/sink/sink_alarm_service.hpp
    # edit: firmware/lib/logic/sink/sink_alarm_service.cpp
    # edit: firmware/lib/logic/sink/sink.hpp
    # edit: firmware/lib/logic/sink/sink.cpp
    # edit: firmware/lib/app/app.cpp (initialize alarm service from Core 1 startup path)
    # edit: firmware/CMakeLists.txt (add new source files)

3. Migrate Sink timer call sites to service API:

    # edit: firmware/lib/logic/sink/message_sender.hpp
    # edit: firmware/lib/logic/sink/message_sender.cpp
    # edit: firmware/lib/logic/sink/state_handlers/wait_for_capabilities.cpp
    # edit: firmware/lib/logic/sink/state_handlers/select_capability.cpp
    # edit: firmware/lib/logic/sink/state_handlers/transition_sink.cpp
    # edit: firmware/lib/logic/sink/state_handlers/ready.cpp
    # edit: firmware/lib/logic/sink/state_handlers/epr_mode_entry.cpp
    # edit: firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp

4. Keep current callback semantics for this first pass and only verify all migrated call sites use the Core-1 alarm-pool wrapper API.

5. Build and static validation:

    cd firmware
    cmake -S . -B build
    cmake --build build -j
    rg -n "add_alarm_in_us|cancel_alarm\(" lib/logic/sink -S

Expected static result after migration:

    - `lib/logic/sink/state_handlers/*.cpp` and `lib/logic/sink/message_sender.cpp` no longer call `add_alarm_in_us`/`cancel_alarm` directly.
    - Sink timer operations route through the new alarm service.

6. Runtime verification on hardware (if target connected):

    cd /Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/monorepo/firmware
    python3 scpi_test.py sink pdo-count
    python3 scpi_test.py sink status

Expected behavior: Sink negotiation and status paths still work; no crash/reset due to timer callback context.

## Validation and Acceptance

The change is accepted when all of the following are true:

- Firmware builds successfully:

    cmake -S firmware -B firmware/build
    cmake --build firmware/build -j

- Core-1 timer inventory remains explicit in this plan, and non-Sink Core-1 timer users are unchanged unless separately requested.

- Sink timer create/cancel calls are centralized in the new service and executed on Core 1:

    rg -n "add_alarm_in_us|cancel_alarm\(" firmware/lib/logic/sink -S

  Expected: no direct usage in Sink state handlers or message sender.

- Sink timeout-driven behaviors are preserved:
  - GoodCRC timeout and retry behavior still occurs.
  - Wait-for-capabilities timeout still performs hard reset behavior.
  - Transition_Sink, Ready refresh/request, EPR entry, and EPR keepalive watchdog/interval behaviors remain intact.

- For this first pass, timer behavior is functionally unchanged except for alarm-pool ownership. A later pass may enforce task-only policy mutation if needed.

## Idempotence and Recovery

All changes are source-level and can be reapplied safely. Alarm-pool service additions are additive and can be retried without destructive operations.

If migration is partially complete and build fails, recover incrementally:

- First restore compilation by keeping old timer fields and adding adapter wrappers that call the new service.
- Then migrate one state handler at a time and rebuild.
- If behavior regresses, temporarily gate one migrated timer path behind a compile-time switch and compare behavior before deleting fallback code.

No data migration or destructive repository operations are required.

## Artifacts and Notes

Core-1 timer inventory snapshot used for this plan:

    Sink (target scope):
      firmware/lib/logic/sink/message_sender.cpp
      firmware/lib/logic/sink/state_handlers/wait_for_capabilities.cpp
      firmware/lib/logic/sink/state_handlers/select_capability.cpp
      firmware/lib/logic/sink/state_handlers/transition_sink.cpp
      firmware/lib/logic/sink/state_handlers/ready.cpp
      firmware/lib/logic/sink/state_handlers/epr_mode_entry.cpp
      firmware/lib/logic/sink/state_handlers/epr_keepalive.cpp

    Non-Sink (out of scope for this implementation):
      firmware/lib/phy/vbus_manager.cpp
      firmware/lib/phy/sync_manager.cpp

## Interfaces and Dependencies

Add a Sink timer abstraction under `T76::DRPD::Logic` that depends on Pico SDK time/alarm APIs:

- `alarm_pool_create` and `alarm_pool_destroy` for Sink-owned pool lifecycle.
- `alarm_pool_add_alarm_in_us` for one-shot scheduling.
- `alarm_pool_cancel_alarm` for cancellation.
Define stable interfaces (names can vary but behavior must match):

- `SinkAlarmService::initCore1()`
  - Must be called from Core 1.
  - Creates Sink alarm pool.

- `SinkAlarmService::addAlarmInUs(delayUs, callback, userData, fireIfPast)`
  - Uses `alarm_pool_add_alarm_in_us(...)` against the Sink-owned pool.
  - Returns `alarm_id_t` to preserve existing call-site patterns.

- `SinkAlarmService::cancelAlarm(alarmId)`
  - Uses `alarm_pool_cancel_alarm(...)` against the Sink-owned pool.
  - Preserves existing `alarm_id_t` lifecycle semantics.

State handlers and `SinkMessageSender` should switch from direct global alarm calls to these wrappers, without changing their timer-state logic in this first pass.

## Plan Revision Note

Created on 2026-02-18 to satisfy the request for a Sink-specific Core-1 alarm-pool migration plan, while explicitly inventorying all Core-1 timer users in firmware and constraining implementation scope to Sink timers.

Updated on 2026-02-18 to simplify Milestone 2 per request: start with a compatibility mechanism that keeps existing Sink timer code structure and callback behavior, but routes timer creation/cancellation through a dedicated Core-1 alarm pool.
