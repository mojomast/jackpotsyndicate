# Jackpot Syndicate sprite handoff — working batch

Status: 65 of 71 requested filenames have working PNG exports. These are not locked final assets. Six are missing clean transparent exports: ui.bezel, vfx.coinburst, vfx.shock, vfx.spark, glyph.blood-diamond and glyph.uranium. Generated sources for these are in the sources folder; repeated generation and background-removal edits retained background haze.

Review of contact sheet: the palette and materials are broadly consistent; the four floors are distinct. The diamond token is cyan rather than blood red, and the skull token lacks the magnet. Their revised sources have background haze and need clean cutouts. Boss portraits have tight framing and lack the requested padding. The chassis harness-hyper resembles a wearable harness rather than a machine part. UI cropping and nine-slicing need a practical test. Check all edges, padding and small-size legibility in the game before locking.

The 65 PNG files total 44,113,734 bytes before atlas packing. This is not an atlas-size measurement. The 1.5 MB final atlas limit has not been verified and likely requires substantial optimization or revised dimensions; do not assume it will fit. The generated floors were resized to 1920x1080 from smaller sources.

The repository and its tools are not present in this workspace. tools/assets build and verify were not run; actual real/placeholder counts are unknown. The working PNGs have not been installed into the game. File presence, dimensions, and transparent padding are not a substitute for project verification.
