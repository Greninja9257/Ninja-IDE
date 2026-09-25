# Not implemented

What Ninja has been asked for but does not yet do, and why each one is still
outstanding. Last updated 2026-09-22.

---

## Needs a server, not an edit to this repo

Ninja is a fork of TurboWarp's `scratch-gui`, which is the **editor only**.
Accounts, profiles, messages and studios all live on Scratch's website
(`scratch-www` plus its API), none of which is here. The four items below were
each checked against the codebase before being listed.

### Cloud variables: text values, 1000-character limit

The client already permits both. `scratch3_data.js` passes values straight to
the cloud provider:

```js
setVariableTo (args, util) {
    variable.value = args.VALUE;
    if (variable.isCloud) {
        util.ioQuery('cloud', 'requestUpdateVariable', [variable.name, args.VALUE]);
    }
}
```

No coercion to a number, no truncation. A search of `src/` and
`node_modules/scratch-vm/src/` finds no 256-character limit anywhere.
"Numerals only, 256 characters" is enforced by **Scratch's cloud server**.
TurboWarp already removed the variable *count* limit
(`MAXIMUM_CLOUD_VARIABLES = Infinity`) and defaults to
`wss://clouddata.turbowarp.org`.

To deliver this, Ninja needs its own cloud server with those rules, and to
point at it instead. Small and self-contained: a WebSocket server, no accounts
required.

### Profiles, and pinning messages to a profile

Nothing of the sort exists in this codebase. `author-info.jsx` and
`account-nav.jsx` are menu-bar chrome that link out to scratch.mit.edu.
Requires accounts, storage, moderation and hosting.

### Communities (the thing Scratch calls Studios)

There is no studio system here to rename. The only occurrence was TurboWarp's
featured-projects widget reading `scratch.mit.edu/studios/27205657`, which was
removed as branding. Requires the same backend as profiles.

### Live collaboration between users

Raised as a "remind me later" item. Needs the backend above plus operational
transform or CRDT over the VM's block store.

---

## Deliberately dropped

### `.jar` export

Dropped after establishing that it could not work well. `scratch-render`
requires WebGL, and JavaFX's `WebView` does not support it — a JavaFX-based jar
would launch and then render nothing. The alternatives were a launcher jar that
shells out to the system browser (works, but is not really an application) or
bundling JCEF (~200MB per platform, and no longer one portable jar).

The Windows, macOS and Linux exports already produce real desktop applications,
which covers the same need everywhere except machines that permit Java and
nothing else.

### Game engine view

Built as a scene tree, viewport and inspector, then removed. Python is a second
view of the same scripts, which earns its place; a Godot-style scene view over
Scratch targets mostly duplicated the sprite pane.

---

## Owed, with nowhere to put it yet

### An info / about page

The footer disclaimers were removed from the home page for looking bad there,
but the text itself still has to live somewhere:

> Ninja is not affiliated with Scratch, the Scratch Team, or the Scratch
> Foundation.

> Scratch is a project of the Scratch Foundation. It is available for free at
> https://scratch.org/.

These are not decoration. Scratch's terms ask mods to carry that attribution,
so an About or Info page needs to exist and carry it. `credits.html` already
exists and is linked from the footer, which is the obvious home for it.

The same page should also carry the GPL-3.0 notice and a link to Ninja's
source, which the licence requires for any build handed to anyone else.

---

## Editor work still outstanding

### Custom extension projects

Asked for: a project type that *is* an extension — custom blocks, a
description, a favicon, and optionally a custom GUI behind it. Loading
third-party extensions already works (URL, file, or pasted code, plus the
TurboWarp and SharkPool galleries). Authoring one inside Ninja does not.

### Python libraries as extensions

Needs a decision on how Python runs at all: whether Ninja ships a Python
runtime (Pyodide is ~10MB), or whether "Python library" means a block wrapper
around a JavaScript equivalent. Not yet designed.

### Python view coverage

The transpiler round-trips the motion, looks, sound, events, control, sensing,
operators and data blocks, verified by 14 tests. Not yet handled:

- Custom blocks (`procedures_definition` / `procedures_call`)
- Extension blocks round-trip as opaque calls rather than named functions
- Comments on blocks

### Step debugging

Asked for early: run one block or one frame at a time, highlighting the block
about to execute in whichever view is open. Not started.

### Graphing and machine-learning blocks

Asked for as learning tools. Not started; likely extensions rather than core.
