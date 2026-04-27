# Designer Getting Started

## What USB-PD Is

USB Power Delivery (USB-PD) is the negotiation protocol that runs over a USB-C connection so two devices can agree on power direction, voltage, current, and, in some cases, data mode changes. Instead of a cable always delivering one fixed power level, USB-PD lets a source and a sink negotiate profiles such as 5 V, 9 V, 15 V, or 20 V and coordinate capabilities, requests, and status updates.

For this project, the important UX implication is that the UI is not just showing static electrical readings. It is showing an active conversation between two USB-C partners: what power is available, what was requested, what role each side is playing, and what messages are moving across the link.

## What Dr. PD Does

Dr. PD is the hardware device this frontend talks to. In the codebase it appears as the device identifier `com.mta.drpd` and the display name `Dr. PD`.

At a high level, Dr. PD acts as a USB-PD analysis and control instrument. It can:

- monitor live VBUS measurements such as voltage and current
- observe CC line state
- capture USB-PD messages
- expose message logs and time-based visualizations
- let the operator configure sink behavior, triggers, and related test settings

That is why the UI looks more like a bench instrument rack than a conventional dashboard. It is presenting several specialized views onto one physical device.

## Core UI Concepts

### Rack

The main UI metaphor is a rack. A rack is the top-level visual workspace. It contains:

- a list of physical devices attached to the rack
- a list of rows
- persisted flex weights for rows and instruments
- draggable splitters between adjacent instruments and rows

The rack definition is persisted in local storage, so layout changes survive reloads.

### Device

A device is a physical hardware entry known to the rack. Right now the main device is Dr. PD. Devices are stored separately from instruments so multiple UI panels can bind to the same hardware record.

### Instrument

An instrument is one UI panel. Examples in this frontend include:

- `VBUS`
- `Device Status`
- `CC Lines`
- `Sink Control`
- `Sync Trigger`
- `Message Log`
- `Timestrip`
- `Message Detail`

Each instrument has a default flex weight plus minimum CSS width/height constraints. Users can resize instruments freely without a grid.

### Row

A row is a horizontal strip in the rack. Instruments sit side by side inside a row. The space between instruments is a draggable splitter that shifts flex weight from one neighbor to the other.

Rows also determine height. The space between rows is a draggable splitter. Dragging it grows one row and shrinks the adjacent row while honoring instrument minimum heights.

### Edit Mode

The rack has an edit mode for layout changes. In edit mode:

- instruments become draggable
- close buttons appear
- drop zones appear between rows
- drag operations can reorder within a row or create new rows
- changes are transactional until the user saves

Resize splitters are always active, even outside edit mode.

This matters for design work because layout affordances, focus states, glow treatments, and empty/drop states all live in this mode.

## How The Frontend Is Organized

### Main entry points

- `src/main.tsx`: bootstraps the app and computes the global `--ui-scale`
- `src/App.tsx`: very thin shell around the rack view
- `src/index.css`: global design tokens, colors, typography, spacing, and rack sizing tokens
- `src/App.css`: root viewport layout

### Rack feature area

Most layout and UX work happens in `src/features/rack/`.

- `RackView.tsx`: page-level rack experience, header, theme toggle, add-device and add-instrument menus, edit mode, and persistence wiring
- `RackRenderer.tsx`: rack canvas sizing, scroll/fit behavior, row rendering, full-screen overlay handling
- `RowRenderer.tsx`: per-row instrument sizing, resize splitters, drag/drop insertion logic, and dispatch to concrete instrument views
- `layout.ts`: legacy unit helpers plus flex/min-size helpers
- `rackCanvasSize.ts`: computes the base rack canvas width and height
- `rackSizing.ts`: reads sizing tokens from CSS so TypeScript layout logic and CSS stay aligned

### Instrument implementations

Concrete instrument UIs live in `src/features/rack/instruments/`.

Each instrument typically has:

- a `.tsx` file for behavior and structure
- a `.module.css` file for scoped styling

If you are redesigning the chrome shared by all instruments, start with:

- `src/features/rack/InstrumentBase.tsx`
- `src/features/rack/InstrumentBase.module.css`

If you are redesigning a specific panel, work in that instrument’s `.tsx` and `.module.css`.

### Data and definitions

- `src/lib/rack/types.ts`: rack, row, instrument-instance, and device-record data model
- `src/lib/rack/loadRack.ts`: local storage persistence
- `src/lib/instrument/types.ts`: instrument definition model including default flex and minimum CSS sizes
- `src/features/rack/instrumentCatalog.ts`: the catalog of supported instruments and their default sizes
- `src/lib/device/drpd.ts`: Dr. PD device definition

## How Layout Works

### Flex-based layout

The rack uses CSS flex for instruments and rows. Legacy unit fields still exist for compatibility, but the renderer no longer allocates space with a grid or explicit panel sizes.

Default sizing tokens are:

- 1 horizontal unit = `20px * --ui-scale`
- 1 vertical rack unit = `100px * --ui-scale`
- maximum row width = `60` horizontal units

In practice the standard bench layout keeps a 1200 px reference width for header alignment. The rack canvas itself fills the viewport, with row heights and instrument widths coming from CSS flex weights.

### Width allocation and resizing

Instrument widths come from `instrumentCatalog.ts`.

- `defaultFlex`: default horizontal weight for new or migrated instances
- `minWidth`: minimum width CSS length during resizing

`RowRenderer.tsx` renders a splitter between adjacent instruments. Dragging it increases one instrument's flex weight and decreases the neighbor's flex weight. The browser handles final sizing through CSS flex.

The saved `RackInstrument.flex` value wins over catalog defaults.

### Height allocation

Each row and instrument uses flex for height distribution. Instruments declare `minHeight`.

