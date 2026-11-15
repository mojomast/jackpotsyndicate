# Jackpot Syndicate — final acceptance report

Date: 2026-11-15 UTC
Integrated branch: `feat/b3-integration`
Head at report time: `5a21ee9` (plus the asset/feature history below)

This is the T-093 acceptance record. It is intentionally not a release approval.
Nothing is merged to `main`, tagged, deployed, or published.

## Task graph status

**27 of 27 tasks have landed on feature/integration branches.** That means the
implementation work exists and was exercised where stated below. It does **not** mean
every acceptance criterion is green; the gaps are listed explicitly.

## Acceptance criteria

| AC | Status | Evidence / gap |
|---|---|---|
| AC-1 install/build/preview | **PASS** | frozen install, game build and Playwright preview server all run; built cabinet renders in a real browser |
| AC-2 lint/typecheck/test/coverage | **PARTIAL** | `pnpm lint` PASS; `pnpm typecheck` PASS; `pnpm test` **226 passing** (193 package + 33 app-level); line coverage ≥85% was not measured |
| AC-3 golden replay | **PASS** | `pnpm sim:replay` MATCH at `cbb0ca4b92ac7a48e7a2847a`; the fixture was re-recorded after the frozen-cell scoring fix (seed `sim:greedy-synergy:47`, 150 commands, 24,433 ticks) and Playwright golden replay passes in Chromium, Firefox and WebKit. The earlier `bade5e3091c269a205ccace5` pre-audit hash and the `f1c20d301422d14c0edcaac1`/`f6ee393f9861280acd61c44b` intermediate hashes are preserved in this audit record; none is presented as a current pass; the complete old command log is retained as `fixtures/replay.golden.pre-audit.json`. |
| AC-4 E2E J1–J8 | **PARTIAL** | Chromium **10/10 PASS** and Firefox **10/10 PASS** after the second audit pass; WebKit golden replay **1/1 PASS**. Full WebKit journeys remain unrunnable on this host without the libevent workaround and were not rerun; the earlier WebKit J8 4× sub-check remains a known skip (39.8% vs 30% target). |
| AC-5 rake | **PASS** | 10,000 spins/floor: Neon 17.0%, Cryo 22.7%, Foundry 12.0%, Penthouse 21.3%, all in band |
| AC-6 balance | **PASS** | 2,000 runs/bot: random-buyer Floor 1 51.8%, win 5.1%; greedy win 37.3%; max bankroll 38,982,203 (<1e12) |
| AC-7 hit rate | **PASS** | 40.6% over 5,000 evaluations, target 30–45% |
| AC-8 performance/bundle | **PASS** | stress scene: sim tick avg 0.341 ms, render frame avg 0.218 ms; bundle 1.90 MB gzip of 3.00 MB budget |
| AC-9 animation lint/trailer | **PARTIAL** | `hyperframes lint` exits 0 with warnings; trailer MP4 exists but still uses the animation package’s placeholder/vector art path, not a real-sprite re-render |
| AC-10 README/delivery | **PASS** | five-command quick start, architecture/content/balance/asset-credit docs, manual-dispatch-only deploy workflow; no publish step |

## Audit fixes (2026-11-15)

The read-only audit found correctness and presentation defects beyond the original
acceptance checklist. The following fixes are in this branch:

- **HUD quota** now uses the content quota table (`quotaForState`), not the shallow
  `1000 × floor-scale` prototype formula. Cryo round 1 displays **$9,261**, not
  **$1,000**.
- **Real-engine React updates**: the store snapshots `core.getState()` on every
  attach/dispatch/tick. The real `Core` returns its live mutable state, so Zustand
  previously saw the same object identity and did not repaint bankroll/phase changes.
- **Save safety**: `saveCore` refuses `SPINNING`, `RESOLVING` and `ROUND_SETTLE`
  because the in-flight spin schedule is not in `RunState`; a save taken there
  previously reloaded into a stuck phase.
