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
| AC-2 lint/typecheck/test/coverage | **PARTIAL** | `pnpm lint` PASS; `pnpm typecheck` PASS; `pnpm test` **218 passing** (189 package + 29 app-level); line coverage ≥85% was not measured |
| AC-3 golden replay | **PASS** | `pnpm sim:replay` MATCH at `bade5e3091c269a205ccace5`; Playwright golden replay passes in Chromium, Firefox and WebKit |
| AC-4 E2E J1–J8 | **PARTIAL** | **29 passed, 1 skipped** across Chromium, Firefox and WebKit. The skip is the WebKit J8 4×-speed sub-check (measured 39.8%, target ≤30%, headless WebKit timer floor). NET passes on all three after inline symbol sprites |
| AC-5 rake | **PASS** | 10,000 spins/floor: Neon 17.0%, Cryo 22.7%, Foundry 12.0%, Penthouse 21.3%, all in band |
| AC-6 balance | **PASS** | 2,000 runs/bot: random-buyer Floor 1 51.8%, win 5.1%; greedy win 37.3%; max bankroll 38,982,203 (<1e12) |
| AC-7 hit rate | **PASS** | 40.6% over 5,000 evaluations, target 30–45% |
| AC-8 performance/bundle | **PASS** | stress scene: sim tick avg 0.382 ms, render frame avg 0.215 ms; bundle 1.72 MB gzip of 3.00 MB budget |
| AC-9 animation lint/trailer | **PARTIAL** | `hyperframes lint` exits 0 with warnings; trailer MP4 exists but still uses the animation package’s placeholder/vector art path, not a real-sprite re-render |
| AC-10 README/delivery | **PASS** | five-command quick start, architecture/content/balance/asset-credit docs, manual-dispatch-only deploy workflow; no publish step |

## Asset state

- 67 of 71 C-7 keys have locked real imagegen derivatives.
- Four remain generated placeholders: `glyph.uranium`, `vfx.coinburst`, `vfx.shock`,
  `vfx.spark`.
- `tools/assets build`: 71 keys / 67 locked / 4 placeholders.
- `tools/assets verify`: 73 files checked, deterministic rebuild matched.
- Output directory: 1,484,177 bytes (1.42 MiB), not packed atlases; the pipeline copies
  per-key files and records atlas labels/frames.
- Content item sprite keys were normalized to the canonical kebab-case catalog.
- Reel symbols are inlined as data URIs to satisfy the zero-network J1 requirement.
- The UI is full-width at desktop with the slot cabinet and board using the available width; Shop, Compendium, Boss and Elevator use floor/item/boss art. The HUD, side panels, spin button and cabinet use generated panel/button/cabinet art, and the freeze badge uses `vfx.freeze`. The horizontal dozer/gutter/lip trims remain unplaced pending nine-slice/projection support; three VFX keys and `glyph.uranium` remain placeholders.

Handoff quality issues remain open: diamond token color, skull magnet, boss padding,
`chassis.harness-hyper` shape, UI nine-slicing, and the four missing clean cutouts.
The clean glyph and bezel refill candidates are integrated; the other refill sources
were rejected for haze or an unrelated character.

## Commands run

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            218 passing (189 package + 29 app-level)
pnpm sim:replay                      MATCH at bade5e3091c269a205ccace5
pnpm sim:hitrate                     40.6% PASS
pnpm assets:verify                   73 files PASS
pnpm perf                            1.72 MB gzip, PASS
pnpm exec playwright test           29 passed, 1 skipped (WebKit J8 4×)
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
