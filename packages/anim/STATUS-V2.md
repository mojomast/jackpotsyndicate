# Reel animation v2 — production checkpoint

- Branch: `anim/reels-v2`; owner review only, no merge.
- Runtime revision: `34a7573`; films and film QA: `4618809`.
- Verified exports: `artifacts/trailer.mp4` and `artifacts/reelShowcase.mp4`.
  Hashes and exact built-composition fingerprints: `artifacts/composition-qa-v2.json`.
- Root lint/typecheck/build and 258 tests pass. Animation typecheck, contracts,
  eleven composition lints and 113 browser tests pass. Network regression passes.
- Final isolated 5×4 benchmark: SVG 1× 3.015 ms/frame; SVG 4× 4.485 ms/frame;
  neither final SVG run had a >50 ms task. The 4× average remains over budget.
- Encoded-frame review, exact export-path PNG seeking, cut boundaries, full decode,
  frame counts and size checks completed. Films are intentionally silent.
- Production tumble captures refreshed with the complete cabinet visible on mobile.
- Production screenshots and continuous-spin recording refreshed. Recording:
  124 s, 1440×900, 30 fps, 3,720 frames, 8,792,922 bytes; complete decode passed.
- Review evidence and documentation are ready for the owner-review PR against
  `main`; all listed acceptance limitations are intentionally carried into review.
- Outstanding acceptance items: CLUSTER hand-off sequencing, live relayout host
  lifecycle, lever anchor, and the 4× stress budget. Details in `REVIEW-V2.md`.

All `.cache/` and `.render/` data belongs to this package's local production run.
Published review evidence is confined to `artifacts/review/` (PNG/MP4 only).
