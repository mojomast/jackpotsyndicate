# Asset pipeline (T-040)

Deterministic asset resolver for the C-7 sprite contract. Every key in
`SPRITE_KEYS` plus the `trinket`, `drink`, `coin`, `chassis` and `glyph` item
families resolves either to a pinned assetrizz entry or to a generated vector
placeholder.

## Commands

```sh
pnpm exec tsx tools/assets/src/index.ts build
pnpm exec tsx tools/assets/src/index.ts verify
```

From the package directory:

```sh
pnpm -F @jackpotsyndicate/assets assets:build
pnpm -F @jackpotsyndicate/assets assets:verify
pnpm -F @jackpotsyndicate/assets test
```

Options:

- `--out DIR` writes outputs to `DIR` (default `apps/game/public/atlas`).
- `--manifest FILE` reads a pinned assetrizz manifest (default `assets/manifest.jsonl`).
- `--no-manifest` forces placeholders.
- `--style PACK` changes the configured style pack label.
- `--commit SHA` sets the provenance label used in `source`.

## Inputs

The pinned manifest is JSONL with one entry per line, or a JSON array / object
with an `assets` array:

```json
{"key":"symbol.diamond","path":"symbols/diamond.png","sha256":"<64 hex>","atlas":"symbols","frame":{"x":0,"y":0,"w":64,"h":64},"pivot":{"x":0.5,"y":0.5}}
```

Relative paths resolve from the manifest's directory. Every entry's SHA-256 is
checked against the bytes on disk; a mismatch fails the build. Keys absent from
the manifest, and every key when no manifest exists, use a generated SVG
placeholder. The default item catalog follows the 15 trinkets, 5 drinks, 4
coins, 7 chassis entries and 5 glyphs in spec 2.7; pass a custom `ItemCatalog`
to the library when content ids differ.

## Outputs

- `asset-manifest.json` — sorted, stable JSON where each value is either
  `{atlas, frame, pivot, source, sha256, file}` or
  `{placeholder: true, source, sha256, file}`.
- `placeholders/<key>.svg` — deterministic vector placeholders.
- `assets/<hash>-<name>` — byte copies of locked assets, used by verify.
- `contact-sheet.svg` — owner-review sheet covering every resolved key.

## Verification

`verify` rebuilds the full output into a temporary directory, compares every
file byte-for-byte with the existing output, and recomputes each manifest
SHA-256. It reads only local files: the build and verify paths never call the
network, and verification works offline against a committed output.