- **ROUND_RESULT resume**: `SaveFile.lastResult` now carries the settled verdict
  outside `RunState` (so the C-5 state hash and golden replay are unchanged). A
  resumed `ContinueAfterRound` can no longer fall through into the shop after a
  failed round, and the result screen reads the persisted verdict.
- **Boss freeze**: a cell frozen by Madame Zero keeps its symbol through the next
  draw instead of being replaced while the freeze badge remains.
- **UI chrome**: the cabinet window is inset to the measured alpha hole
  (`left 12.6%`, `top 25.7%`, `width 71.8%`, `height 44.3%`). Panel and button
  borders now reserve `12px 22px` / `9px 18px` with separate
  `border-width`/`border-style` declarations, so `border-image-width` cannot paint
  over content. Missing meta-screen styles (notices, boss tug bar, result/summary
  cards, relic/jumper pickers, seed copy, error/stub screens) are present.
- **First paint**: the shell renders before the 67-image atlas preload; the preload
  continues in the background instead of holding the screen blank.
- **Mobile nav**: below 620px the nav wraps instead of hiding later routes behind
  horizontal scrolling.
- **Contact sheet**: the generated review sheet embeds the 71 resolved images (or
  placeholder vectors), so it is an actual art-review gate rather than metadata-only.
- **Test bridge**: `window.__JS_TEST__` is enabled only in development/e2e builds,
  not by a production `?test=1` query string.

Negative-test evidence (the new tests were run against the pre-fix source with the
fixes stashed):

```text
apps/game/tests/table.test.tsx  3 failing: HUD quota, real-core snapshot, transient save
packages/core/tests/core.test.ts 2 failing: boss freeze, ROUND_RESULT verdict
```

After restoring the fixes, the targeted suites pass, the app suite passes
**33/33**, and the full root suite passes **226 tests** (193 package + 33 app).
The RED logs are `/tmp/audit-red-app.log` and `/tmp/audit-red-core.log` in the
first audit pass, and `/tmp/pass2-red-scoring.log` / `/tmp/pass2-red-verdict.log`
in this pass; they are not committed. Still unproven: coverage ≥85%, the
full accessibility audit, CI execution of every draft PR, and the remaining art
pipeline items below.


## Second audit pass (2026-11-15)

The follow-up read-only review found several issues in the first fix set. Applied
in this pass:

- **Save safety**: `ROUND_SETTLE` is resumable again (its timer is re-armed by
  `RunMachine.resumeTimers`); `RELIC_PICK` and `JUMPER_PICK` are now fail-closed
  for autosave because their dealt offers are machine-private and cannot be
  restored from `SaveFile`. Existing picker saves are marked non-resumable instead
  of being offered as a broken Continue.
- **ROUND_RESULT**: saves without `lastResult` fail closed to `GAME_OVER` for
  normal rounds (the tribute already makes a pass indistinguishable from a miss);
  boss verdicts are reconstructed exactly from `roundCash` versus `boss.score`.
  A malformed `lastResult` no longer deletes the otherwise valid save, and a
  normal-round save carrying a boss verdict is rejected as inconsistent.
- **Frozen-cell scoring**: CLASSIC evaluation now accepts the frozen-cell set and
  does not start or extend a line through a frozen cell, matching the HYPER/WAYS/
  CLUSTER evaluators (R-BOS-03). `ChooseFloor` clears boss locks so they cannot
  leak into the next floor; the store clears a stale verdict when a new spin starts.
- **UI**: panel slice changed to `37 45 37 45 fill` with an `18px 22px` border,
  reserving the baked crest instead of stretching it through the fill; reel
  sprites now size to their cell without clipping; the spin button uses
  `button.btn.hud-spin` so its 72px height and 16.64px label actually apply;
  shop summary labels stack above values; the bezel keeps its native aspect; the
  mobile safe-area padding is preserved; the event log is keyboard-scrollable.
- **Attempted, reverted**: removing the duplicate inline symbol blobs reduced the
  bundle to 1.74 MB gzip, but the NET test then observed late symbol/token
  requests. The inline path was restored to preserve zero-runtime-network; the
  283 KB duplication remains a known cost.

