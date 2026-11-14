# Final review — 2026-11-14

## Delivery

- `artifacts/trailer.mp4`: 24.000 seconds, 1,440 frames, 1920×1080, 60/1 fps.
- H.264 High, yuv420p, BT.709, one video stream and no audio streams.
- 4,134,775 bytes.
- SHA-256: `b47e7336d43cfc82557150a044c08bc31e79780fefaddc3c753b9faed0b1b2ca`.
- Full FFmpeg decode completed with no errors.

## Required checks

| Check | Result |
| --- | --- |
| `pnpm build` | Pass; external-GSAP ES library, declarations, embedded-font CSS. |
| `pnpm typecheck` | Pass with strict TypeScript, exact optional properties and unchecked-index guards. |
| `pnpm test` | 93/93 pass in real Chromium. |
| `pnpm lint` | Determinism guard + all ten HyperFrames composition lints pass, zero errors. |
| HyperFrames trailer check | Runtime, layout and contrast: zero errors and zero warnings. All 24 sampled text contrast checks pass. |
| `pnpm qa` | No page errors; trailer reverse seeking matches; tick scrubber and 4× playback complete; mobile cabinet fits. |

The static HyperFrames lint warnings concern editor organization: nested shot markup rather than separate sub-composition files. There is one per factory root and eight for the trailer. This is documented in README Merge notes. The intentional cabinet-header crossfade is marked as an allowed overlap. Craft/audio-style checks were not used as a gate because this is a deliberately silent, fixed-contract animation film with explicit holds.

## Seek and timing evidence

- All 14 fixtures, both motion variants: ten sample times, fresh direct seeks, forward, reverse, shuffled, and repeated-time DOM comparisons.
- Factories return paused timelines; no lazy DOM or tween construction.
- Reels land at 30/42/54/66/78 ticks as applicable, with settling complete in 5 ticks.
- Frozen-cell DOM remains fixed across stops. All six grid sizes tested.
- Ordered launch labels and visible detach transitions agree at tick 6 + 6×index; intersecting wins deduplicate cells.
- Reduced-motion variants have identical durations and no inline transforms at eleven samples.
- Cabinet sizes tested at 280, 390 and 720 px; mobile demo visually reviewed at 390 px.
- TimelinePlayer tested for start offset, backwards seek, pre-start clamp, terminal clamp, pausing, and once-per-play completion.

## Visual and encoded-media review

Inspected 13 source-trailer snapshots, desktop/mobile demo frames, standalone tumble and game-over frames. Corrected cabinet header overflow at 280 px, demo grid intrinsic-width clipping on mobile, and moving clone borders during tumble/drop.

Inspected 12 frames extracted from the final encoded MP4 (`artifacts/encoded-contact.jpg`) and all seven shot cuts at −1/0/+1 frame. Verified legible title/scene copy, the seven payline, independent reel motion, symbol drops, 5×4 weld, fever accents, Valenti dossier, Cryo doors, and the victory end card. Cut-frame captures are reproducible QA artifacts under ignored `artifacts/qa/`.

Headless browser playback reached the end with zero media errors and zero buffering waits. It presented 1,440 video frames and reported 4 dropped playback frames while the build/test tooling was running concurrently; the encoded file itself contains every frame. This was a headless playback check plus visual still-frame review, not a manual desktop watch-through.

Detailed media information: `artifacts/media-report.json`. Final HyperFrames report: `artifacts/hyperframes-check.json`. The original source and rendered output use the same factory modules.
