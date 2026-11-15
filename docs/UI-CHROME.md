# UI chrome inside the game

The table is now built as **content inside UI chrome**, not art painted behind text.

## Research summary

The implementation follows the common 9-slice/nine-patch contract:

- Four source corners stay fixed. Top and bottom edges stretch horizontally; left
  and right edges stretch vertically; the center fills the remaining content area.
  [SpriteLab's 9-slice guide](https://spritelab.dev/guides/9-slice-game-ui) and
  [Coherent Labs' border-image guide](https://guide.coherent-labs.com/layout-assets-and-styling/graphics--shapes/advanced-ui-shapes)
  describe the same model; CSS exposes it as `border-image` with
  `border-image-slice` and `border-image-width`.
- The slice inset must be measured from the source art, not guessed. If the
  inset cuts through a corner ornament, the ornament stretches and the panel
  looks cheap. The element must reserve a real border with a non-`none`
  `border-style`; `fill` keeps the center slice.
- Keep the frame and the content background separate. The frame should not bake
  in labels or dynamic content; text, counters and controls live above it.
- Do not 9-slice a complete illustration, logo or portrait. Scale those
  uniformly. The cabinet is treated as a fixed-aspect frame with a transparent
  window; the live reel grid is positioned inside that window.
- Responsive game UI should anchor and scale components rather than stretching a
  whole screen bitmap; the game viewport may expand while HUD and controls stay
  readable and inside safe areas. See
  [Playgama responsive layout](https://wiki.playgama.com/playgama/guides/game-development/responsive-layout)
  and [Apple's handheld-game interface guidance](https://developer.apple.com/videos/play/meet-with-apple/243/).
- For a Pixi canvas the equivalent primitive is
  [`NineSliceSprite`](https://pixijs.com/8.x/guides/components/scene-objects/nine-slice-sprite).
  This project's UI is DOM, so CSS `border-image` is the native tool.

## Implemented contract

| Element | Source | Source crop | Slice (T R B L) | Rendered border | Used by |
|---|---|---|---|---|---|
| Panel | `ui.panel` | 369 × 161 | `37 45 37 45 fill` | `18px 22px` | HUD, Prep, Speed, Trinket Rail, Event Log, Shop summary, Compendium summary, board |
| Button | `ui.button` | 354 × 113 | `34 36 24 36 fill` | `17px 18px 12px 18px` | Spin and Start-run primary actions |
| Cabinet | `ui.cabinet` | 365 × 343 | fixed-aspect frame, not 9-sliced | — | Slot cabinet with a transparent window |

- The source crops are tight derivatives of the generated UI art. They are embedded
  as data URIs in `apps/game/src/components/ui9-data.json`; the CSS variables are
  installed before first render so the zero-network test still holds.
- The cabinet window is inset at left 12.6%, top 25.7%, width 71.8%, height 44.3%.
  Those percentages come from the transparent hole in the 365 × 343 cabinet
  alpha, not from the earlier visual estimate; the old 19% top left the reel
  window roughly one cell too high and let the cabinet frame paint over it.
- The shell removes the 1440px cap, uses `100dvh`, safe-area padding and a
  full-width table stage. Desktop splits the stage into two equal columns; below
  900px it stacks. The side panels move below the game in a three-column row.
- Primary buttons keep hover, active and disabled states; focus outlines remain
  global.

## Design system (apps/game/src/theme/tokens.css)

Art direction: art-deco noir casino with neon accents. One stylesheet, in order:
fonts, tokens, base, icons, primitives, shell, meta screens, table/components,
motion/accessibility, responsive.

- **Fonts**: Outfit (display), Inter (body), JetBrains Mono (numbers, labels),
  SIL OFL 1.1, self-hosted from `apps/game/public/fonts/` via `@font-face`
  (bundled by the build; no font CDN).
- **Colour**: the C-9 `--color-*` brand values (obsidian, slate-dark, panel,
  gold, cyan, crimson, emerald) plus `--surface-0..4`, ink (`--color-text`,
  `--color-muted`, `--color-faint`), the brass family (`--brass-*`,
  `--brass-gradient`, `--brass-text`) and rarity colours (`--rarity-*`).
- **Scales**: `--text-2xs..hero`, `--space-1..9`, `--gutter`, `--radius-xs..pill`,
  `--shadow-1..3` (`--shadow-panel` aliases 2), `--glow-*`, `--focus-ring`.
- **Motion**: `--dur-1..5` and `--ease-out|in-out|spring`. Reduced motion (the
  setting sets `html[data-reduced-motion=true]`; the OS query too) collapses
  every animation/transition and its delay, and hides decorative loops.
- **Primitives**: `.btn` + `-primary|-secondary|-ghost|-danger|-danger-solid|-cyan`
  and `-sm|-lg|-hero|-icon|-back`; `.deco-frame` corner brackets; `.stat-tile`;
  `.pip-meter`; `.seed-card`; `.switch`; `.segmented`; `.range`; `.progress-track`.
- Existing custom-property and class names used by `components/` and
  `screens/table/` are kept unchanged.

## Shell routing

Game screens (table, shop, elevator, boss, game over, victory) follow the
phase machine: a phase change moves the player to its screen, round results
open as a modal over the settled table, and a typed URL for a screen the phase
has not reached is redirected. Compendium and Settings are menus that return
to where they were opened (Back or Escape). The screen-jump nav is a dev
affordance shown only in development builds opened with `?dev=1` or `?test=1`.

## Known limitations

- The panel slice now reserves the generated crest rows (`37px` top and bottom),
  so the crest is no longer stretched through the centre fill. If the art is
  regenerated, re-measure the crest and rail rows and update the slice values
  together with `border-image-width`; the two must stay in the same ratio.
- `ui.dozer`, `ui.gutter` and `ui.lip` are horizontal trim pieces. They still
  need a proper slice/projection contract; they are not placed in the board yet.
- No screenshot matrix at 320/640/960 has been added yet. The current acceptance
  covers 1440/1920 measurements and the 390×844 E2E comfort profile.
- This is development chrome, not approved final art. See `docs/ASSET_CREDITS.md`
  for the remaining placeholders and rights blockers.
