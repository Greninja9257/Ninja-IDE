# Architecture

## The pivot

Ninja is built **on TurboWarp's scratch-gui fork**, not on a hand-written editor.

The first attempt reimplemented the Scratch editor from scratch — block
rendering, palette, layout, VM. It was the wrong call. Scratch's editor is the
product of years of work on details that are invisible until they are wrong:
the notch profile, drag-and-drop targeting, the toolbox flyout, i18n, the
costume and sound editors, accessibility. Rebuilding it produced something that
looked *almost* right, which is worse than not trying.

Building on TurboWarp means Ninja starts with:

| From TurboWarp / Scratch | What it gives |
|---|---|
| `scratch-gui` | The editor shell, toolbox, sprite pane, paint and sound editors |
| `scratch-blocks` | Real block rendering and drag-and-drop |
| `scratch-vm` + TW compiler | The runtime, and TurboWarp's JIT compiler |
| TW extension loader | Every extension on extensions.turbowarp.org already works |
| TW packager | HTML, Windows, macOS and Linux builds |
| TW addons | The settings/addon framework Ninja's own options plug into |

## Licence

TurboWarp's `scratch-gui` and `scratch-blocks` are **GPL-3.0**; upstream Scratch
is **AGPL-3.0**. There is no permissive option. **Ninja is therefore GPL-3.0**:
the source must ship with any build handed to anyone else.

This is a permanent, load-bearing consequence, not a formality. It forecloses
ever making Ninja closed-source. It was chosen deliberately in exchange for not
rebuilding an editor by hand.

## What Ninja adds

The parts that are actually Ninja's, in rough order of how much they matter:

1. **The Python view** — the one genuinely novel thing here. A block script and
   a Python function are two projections of the same script, and switching
   between them is lossless. Anything Python can express that blocks cannot
   becomes an opaque Python block rather than being mangled or dropped.
   Lives in `packages/pyc`.

2. **The engine view** — a Godot-style scene tree, inspector and viewport over
   the same targets the sprite pane shows.

3. **Step debugging** — run one block or one frame at a time, with the block
   about to execute highlighted in whichever view is open.

4. **Extra block families as extensions** — engine, physics, UI, graphing and
   Python blocks, written to the ordinary extension API so they are not
   privileged over third-party ones.

5. **Raised limits** — cloud variables carry text and 1000 characters rather
   than 256 numerals.

6. **A `.jar` export**, because that is often the one executable format a
   managed school computer will still run.

## What survived the pivot

- `packages/pyc` — the Python parser, code generator and block lifter. The
  lexer, parser and AST are untouched; the leaf mapping retargets from Ninja's
  own IR onto scratch-vm's block format.
- `packages/blocks` block definitions — these become extension `getInfo()`
  definitions.
- `packages/exporter` — the `.jar` and desktop packaging templates.
- `docs/compatibility.md` — the verified upstream constants and APIs.

## What was deleted

The hand-written block renderer, block layout engine, IDE shell, CSS, IR and
tree-walking interpreter. `scratch-blocks` and `scratch-vm` do all of it, and do
it properly.
