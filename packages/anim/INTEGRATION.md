# Animation package integration and verification

## Merge notes summary

- Adds only `packages/anim/**`, named `@jackpotsyndicate/anim`.
- Nine seekable GSAP factories, clock-free TimelinePlayer, responsive cabinet,
  reduced-motion variants, local vector placeholders, demo, ten HyperFrames
  compositions, 14 fixtures, 93 real-browser tests, and a rendered trailer.
- The self-contained shim matches shared CONTRACTS_REV 1: seven value/function
  exports and 18 types. There is no runtime import of the shared package.
- The package-local workspace boundary and lockfile permit an isolated install;
  no root install, root configuration, contracts, physics or tools changes.
- Three variable fonts and their OFL licence files are committed.
- Full export/params, anchor/factory, sprite-key, and shim comparison tables,
  commands, versions, deviations and known issues are in README Merge notes.

Foundation reviewed: `cf27769ee90f2a108697c8734fd60e31bfe1d9b5`.
Read before editing: root README, docs/CONTRACTS.md, docs/SPEC.md §2.11,
packages/contracts/src/constants.ts, presentation.ts and content.ts.

## Clean-clone verification — 2026-11-14

Cloned `anim/initial` from GitHub into a fresh directory with no node_modules or
generated output. Executable source revision: `a0f1313`. The subsequent commit
records this report only; it does not change executable files or dependencies.

```sh
git clone -b anim/initial https://github.com/mojomast/jackpotsyndicate verify
cd verify/packages/anim
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:check
pnpm demo
```

| Command / gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS**, 113 packages installed locally, no root node_modules created |
| `pnpm lint` | **PASS**, source determinism guard and all ten HyperFrames lints |
| `pnpm typecheck` | **PASS**, strict TypeScript |
| `pnpm test` | **PASS**, 93/93 Chromium-backed Vitest tests |
| `pnpm build` | **PASS**, Vite ES library, declarations and local-font CSS |
| `pnpm exec hyperframes lint .render/<name>` | **PASS** for reelSpin, lineWin, tumbleStep, gridRelayout, fever, bossIntro, floorTransition, victory, gameOver, trailer; these exact invocations run inside `pnpm lint` |
| `pnpm contracts:check` | **PASS**, seven values/functions and 18 exact type-equality checks |
| `pnpm demo` | **PASS**, scrubber page loaded in Chromium at localhost:5180 |
| `pnpm qa` | **PASS**, no page errors, tick scrubber, 4× playback completion, reverse-seek snapshots and 390px mobile fit |
| Root `git diff --stat origin/main...HEAD` | **PASS**, all 97 added files are under packages/anim/** |
| Public file review | **PASS**, all 97 added files reviewed; no credentials, .env, node_modules, build output or render caches included |

Toolchain: Node 22.19.0, pnpm 10.28.0, GSAP 3.15.1, HyperFrames 0.9.47,
TypeScript 7.0.2, Vite 8.3.8, Vitest 5.1.0, Chromium 152.0.7977.30,
FFmpeg 7.1.5-0+deb13u1.

## Trailer

Rendered and committed directly, no Git LFS. `artifacts/trailer.mp4` is
**4,134,775 bytes** (under 25 MB), 24.000 seconds, 1920×1080, 60fps, 1,440 frames,
H.264 yuv420p, silent. Full decode and encoded-frame review passed. SHA-256:
`b47e7336d43cfc82557150a044c08bc31e79780fefaddc3c753b9faed0b1b2ca`.

## Deviations, requests and known issues

No deviations from the mirrored repository contracts. Compatibility changes from
the first standalone version are the package name, shared generic TimelineFactory,
readonly DESIGN_TOKENS, ANIM_TICKS, numeric dimensions with runtime validation, and
required reducedMotion for tumble/relayout. Earlier helper aliases are retained.

The original task left intersecting-win order unspecified; lineWin deduplicates by
first occurrence. The integrator must give the orb plan that same cell order.

HyperFrames lint emits documented editor-organization advisories for nested
factory DOM (one per factory, eight for the trailer), with zero errors. The shared
live-game DOM is intentionally not duplicated as separate editor-authored tags.
No missing renderer dependency or other blocker prevented delivery.

**Requests for the integrator:** no outside-folder changes required for delivery.
The planned T-052 work should re-export shared declarations through the shim,
retain package-only helpers, import CSS, supply reducedMotion/atlas/bezel content,
and preserve orb order. If adopting a single root install later, reconcile the
package-local workspace boundary and lockfile deliberately.

After `anim-v1`, fixes must use `anim/fix-<topic>` pull requests scoped to
`packages/anim/**`; no direct main edits.