Negative checks: `evaluateClassic` frozen-line tests and the stripped-verdict
resume test would fail before these changes. Current verification: **226 tests
passing** (193 package + 33 app), Chromium **10/10**, Firefox **10/10**, golden
**1/1 on Chromium, Firefox and WebKit**, `assets:verify` 73 files, perf **1.90 MB
gzip** of 3.00 MB. Still unproven: the axe browser audit (the jsdom "axe" test is
a no-op), coverage ≥85%, full WebKit journeys, and a real texture/projection
contract for `ui.dozer`/`ui.gutter`/`ui.lip`.

## Asset state

- 67 of 71 C-7 keys have locked real imagegen derivatives.
- Four remain generated placeholders: `glyph.uranium`, `vfx.coinburst`, `vfx.shock`,
  `vfx.spark`.
- `tools/assets build`: 71 keys / 67 locked / 4 placeholders.
- `tools/assets verify`: 73 files checked, deterministic rebuild matched.
- Output directory: 1,493,787 bytes (1.42 MiB), not packed atlases; the pipeline copies
  per-key files and records atlas labels/frames.
- Content item sprite keys were normalized to the canonical kebab-case catalog.
- Reel symbols remain inline as data URIs. Removing the duplicate-looking inline blobs was attempted in this pass, but the NET test then observed the symbol and token requests after gameplay began; the inline path is therefore retained to preserve the zero-runtime-network invariant. The 1.90 MB bundle includes that duplication.
- The UI is full-width at desktop with the slot cabinet and board using the available width. Panel/button chrome uses CSS `border-image` 9-slice frames (tight-cropped derivatives, fixed corners, fill center); the live reel grid sits inside the transparent window of the generated cabinet art. See `docs/UI-CHROME.md`. Shop, Compendium, Boss and Elevator use floor/item/boss art. The HUD, side panels, spin button and cabinet use generated panel/button/cabinet art, and the freeze badge uses `vfx.freeze`. The horizontal dozer/gutter/lip trims remain unplaced pending nine-slice/projection support; three VFX keys and `glyph.uranium` remain placeholders.

Handoff quality issues remain open: diamond token color, skull magnet, boss padding,
`chassis.harness-hyper` shape, UI nine-slicing, and the four missing clean cutouts.
The clean glyph and bezel refill candidates are integrated; the other refill sources
were rejected for haze or an unrelated character.

## Commands run

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            226 passing (193 package + 33 app-level)
pnpm sim:replay                      MATCH at cbb0ca4b92ac7a48e7a2847a (re-recorded fixture, 150 commands)
pnpm sim:hitrate                     40.6% PASS
pnpm assets:verify                   73 files PASS
pnpm perf                            1.90 MB gzip, PASS; sim tick 0.341 ms
pnpm exec playwright test --project=chromium  10 passed (after audit fixes)
pnpm exec playwright test e2e/golden.spec.ts --project=firefox  1 passed
pnpm exec playwright test e2e/golden.spec.ts --project=webkit   1 passed
pnpm exec playwright test e2e/network.spec.ts  3 projects PASS
hyperframes lint                     0 errors, warnings only
```

The WebKit run required a locally extracted `libevent-2.1` and
`LD_PRELOAD`/`LD_LIBRARY_PATH` because the host lacks the Playwright system dependency;
that environment workaround is not part of the repository.

## Not proven / release blockers

1. **Coverage:** no line-coverage measurement for the ≥85% requirement.
2. **WebKit J8 4×:** the sub-check is skipped after a measured 39.8% result; the other
   J8 checks and WebKit journeys pass.
3. **Assets:** six missing clean cutouts and the listed handoff quality issues; final
   art rights (H-2) are not established.
4. **Atlas packing:** no packed pixel atlases exist, so the 1.5 MB atlas limit is only
   approximated by the per-key output directory.
5. **Trailer:** still uses placeholder/vector art; no real-sprite re-render.
6. **Publishing:** H-1/H-3 remain owner decisions; no deploy, tag or release was made.

Owner approval is still required before any merge to `main`, tag, release, deployment,
or catalog/publishing change.
