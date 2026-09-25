# Design decisions

Answers from the project owner, recorded so later work does not re-litigate them.

## Extensions are a project type

"New → Extension" opens a different workspace from "New → Game": a block
designer, an identity editor (name, icon, description), and a live test stage.
Building an extension is a different job from building a game, so it gets a
different room.

## Every block picks its own implementation

A block in an extension is implemented with **blocks, Python, or JavaScript**,
chosen per block. This mirrors the rest of Ninja, where the three views are
peers rather than a main path and two fallbacks.

## An extension's GUI is a Ninja project

The "custom GUI with code behind it" is **a panel docked in the IDE**, and the
panel is itself a small Ninja project — scene tree, UI nodes, scripts and all.

The worked example: a shader-gallery extension whose panel renders live
previews of each shader. The author builds that gallery the same way they build
a game, then declares it as the extension's panel. This is why `ExtensionPanel`
below points at a `SceneNode` rather than at an HTML string — the author should
never have to drop to raw HTML to build a tool.

## No Scratch-host portability

Authored extensions target **Ninja only**. Nothing in the authoring format is
constrained by what TurboWarp could load.

Import remains one-way and stays: extensions from extensions.turbowarp.org and
sharkpools-extensions.vercel.app load into Ninja unmodified, because that is a
large body of existing work worth being able to use.

"Export" in this project always means **a platform build** — macOS app, Windows
`.exe`, Linux binary, `.jar`, `.html` — never "a file another Scratch host can
open".

## Running a project is a debugger, not a play button

Ninja ships **step** alongside **play**. The run bar is
`▶ play · ⏸ pause · ⏭ step tick · ⏩ step frame · ⏹ stop`, and stepping advances
the VM exactly one tick so the author can watch the process happen rather than
infer it from the result.

This is a runtime requirement before it is a UI one: the VM is built as a
*steppable* scheduler from the start, because bolting single-stepping onto a
loop that owns its own clock never works properly. Concretely, the VM exposes
`step()` (one tick) and `frame()` (ticks until the next render), and the IDE's
play button is just `step()` on a timer.

While stepping, the block that is about to run is highlighted on the canvas and
the corresponding Python line is highlighted in the editor — the same position,
shown in whichever view is open.

## Windows pop out, and there can be several

Any panel can be torn off into its own OS window, and the **stage can be opened
more than once at the same time** — the way a game engine lets you run several
play windows side by side.

Multiple stage windows share one VM and one project: they are extra *views* of
the same running game, not separate copies of it. That makes them useful for
what people actually want them for — watching the stage on one monitor while
editing on another, comparing two cameras, or seeing a debug overlay beside the
clean render.