`RackRenderer.tsx` renders a splitter between rows. Dragging it shifts flex weight between adjacent rows.

### Full-screen mode

An instrument instance can be marked `fullScreen: true`. When that happens, `RackRenderer.tsx` stops showing the standard rows and instead renders a full-screen overlay for that instrument.

## CSS Setup

### Global tokens first

`src/index.css` is the foundation. It defines:

- typography tokens (UI font: **Inter** via Google Fonts, with system-ui fallbacks in `--font-family-base`)
- spacing tokens
- radius and border tokens (including `--radius-instrument` for instrument panels, `--radius-control` for buttons and controls)
- rack sizing tokens
- light and dark theme colors
- elevation shadows: `--shadow-instrument` (instrument panels; dark uses inset top highlight + outer shadow), `--shadow-rack-canvas` (rack canvas), `--shadow-header` (page header; light theme)
- dark default look: charcoal / neomorphic-inspired surfaces (`#121212` page, `#1e1e1e` panels, instrument body uses `--color-surface-instrument` gradient only); instrument **title bars** use `--texture-instrument-header` (subtle diagonal stripes) plus a light gradient; light theme restores a larger `--radius-instrument`

Most dimensions are expressed through CSS custom properties multiplied by `var(--ui-scale)`. That is the key pattern to preserve.

### Scoped styles second

Feature and instrument styles use CSS modules:

- `RackView.module.css`
- `RackRenderer.module.css`
- `RowRenderer.module.css`
- `InstrumentBase.module.css`
- instrument-specific `*.module.css`

The intended layering is:

1. `index.css` defines the shared system
2. feature CSS modules apply structure and component-level styling
3. instrument CSS modules handle panel-specific layout and visuals

### Important styling conventions

- Use tokens from `src/index.css` instead of hardcoded pixel or `rem` values when possible.
- Header popovers should use the shared popup typography tokens, not custom font sizes per instrument.
- Most instrument spacing and sizing should inherit from `--ui-scale` so the interface stays coherent across displays.
- Shared panel chrome belongs in `InstrumentBase.module.css`; avoid duplicating it inside each instrument.

## How The UI Scales Across Resolutions

### Global scale

The app computes a single global scale factor in `src/main.tsx` and writes it into `--ui-scale`.

The current behavior is:

- reference viewport width: `1024px`
- reference content width: `800px`
- minimum scale: `0.82`
- maximum scale: `2.8`
- source measurement: `window.screen.width` first, then window/document width fallbacks

Because the scale is written into CSS variables, typography, spacing, borders, splitters, popovers, and many instrument-specific measurements all scale together.

### Practical effect

On smaller screens:

- text, controls, gaps, and instrument dimensions shrink together
- the rack still preserves its proportional structure
- some instruments will feel denser rather than switching to a separate mobile layout

On larger screens:

- the same visual system expands proportionally
- flex panels render larger in the scaled UI
- popovers and dense data tables also scale up

This frontend is therefore better described as a scaled desktop instrument UI than as a breakpoint-heavy responsive website.

### Scroll versus fit behavior

`RackRenderer.tsx` also adapts vertically based on available viewport height.

- if the viewport is shorter than the computed rack canvas height, the rack enters scroll mode
- if the viewport is tall enough, the rack fits without vertical scrolling

The renderer lets CSS flex stretch the rack canvas to the viewport. If minimum sizes exceed the viewport, the containing viewport handles overflow.

### Popovers and overlays

Header menus and instrument popovers use viewport-aware positioning from `RackView.tsx` and sizing tokens from `rackSizing.ts`. Their dimensions still scale via `--ui-scale`, but their position is clamped so they stay on-screen.

## Where A Designer Should Start

If your task is mainly visual polish:

- start with `src/index.css` for tokens and theme values
- then inspect `src/features/rack/InstrumentBase.module.css` for shared panel chrome
- then adjust `RackView.module.css`, `RackRenderer.module.css`, and `RowRenderer.module.css` for overall composition

If your task is panel-specific UX:

- work inside the target instrument under `src/features/rack/instruments/`
- check whether the issue is structural in the `.tsx` file or purely visual in the `.module.css`

If your task is changing spatial behavior:

- inspect `instrumentCatalog.ts` for default widths/heights
- inspect `layout.ts` for row allocation rules
- inspect `rackCanvasSize.ts` and `rackSizing.ts` for global size math

## Useful Additional Context

### Persistence

The rack document is stored in local storage under `drpd:rack:document`. If a layout change seems to “stick” unexpectedly while you are iterating, you may be seeing persisted local state rather than code changes.

### Theme support

The app supports dark and light themes through root-level CSS variables in `src/index.css`. Theme switching happens in `RackView.tsx` by setting `data-theme` on the document root.

The **dark (default)** palette layers neomorphic-style elevation (inset highlight + drop shadow) on instruments and the rack canvas; instrument **headers** use `--texture-instrument-header` (subtle stripes). **Light** theme uses a larger `--radius-instrument`. You can archive reference mockups alongside the repo under `docs/assets/` if useful.

### Current design bias

The current UI is intentionally instrument-like:

- dense information
- strong borders
- compact uppercase headers
- panelized layout instead of card grids

When redesigning, it is usually better to preserve the rack metaphor and improve clarity, hierarchy, and task flow than to flatten the product into a generic dashboard.

### Running the frontend

From the `frontend/` directory:

```bash
npm run dev
```

The sample rack lives at `public/racks/sample-rack.json`, and the active rack state is then persisted locally in the browser.

## Related docs

- `docs/rack-instruments.md`: rack and instrument architecture
- `docs/drpd-device.md`: Dr. PD command groups and device model
- `docs/drpd-worker-runtime.md`: frontend runtime and worker architecture
