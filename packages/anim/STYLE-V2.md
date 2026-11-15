# Reel v2 — the illuminated vault mechanism

Art direction: machined brass ribs, concave obsidian drums, large jewel faces and a
restrained cyan glass reflection. Keep the host's measured cabinet aperture. The
slot reads as an illuminated mechanical instrument, not a flat icon grid.

Motion grammar: cock back → accelerate → coast → brake → contact → settle. Contact
is exactly 30+12c ticks. Cyan tension rises inside the final brake window; it never
adds time. Local brass divider lights latch on instead of strobing. Small wins use
one clean pop/sheen; big/mega add a luminous web and sparks; jackpot adds RGB edges.

Lighting: inherit the table brass/ink tokens, fall back to DESIGN_TOKENS. Floor
accent is emerald (Neon), cyan (Cryo), crimson (Foundry), gold (Penthouse). One
registered-property light rig drives a slow, low-contrast sweep and intensity.
Scanlines are subtle and optional; reduced motion omits moving/filtered layers.

Budget: max five spinning drum groups, two echo plates per drum, one overvolt
filter group, at most 48 particles. No canvas clock, stochastic callbacks,
animated layout dimensions or external media. Particle displacement is an
analytical function of seek time, with seeded constants sampled at construction.

Flash policy: no periodic on/off strobe. Stop highlights rise once and stay until
the collective settle; ambient intensity moves only between .16 and .24.
The win envelope is one rise/fall, including at 4× playback. Do not introduce
repeated bright flashes for overvolt or jackpot.

Showcase: 18 seconds, 1080p60, silent. 0–3 CLASSIC small; 3–6 HYPER/overvolt big;
6–9 WAYS mega; 9–12 jackpot; 12–14.5 near-miss; 14.5–16 CLUSTER dissolve/tumble;
16–18 cabinet fold/unfold to 5×4. Explicit editorial fixtures, same live factories.

Integration observations: the lever is part of a raster frame outside the factory
root; request a separable lever anchor. Existing CLUSTER orchestration delays orbs
until after all tumbles and replaces lineWin with tumbleStep. Preserve the engine
schedule and document the host orchestration limitation rather than retiming it.
