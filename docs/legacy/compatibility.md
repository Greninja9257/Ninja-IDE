# Compatibility notes

Verified against upstream sources rather than guessed. Fetched 2026-09-22.

## Block colours

`scratch-gui/src/lib/themes/default/index.js` — Ninja's default theme uses these
verbatim so muscle memory and screenshots transfer:

| Scratch category | primary | secondary | tertiary |
|---|---|---|---|
| motion | `#4C97FF` | `#4280D7` | `#3373CC` |
| looks | `#9966FF` | `#855CD6` | `#774DCB` |
| sounds | `#CF63CF` | `#C94FC9` | `#BD42BD` |
| control | `#FFAB19` | `#EC9C13` | `#CF8B17` |
| event | `#FFBF00` | `#E6AC00` | `#CC9900` |
| sensing | `#5CB1D6` | `#47A8D1` | `#2E8EB8` |
| pen | `#0fBD8C` | `#0DA57A` | `#0B8E69` |
| operators | `#59C059` | `#46B946` | `#389438` |
| data | `#FF8C1A` | `#FF8000` | `#DB6E00` |
| data_lists | `#FF661A` | `#FF5500` | `#E64D00` |
| more (procedures) | `#FF6680` | `#FF4D6A` | `#FF3355` |

Non-category theme tokens that the real GUI exposes, and Ninja therefore also
exposes to themes: `text`, `workspace`, `toolbox`, `toolboxText`,
`toolboxHover`, `toolboxSelected`, `flyout`, `scrollbar`, `scrollbarHover`,
`textField`, `textFieldText`, `insertionMarker`, `insertionMarkerOpacity`,
`dragShadowOpacity`, `stackGlow`, `stackGlowSize`, `stackGlowOpacity`,
`replacementGlow`, `replacementGlowSize`, `replacementGlowOpacity`,
`colourPickerStroke`, `fieldShadow`, `dropDownShadow`, `valueReportBackground`,
`valueReportBorder`, `menuHover`.

## Extension API

`scratch-vm/src/extension-support/extension-metadata.js` is the contract. Ninja
implements it exactly, so extensions from extensions.turbowarp.org and
sharkpools-extensions.vercel.app load unmodified.

```
ExtensionMetadata:
  id, name?, blockIconURI?, menuIconURI?, docsURI?,
  color1?, color2?, color3?,          // TurboWarp addition, widely used
  blocks: (ExtensionBlockMetadata | string)[],   // a bare string is a separator
                                                 // ("---") or a section label
  menus?: { [name]: ExtensionMenuMetadata }

ExtensionBlockMetadata:
  opcode, func?, blockType, text,      // text uses [PLACEHOLDER], not %PLACEHOLDER
  hideFromPalette?, isTerminal?, disableMonitor?, reporterScope?,
  isEdgeActivated?, shouldRestartExistingThreads?, branchCount?,
  arguments?: { [NAME]: { type, defaultValue?, menu? } }

ExtensionMenuMetadata:
  string (name of a method returning items)
  | { items: (string | {text, value})[] | string, acceptReporters?: boolean }
```

`BlockType`: `command`, `reporter`, `Boolean`, `hat`, `event`, `conditional`,
`loop`, `button`.

`ArgumentType`: `angle`, `Boolean`, `color`, `number`, `string`, `matrix`,
`note`, `image`.

`TargetType`: `sprite`, `stage`.

### The `Scratch` global

From `TurboWarp/scratch-vm/src/extension-support/tw-unsandboxed-extension-runner.js`.
Each extension gets its own copy of the object:

`Scratch.extensions.register(obj)`, `Scratch.extensions.unsandboxed`,
`Scratch.vm`, `Scratch.renderer`, `Scratch.runtime`,
`Scratch.BlockType`, `Scratch.ArgumentType`, `Scratch.TargetType`, `Scratch.Cast`,
`Scratch.translate`,
`Scratch.fetch`, `Scratch.canFetch`,
`Scratch.openWindow`, `Scratch.canOpenWindow`,
`Scratch.redirect`, `Scratch.canRedirect`,
`Scratch.download`, `Scratch.canDownload`,
`Scratch.canRecordAudio`, `Scratch.canRecordVideo`, `Scratch.canReadClipboard`,
`Scratch.canNotify`, `Scratch.canGeolocate`, `Scratch.canEmbed`.

Every `can*` call routes through a security manager, which is where Ninja asks
the user for permission. That is not optional politeness: an extension is
arbitrary code from the internet and the prompt is the only thing between it and
the user's network and clipboard.

Block functions are called as `func(args, util)` where `args` is keyed by
argument name and `util` is the block utility (`util.target`, `util.yield()`,
`util.startBranch(n, isLoop)`, `util.stackFrame`).
