# Consolidate UI Style Tokens and Normalize Layout Spacing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repo root, and this ExecPlan must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

The goal is to make the UI styling predictable and maintainable by moving repeated values (colors, spacing, font sizes, radii, shadows, control dimensions, and motion timing) into shared CSS custom properties, then updating module styles to consume those tokens. After this change, a user can run the app and observe that headers, menus, controls, instrument chrome, and text scales feel consistent across the rack UI, while themes still work and visual behavior remains unchanged.

## Progress

- [x] (2026-02-11 00:00Z) Audited existing CSS files and identified repeated hard-coded values for color, spacing, typography, and controls.
- [x] (2026-02-11 19:50Z) Defined reusable global tokens in `src/index.css` for semantic colors, spacing, typography, control sizing, radii, borders, and shadows.
- [x] (2026-02-11 19:56Z) Refactored rack CSS modules to consume shared tokens and deduplicated repeated control/menu and typography values.
- [x] (2026-02-11 19:58Z) Refactored `src/features/drpd/DrpdTestPage.module.css` to use the global token scale.
- [x] (2026-02-11 19:59Z) Replaced stale Vite starter content in `src/App.css` with a documented inert stub.
- [x] (2026-02-11 20:00Z) Ran `npm run test` and confirmed all tests pass (`17 files`, `111 tests`).
- [x] (2026-02-11 20:01Z) Updated this ExecPlan with implementation discoveries, final decisions, and outcomes.

## Surprises & Discoveries

- Observation: `src/App.css` contains Vite starter styles that are not imported by the active app and therefore currently do not affect rendering.
  Evidence: `src/App.tsx` imports only `RackView`; `src/main.tsx` imports `src/index.css`, and search found no `App.css` import.

- Observation: The existing rack styles already used some semantic variables (`--panel-*`, `--text-*`), so introducing new `--color-*` tokens worked best when backward-compatible aliases were retained.
  Evidence: `src/index.css` now maps legacy token names to semantic `--color-*` variables, allowing incremental migration without functional changes.

## Decision Log

- Decision: Keep the current visual direction (dark/light theme palettes and rack framing) while introducing semantic tokens and a spacing/type scale.
  Rationale: The request is consistency and deduplication, not a visual redesign, so tokenization should preserve behavior while improving maintainability.
  Date/Author: 2026-02-11 / Codex

- Decision: Use global design tokens in `src/index.css` and consume them from CSS Modules rather than creating per-module token files.
  Rationale: Theme state is already applied at `:root[data-theme=...]`; keeping tokens at root makes theme overrides and future expansion straightforward.
  Date/Author: 2026-02-11 / Codex

- Decision: Keep token-backed `color-mix(...)` usage in the DRPD test page for panel depth instead of flattening every surface to a single color token.
  Rationale: This preserves the existing visual depth while still removing hard-coded palette values and keeping appearance configurable through root tokens.
  Date/Author: 2026-02-11 / Codex

## Outcomes & Retrospective

Implemented a global style token system and migrated all active rack-facing CSS modules to use shared values for colors, spacing, typography, controls, radii, and shadows. This reduced literal duplication across headers, menus, buttons, separators, and instrument content while keeping current layout behavior and theme toggling intact. The DRPD test page now follows the same token scale, and stale `App.css` starter styles were neutralized to avoid future confusion. Automated validation passed with no behavioral regressions (`npm run test`: `111` passing tests).

## Context and Orientation

This project is a Vite + React + TypeScript app. Global CSS lives in `src/index.css`, and scoped component styles use CSS Modules in `src/features/**`. The active screen is the rack view rendered by `src/App.tsx` -> `src/features/rack/RackView.tsx`. The main style inconsistency source is duplicated literals across:

- `src/index.css` (theme colors and base globals)
- `src/features/rack/RackView.module.css` (header, menus, actions)
- `src/features/rack/RackRenderer.module.css` (rack canvas and overlay)
- `src/features/rack/RowRenderer.module.css` (row chrome and insertion behavior)
- `src/features/rack/InstrumentBase.module.css` (instrument shell and edit state)
- `src/features/rack/instruments/DrpdDeviceStatusInstrumentView.module.css` (dense instrumentation layout)
- `src/features/drpd/DrpdTestPage.module.css` (legacy test page style surface)

