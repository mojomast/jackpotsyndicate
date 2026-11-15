# Image-generation brief — Jackpot Syndicate sprites

**Status:** **67 of 71** C-7 logical sprite keys have locked generated assets; **4** remain generated placeholders (`glyph.uranium`, `vfx.coinburst`, `vfx.shock`, `vfx.spark`). The game is fully playable; these four are the remaining art gaps.

This brief is ready to hand to an image-generation agent. The machine-readable request is [`assets/imagegen-keys.json`](imagegen-keys.json).

## What to generate

Generate one image per logical key, using the **exact filename** `assets/imagegen/<key>.png` (dots are part of the name). Start with the **P0** set; it is the art needed for the table, board, bosses and shell. P1 is the shop/compendium inventory art.

| Group | Count | Output size | Alpha | Priority |
|---|---:|---|---|---|
| Symbols: `symbol.*` | 6 | 512×512 | transparent | P0 |
| Tokens: `token.*` | 7 | 256×256 | transparent | P0 |
| Pegs: `peg.*` | 4 | 128×128 | transparent | P0 |
| Boss portraits: `boss.*` | 3 | 1024×1024 | transparent | P0 |
| Floor plates: `floor.*.bg` | 4 | 1920×1080 | opaque | P0 |
| UI pieces: `ui.*` | 7 | 1024×1024 | transparent | P0 |
| VFX: `vfx.*` | 4 | 512×512 | transparent | P0 |
| Trinkets: `trinket.*` | 15 | 512×512 | transparent | P1 |
| Drinks: `drink.*` | 5 | 512×512 | transparent | P1 |
| Coins: `coin.*` | 4 | 512×512 | transparent | P1 |
| Chassis modules: `chassis.*` | 7 | 512×512 | transparent | P1 |
| Glyph upgrades: `glyph.*` | 5 | 512×512 | transparent | P1 |

**Total: 71 images — 35 P0 + 36 P1.**

## Art direction

- **Style pack:** `obsidian-noir` — dark casino underworld, gold `#fbbf24`, cyan `#06b6d4`, crimson `#f43f5e`, emerald `#10b981`, obsidian `#07090e`.
- Semi-realistic 2.5D game art with crisp silhouettes; readable at small sizes. The board is seen at a slight perspective; icons should face the camera.
- Consistent single light direction and material language across all assets. Metal, chrome, enamel, neon glass and dark wood.
- Boss portraits use **invented fictional faces only** — absolutely no real people or likenesses.
- No text, labels, logos, watermarks or signatures baked into any image. The game supplies all copy.
- No casino-brand trademarks. Invented symbols and machine parts only.
- Play-money fantasy; no realistic gambling UI screenshots.

## Per-group prompts

The JSON file has a prompt for every key. The short form:

- **Symbols:** one centered casino reel symbol — Blood Diamond, Splitter Cherry, Uranium-235, Magnet Skull, Overclocked Seven, Scrap Orb. Strong silhouette, dark background-free cutout.
- **Tokens:** physical metal/enamel casino tokens with the matching symbol or material — diamond, cherry, uranium, skull, bullion, copper, ice. Slight 3/4 top view, readable coin face.
- **Pegs:** gold, splitter, bumper, golden. Small front-view pachinko hardware; splitter visibly forks.
- **Bosses:** Don Valenti, Madame Zero, The Iron Auditor. Waist-up noir portraits, theatrical crime-boss styling, dramatic rim light, transparent cutout.
- **Floors:** Neon, Cryo, Foundry, Penthouse. Full-bleed 16:9 background plates with an empty central play area. No characters, no UI, no text. These should feel like four distinct casino floors in the same underworld.
- **UI:** cabinet frame, bezel trim, dozer blade, pusher lip, gutter rail, panel, ornate button. Textures/objects with clean edges; panel and button should tolerate cropping or nine-slicing.
- **VFX:** spark burst, coin burst, shockwave, frost burst. Bright additive-friendly core, soft falloff, transparent background.
- **Items:** trinket/drink/coin/chassis/glyph inventory icons; one object per image, centered, readable at 96 px.

## Delivery format

1. PNGs at the stated sizes. `alpha: true` means a real alpha channel with transparent padding; do not deliver a checkerboard or a baked background.
2. Keep the subject centered with 8–12% transparent padding.
3. Keep the original high-resolution source if you generate one, but deliver the stated export size.
4. Put files under `assets/imagegen/` with the exact logical key as the filename.
5. Include a contact sheet or zip with the batch; do not rename keys.
6. If a generation cannot make a clean transparent cutout, deliver the source and flag it rather than faking transparency.

The coordinator will hash the files, build the assetrizz-format manifest, pack atlases and run `tools/assets verify`. Final atlas output must be **≤ 1.5 MB total**, so highly detailed floor plates may need optimised exports or reduced dimensions; flag any asset that cannot fit rather than silently degrading it.

## Suggested batches

1. **P0-A — table MVP (24 assets):** all 6 symbols, 7 tokens, 4 pegs, 7 UI pieces.
2. **P0-B — scenes (11 assets):** 3 boss portraits, 4 floor plates, 4 VFX.
3. **P1-A — shop (24 assets):** 15 trinkets, 5 drinks, 4 coins.
4. **P1-B — upgrades (12 assets):** 7 chassis, 5 glyphs.

P0-A and P0-B are enough to replace the visible placeholders in the table build. P1 can land while T-072/T-073 are being wired.

## Not needed from imagegen

- Audio/SFX — synthesized with WebAudio.
- Fonts — self-hosted design tokens already exist.
- Trailer MP4 — rendered from the game/animation package, not generated as a flat video.
- UI copy, logos or store art — not part of the C-7 sprite contract.

## Acceptance checklist

- [ ] All 71 logical keys have a file at the exact path.
- [ ] P0 assets have transparent alpha and clean edges.
- [ ] All four floors are visually distinct and have no baked UI/text.
- [ ] Boss faces are invented; no real-person likeness.
- [ ] No text/watermarks/signatures.
- [ ] Contact sheet reviewed for style consistency.
- [ ] Coordinator has run `tools/assets build` and `tools/assets verify` and reported the real/placeholder counts.

Until those images arrive, the existing generated placeholders remain the honest fallback; they are not final art.
