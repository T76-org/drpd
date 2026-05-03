# Timestrip Container-Only UX Plan

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document follows `frontend/PLANS.md`.

## Purpose / Big Picture

The DRPD timestrip will eventually show a timeline of message-log captures and analog samples. This first milestone creates only the scrollable timeline container and zoom sizing model so later lanes can render into a stable surface. It intentionally renders no Canvas, no SVG, no ticks, no messages, and no analog traces.

## Progress

- [x] (2026-05-02) Define container-only UX with zoom range `1:1` through `1:1000`.
- [x] (2026-05-02) Add dedicated timestrip layout utility and CSS module.
- [x] (2026-05-02) Replace empty timestrip shell with viewport and inner timeline container.
- [x] (2026-05-02) Validate focused timestrip tests and production build.
- [x] (2026-05-02) Run full frontend test and lint commands; unrelated existing RackView/RackViewStyle/Menu/RackView lint failures remain outside this milestone.

## Surprises & Discoveries

- Observation: `InstrumentBase` content defaults to centered padded content with overflow hidden.
  Evidence: `frontend/src/features/rack/InstrumentBase.module.css` uses `align-items: center`, `justify-content: center`, padding, and `overflow: hidden`; the timestrip needs its own `contentClassName`.

- Observation: Full test and lint suites currently fail outside the timestrip files.
  Evidence: focused `DrpdTimeStripInstrumentView` and `timestripLayout` tests pass; `npm run build` passes; full `npm run test` fails in `RackView.test.tsx` and `RackViewStyle.test.ts`; full `npm run lint` fails in existing `RackView.tsx` and `Menu.tsx` rules.

## Decision Log

- Decision: Keep this milestone container-only and do not create Canvas or lane renderer files yet.
  Rationale: The requested UX is only horizontal sizing/scrolling; rendering comes later.
  Date/Author: 2026-05-02 / Codex

- Decision: Use `1 us = 1 CSS px` at `1:1`, with `1:1000` meaning 1000 microseconds per CSS pixel.
  Rationale: This gives a precise absolute zoom model for USB-PD timing and matches the user's selected zoom basis.
  Date/Author: 2026-05-02 / Codex

## Outcomes & Retrospective

The container-only milestone is implemented. The timestrip instrument exposes a `Zoom 1:N` header control, renders a horizontal viewport, and sizes the inner timeline container from the placeholder duration. No Canvas, SVG, ticks, message markers, analog traces, or log queries are present.

## Context and Orientation

The timestrip instrument currently lives at `frontend/src/features/rack/instruments/DrpdTimeStripInstrumentView.tsx`. It is selected by `RowRenderer` for instrument identifier `com.mta.drpd.timestrip`. `InstrumentBase` provides the standard instrument frame and header controls. For this milestone, the timestrip uses placeholder timeline bounds of `0` to `10,000,000` microseconds, which is ten seconds.

## Plan of Work

Update `DrpdTimeStripInstrumentView.tsx` so it owns zoom denominator state and renders an outer viewport with horizontal overflow plus an inner timeline container. Add `DrpdTimeStripInstrumentView.module.css` so this layout is isolated from other instruments. Add `timestrip/timestripLayout.ts` for zoom clamping and width calculation. Tests should assert that no canvas exists and that width math responds to zoom.

## Concrete Steps

From `frontend`, run:

    npm run test

During implementation the focused command was:

    npm run test -- DrpdTimeStripInstrumentView.test.tsx timestripLayout.test.ts

The production build command was:

    npm run build

## Validation and Acceptance

Acceptance is met when the Timestrip instrument renders a header zoom control, a horizontally scrollable viewport, and a timeline container whose width is `max(viewportWidth, ceil(durationUs / zoomDenominator))`. The DOM must not contain any `<canvas>` or `<svg>` for this milestone. Focused tests verify these conditions.

## Idempotence and Recovery

All changes are additive or scoped to the timestrip shell. Re-running tests is safe. If the placeholder duration later changes, only the constants in the timestrip view need updating until real log range data replaces them.

## Artifacts and Notes

No generated artifacts are required for this milestone.

## Interfaces and Dependencies

The utility module exports:

    clampTimestripZoomDenominator(value: number | string): number
    calculateTimestripWidthPx(durationUs: bigint, zoomDenominator: number, viewportWidthPx: number): number

No Canvas, SVG, D3 rendering, or log database access is introduced in this milestone.