In this plan, “token” means a CSS custom property that represents a reusable design value such as spacing (`--space-3`), type size (`--font-size-sm`), color role (`--color-text-muted`), control height (`--control-height-sm`), or border/radius/shadow values.

## Plan of Work

First, expand `src/index.css` token coverage so it contains a semantic color system and a compact scale for spacing, typography, sizing, radii, and transitions that can be used across modules. Preserve existing theme behavior by mapping current dark/light colors into semantic variables, then update module CSS to reference the new semantic names instead of repeating literals.

Next, refactor rack module styles (`RackView`, `RackRenderer`, `RowRenderer`, `InstrumentBase`, and `DrpdDeviceStatusInstrumentView`) to consume the shared tokens. This includes consolidating repeated button/menu styles into shared value groups (padding, font size, letter spacing, border) and replacing hard-coded status/accent colors with tokenized variants. Keep layout geometry unchanged unless the current value is clearly inconsistent (for example, near-identical paddings or text sizes that should match by role).

Then, refactor `DrpdTestPage.module.css` to use the same typography and spacing scale so it visually aligns with the rest of the app if used. Finally, remove stale Vite starter styles from `src/App.css` (or reduce to harmless baseline) to avoid future confusion.

Throughout implementation, keep behavior stable: no component API changes, no changes to data flow, and no theme toggle logic changes. Only styling and style-token references should change.

## Concrete Steps

Work in `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`.

1. Update `src/index.css`:
   Define or rename tokens for:
   - Semantic colors (text primary/muted, surfaces, borders, overlays, interactive accents, status colors).
   - Spacing scale (for example 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32).
   - Typography scale (caption/meta/body/title/display).
   - Control sizing (small button paddings and icon button size).
   - Border widths, radii, shadows, and transition timing.
   Keep dark theme defaults in `:root`, with light theme overrides in `:root[data-theme='light']`.

2. Update rack module CSS:
   - `src/features/rack/RackView.module.css`
   - `src/features/rack/RackRenderer.module.css`
   - `src/features/rack/RowRenderer.module.css`
   - `src/features/rack/InstrumentBase.module.css`
   - `src/features/rack/instruments/DrpdDeviceStatusInstrumentView.module.css`
   Replace repeated literal values with the token scale and align similar UI roles to shared values (menu items, header actions, meta text, separators, badges, and status colors).

3. Update `src/features/drpd/DrpdTestPage.module.css`:
   Replace hard-coded palette, spacing, and typography values with shared tokens where appropriate while preserving its layout behavior.

4. Update `src/App.css`:
   Remove starter/demo styles that are no longer used by the active app path, or reduce to a minimal documented stub to prevent confusion.

5. Run validation:
   - `npm run test`
   Confirm all tests pass and the UI still renders without regressions.

6. Update this ExecPlan after implementation:
   Fill `Surprises & Discoveries`, append final `Decision Log` entries, and complete `Outcomes & Retrospective` with what changed and why.

## Validation and Acceptance

Run from `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`:

- `npm run test`

Manual verification via `npm run dev`:

- Open the app and confirm the rack header, action buttons, device/instrument menus, row separators, and instrument frames use consistent spacing/typography.
- Toggle theme via the header control and confirm dark/light token overrides still apply correctly.
- Enter edit mode and confirm edit styling (highlight, glow, action controls) remains clear and consistent.
- Open the device menu and confirm status colors and action buttons remain legible and aligned.

Acceptance is satisfied when style literals are substantially deduplicated into CSS variables, active module styles consume the token system, and behavior/theming remains unchanged while visual rhythm (spacing, font sizes, paddings/margins) is consistently aligned.

## Idempotence and Recovery

All steps are safe to repeat. If a refactor introduces visual regressions, restore the affected file from git and re-apply token substitutions in smaller increments. No migrations or destructive operations are needed.

## Artifacts and Notes

Expected command for verification:

  npm run test

Expected style direction after refactor:

  Modules avoid raw color hexes/rgba where a semantic token exists and prefer spacing/type tokens over repeated numeric literals.

## Interfaces and Dependencies

No runtime interfaces or TypeScript contracts change. This plan only modifies CSS variable definitions and CSS module declarations. No new libraries are required.

Change note (2026-02-11): Initial ExecPlan created to consolidate style tokens and normalize layout consistency across rack and DRPD module styles.
Change note (2026-02-11): Marked implementation complete with finalized progress, decision updates, discoveries, and validation results.
