/**
 * Table cockpit stylesheet. Kept as a string module (rendered in a <style>
 * element by TableScreen) so the screen stays importable by the node-run app
 * tests, which cannot load .css files. Theme tokens come from tokens.css;
 * table-only variables are declared on `.table-screen` below.
 *
 * Every rule is scoped under `.table-screen` so it wins over the legacy shell
 * rules without `!important`.
 */
export const TABLE_CSS = String.raw`
.screen.table-screen {
  --t-gap: clamp(8px, 0.9vw, 14px);
  --t-gold: var(--color-gold, #fbbf24);
  --t-gold-hi: #fde68a;
  --t-gold-lo: #7c5a14;
  --t-cyan: var(--color-cyan, #06b6d4);
  --t-crimson: var(--color-crimson, #f43f5e);
  --t-emerald: var(--color-emerald, #10b981);
  --t-ink: #07090e;
  --t-glass: rgba(9, 12, 20, 0.86);
  --t-line: rgba(251, 191, 36, 0.22);
  --t-muted: #a3b1c6;
  --t-brass: var(--brass-gradient, linear-gradient(180deg, #fde68a 0%, #d6a23a 18%, #7c5a14 55%, #3b2a0a 100%));
  --t-spring: var(--ease-spring, cubic-bezier(.34, 1.56, .64, 1));
  --t-ease: var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: var(--t-gap);
  min-width: 0;
  height: var(--table-h, auto);
  min-height: 0;
  font-variant-numeric: tabular-nums;
}

/* --------------------------------------------------------------- top bar */
.table-screen .table-top {
  display: flex;
  gap: var(--t-gap);
  align-items: stretch;
  min-width: 0;
}

.table-screen .hud.ui9-panel {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: clamp(12px, 2vw, 34px);
  padding: 4px clamp(14px, 1.6vw, 26px);
  border-style: solid;
  border-color: transparent;
  border-width: 9px 14px;
  border-image-source: var(--ui9-panel);
  border-image-slice: 37 45 37 45 fill;
  border-image-width: 9px 14px;
  border-image-repeat: stretch;
  background: rgba(7, 9, 14, 0.55);
  border-radius: 0;
  box-shadow: none;
}

.table-screen .hud-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  gap: 1px;
}

.table-screen .hud-kicker {
  color: var(--t-muted);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1.2;
  text-transform: uppercase;
  white-space: nowrap;
}

.table-screen .hud-value,
.table-screen .hud-floor-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(1.05rem, 1.45vw, 1.55rem);
  line-height: 1.05;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.table-screen .hud-floor-name {
  color: var(--t-emerald);
  text-shadow: 0 0 18px rgba(16, 185, 129, 0.35);
}

.table-screen .hud-value.gold { color: var(--t-gold); text-shadow: 0 0 22px rgba(251, 191, 36, 0.35); }
.table-screen .hud-value.cyan { color: #22d3ee; }
.table-screen .hud-value.crimson { color: #fb7185; }

.table-screen .hud-bank .hud-value {
  font-size: clamp(1.3rem, 1.9vw, 2rem);
  display: inline-block;
  transform-origin: left center;
}

.table-screen .hud-bank.is-up-a .hud-value,
.table-screen .hud-bank.is-up-b .hud-value { animation: t-bank-up 700ms var(--t-spring); }
.table-screen .hud-bank.is-up-b .hud-value { animation-name: t-bank-up-b; }
.table-screen .hud-bank.is-down-a .hud-value,
.table-screen .hud-bank.is-down-b .hud-value { animation: t-bank-down 520ms ease-out; }
.table-screen .hud-bank.is-down-b .hud-value { animation-name: t-bank-down-b; }

.table-screen .hud-quota,
.table-screen .hud-fever {
  flex: 1 1 160px;
  max-width: 300px;
  gap: 5px;
}

.table-screen .hud-quota-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.table-screen .hud-quota .hud-value,
.table-screen .hud-fever .hud-value { font-size: clamp(0.95rem, 1.1vw, 1.15rem); }

.table-screen .hud-meter {
  position: relative;
  height: 8px;
  border-radius: 99px;
  background: rgba(148, 163, 184, 0.14);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(251, 191, 36, 0.16);
  overflow: hidden;
}

.table-screen .hud-meter-fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  border-radius: inherit;
  transition: transform 650ms var(--t-ease);
}

.table-screen .hud-quota-meter .hud-meter-fill {
  background: linear-gradient(90deg, #0e7490, #22d3ee 70%, #a5f3fc);
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
}

.table-screen .hud[data-quota-met='true'] .hud-quota-meter .hud-meter-fill {
  background: linear-gradient(90deg, #047857, #10b981 60%, #a7f3d0);
  box-shadow: 0 0 14px rgba(16, 185, 129, 0.75);
}

.table-screen .hud[data-quota-met='true'] .hud-quota .hud-kicker { color: #6ee7b7; }

.table-screen .hud-fever-meter .hud-meter-fill {
  background: linear-gradient(90deg, #9f1239, #f43f5e 55%, #fbbf24);
  box-shadow: 0 0 12px rgba(244, 63, 94, 0.6);
}

.table-screen .hud[data-fever-hot='true'] .hud-fever-meter {
  animation: t-fever-hot 900ms ease-in-out infinite alternate;
}

.table-screen .hud-spins-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-screen .hud-pips {
  display: flex;
  gap: 4px;
}

.table-screen .hud-pips i {
  width: 9px;
  height: 14px;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.16);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.22);
  transition: background 300ms ease, box-shadow 300ms ease;
}

.table-screen .hud-pips i.on {
  background: linear-gradient(180deg, #fde68a, #f59e0b);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.55);
}

.table-screen .hud-spins.is-pulse-a .hud-pips,
.table-screen .hud-spins.is-pulse-b .hud-pips { animation: t-pips 420ms ease-out; }
.table-screen .hud-spins.is-pulse-b .hud-pips { animation-name: t-pips-b; }

.table-screen .hud-seed {
  align-items: flex-end;
  text-align: right;
}

.table-screen .hud-roundcash {
  font-family: var(--font-display);
  font-weight: 700;
  color: #e2e8f0;
  font-size: 0.98rem;
}

.table-screen .hud-seed-text {
  color: var(--t-muted);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.table-screen .hud-seed-text strong { color: #e2e8f0; font-weight: 600; }

.table-screen .freeze-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px 3px 3px;
  border-radius: 99px;
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(125, 211, 252, 0.4);
  color: #bae6fd;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  white-space: nowrap;
}

.table-screen .freeze-chip-art { width: 22px; height: 22px; object-fit: contain; }

/* ------------------------------------------------------------- event log */
.table-screen .log-panel {
  position: relative;
  flex: 0 0 clamp(190px, 17vw, 290px);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--t-line);
  border-radius: 12px;
  background: var(--t-glass);
  min-width: 0;
  box-shadow: none;
}

.table-screen .log-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(6, 182, 212, 0.45);
  background: rgba(6, 182, 212, 0.1);
  color: #a5f3fc;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.table-screen .log-toggle b { color: #fff; font-weight: 700; }
.table-screen .log-toggle[aria-expanded='true'] { background: rgba(6, 182, 212, 0.24); }

.table-screen .log-ticker {
  min-width: 0;
  color: var(--t-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table-screen .log-drawer {
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  right: 0;
  width: min(420px, 92vw);
  max-height: min(60vh, 520px);
  padding: 8px;
  border: 1px solid var(--t-line);
  border-radius: 12px;
  background: rgba(7, 9, 14, 0.97);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  display: flex;
}

.table-screen .log-drawer[hidden] { display: none; }

.table-screen .log-drawer .log {
  margin: 0;
  padding: 0 4px 0 0;
  list-style: none;
  overflow: auto;
  max-height: calc(min(60vh, 520px) - 16px);
  width: 100%;
}

/* ------------------------------------------------------------------ hero */
.table-screen .table-hero-wrap {
  min-width: 0;
  min-height: 0;
  container-type: size;
}

/* Column widths follow the hero height (cabinet 365:343, board 664:540 plus
   its frame padding) so the pair stays together and centred at any aspect. */
.table-screen .table-hero {
  position: relative;
  height: 100%;
  display: grid;
  grid-template-columns:
    minmax(0, calc(100cqh * 365 / 343))
    minmax(0, calc((100cqh - 20px) * 664 / 540 + 20px))
    clamp(58px, 4.6vw, 76px);
  justify-content: center;
  gap: clamp(10px, 1.4vw, 26px);
  min-height: 0;
  align-items: stretch;
}

.table-screen .table-cabinet-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.table-screen .cabinet-fit {
  flex: 1 1 0;
  min-height: 0;
  container-type: size;
  display: grid;
  place-items: center;
}

.table-screen .cabinet-shell {
  position: relative;
  width: min(100cqw, calc(100cqh * 365 / 343));
  aspect-ratio: 365 / 343;
}

.table-screen .slot-frame { position: relative; width: 100%; aspect-ratio: 365 / 343; min-width: 0; }
.table-screen .slot-frame-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; z-index: 0; filter: drop-shadow(0 22px 40px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 28px rgba(251, 191, 36, 0.12)); }
.table-screen .slot-frame-window { position: absolute; left: 12.6%; top: 25.7%; width: 71.8%; height: 44.3%; display: flex; align-items: center; justify-content: center; overflow: hidden; z-index: 1; border-radius: 4px; box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.9); }
.table-screen .slot-frame-window .table-cabinet { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.table-screen .slot-frame-window .jsa-root { width: 100%; height: 100%; }
.table-screen .slot-frame-window .jsa-cabinet { position: absolute; inset: 0; width: auto; height: auto; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; display: flex; align-items: center; justify-content: center; }
.table-screen .slot-frame-window .jsa-cabinet-header,
.table-screen .slot-frame-window .jsa-bezel-rail { display: none; }
.table-screen .slot-frame-window .jsa-reel-window { width: 100% !important; height: 100% !important; max-width: none; aspect-ratio: auto !important; border: 0; border-radius: 0; box-shadow: none; background: radial-gradient(ellipse at 50% 40%, #121a2b, #05070c 75%); }
.table-screen .slot-frame-window::after { content: ''; position: absolute; inset: 0; z-index: 5; pointer-events: none; background: linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent 16%, transparent 84%, rgba(0, 0, 0, 0.55)), linear-gradient(105deg, rgba(255, 255, 255, 0.07), transparent 30%); }

.table-screen .jsa-root { position: relative; isolation: isolate; color: #e9eef5; }
.table-screen .jsa-root * { box-sizing: border-box; }
.table-screen .jsa-cabinet { position: relative; width: 100%; padding: 3.3%; border: 1px solid #8e702c; border-radius: 18px; background: linear-gradient(125deg, #30343b, #101521 22%, #0b1019 65%, #3d3123); box-shadow: inset 0 0 0 7px #151c29, 0 18px 70px #0009; }
.table-screen .jsa-cabinet-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 1% 1% 3.4%; color: #fbbf24; font-family: var(--font-display); font-weight: 700; letter-spacing: .18em; }
.table-screen .jsa-reel-window { position: relative; width: 100%; background: #07090e; border: 2px solid #5b4729; border-radius: 6px; box-shadow: inset 0 0 25px #000; overflow: hidden; }
.table-screen .jsa-layer { position: absolute; inset: 0; pointer-events: none; }
.table-screen .jsa-cell { position: absolute; padding: 3%; border: 1px solid rgba(91, 71, 41, 0.45); display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); place-items: center; background: radial-gradient(ellipse at 50% 30%, rgba(40, 56, 84, 0.55), transparent 78%); }
.table-screen .jsa-symbol { width: 100%; height: 100%; min-height: 0; position: relative; display: grid; place-items: center; }
.table-screen .jsa-sprite { display: block; width: 100%; height: 100%; overflow: hidden; }
.table-screen .jsa-symbol > .jsa-sprite { width: auto; height: 100%; max-width: 100%; max-height: 100%; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.75)); }
.table-screen .jsa-cell-glow { position: absolute; inset: 4%; border: 2px solid #fbbf24; border-radius: 12%; box-shadow: 0 0 22px rgba(251, 191, 36, 0.65), inset 0 0 18px rgba(251, 191, 36, 0.35); background: radial-gradient(ellipse, rgba(251, 191, 36, 0.22), rgba(251, 191, 36, 0.04) 70%); }
.table-screen .jsa-streams { z-index: 2; overflow: hidden; }
.table-screen .jsa-reel-stream { position: absolute; top: 0; height: 100%; }
.table-screen .jsa-stream-symbol { position: absolute; width: 100%; padding: 12%; display: grid; place-items: center; }
.table-screen .jsa-duration { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
.table-screen .jsa-bezel-rail { min-height: 12px; margin-top: 3.4%; border: 1px solid #594727; border-radius: 3px; background: linear-gradient(90deg, #0a111c, #233047, #0a111c); }
.table-screen .jsa-relayout-previous { position: absolute; left: 0; top: 0; pointer-events: none; }
.table-screen [data-anim='win-path'] { filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.9)); }

.table-screen [data-anim='cell'].is-drain { animation: t-drain 1.1s ease-out; }
.table-screen [data-anim='cell'].is-drain::after { content: '−$'; position: absolute; top: 4%; right: 8%; font: 800 0.8rem/1 var(--font-display); color: #fb7185; text-shadow: 0 0 8px #f43f5e; }
@keyframes t-drain { 0%, 60% { box-shadow: inset 0 0 0 2px #f43f5e, inset 0 0 26px rgba(244, 63, 94, 0.7); } 100% { box-shadow: none; } }

/* diegetic cabinet base readouts */
.table-screen .cabinet-console {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  container-type: inline-size;
}

.table-screen .cabinet-plate {
  position: absolute;
  top: 80.6%;
  width: 17%;
  height: 9.6%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4%;
  padding: 0 2%;
  color: #fde68a;
  text-align: center;
}

.table-screen .cabinet-plate-left { left: 10.6%; }
.table-screen .cabinet-plate-right { right: 12.6%; }

.table-screen .cabinet-plate-art {
  width: 30%;
  flex: 0 0 auto;
  aspect-ratio: 1;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
}

.table-screen .cabinet-plate small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: max(9px, 2.1cqw);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fef3c7;
  text-shadow: 0 1px 2px #000;
}

.table-screen .cabinet-plate-empty { opacity: 0.75; }

.table-screen .cabinet-led {
  position: absolute;
  left: 31.4%;
  width: 36%;
  top: 85.6%;
  height: 7.4%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  background: radial-gradient(ellipse at 50% 50%, rgba(16, 24, 18, 0.95), rgba(3, 5, 4, 0.98));
  box-shadow: inset 0 0 8px #000, 0 0 0 1px rgba(0, 0, 0, 0.6);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: max(9px, 2.5cqw);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: #fbbf24;
  text-shadow: 0 0 6px rgba(251, 191, 36, 0.9), 0 0 14px rgba(251, 191, 36, 0.4);
  animation: t-led-in 260ms ease-out;
}

.table-screen .cabinet-led.tone-win { color: #fde68a; }
.table-screen .cabinet-led.tone-cash { color: #6ee7b7; text-shadow: 0 0 6px rgba(16, 185, 129, 0.95), 0 0 14px rgba(16, 185, 129, 0.45); }
.table-screen .cabinet-led.tone-loss { color: #fb7185; text-shadow: 0 0 6px rgba(244, 63, 94, 0.95), 0 0 14px rgba(244, 63, 94, 0.45); }
.table-screen .cabinet-led.tone-idle { color: #94a3b8; text-shadow: none; }

/* fever scene overlay (packages/anim) */
.table-screen .fever-overlay {
  position: absolute;
  left: 12.6%;
  top: 25.7%;
  width: 71.8%;
  height: 44.3%;
  z-index: 3;
  pointer-events: none;
  overflow: hidden;
  container-type: inline-size;
  visibility: hidden;
}

.table-screen .fever-overlay[data-active='true'] { visibility: visible; }
.table-screen .fever-overlay .jsa-scene { position: absolute; inset: 0; overflow: hidden; container-type: inline-size; background: rgba(10, 6, 14, 0.72); color: #fff; }
.table-screen .fever-overlay .jsa-scene-grid { position: absolute; inset: 0; opacity: .3; background-image: linear-gradient(rgba(244, 63, 94, .12) 1px, transparent 1px), linear-gradient(90deg, rgba(244, 63, 94, .12) 1px, transparent 1px); background-size: 6cqw 6cqw; }
.table-screen .fever-overlay .jsa-scene-orbit { position: absolute; inset: 8% 24%; border: 1px solid #f43f5e; border-radius: 50%; }
.table-screen .fever-overlay .jsa-scene-edge { position: absolute; inset: 5%; border-top: 1px solid rgba(251, 191, 36, .4); border-bottom: 1px solid rgba(251, 191, 36, .4); }
.table-screen .fever-overlay .jsa-centered { position: absolute; inset: 6%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; z-index: 3; }
.table-screen .fever-overlay .jsa-eyebrow { margin: 0 0 2cqw; font: 600 2.6cqw/1.4 var(--font-mono); letter-spacing: .22em; color: #fbbf24; }
.table-screen .fever-overlay .jsa-giant { margin: 0; font: 900 italic 24cqw/.85 var(--font-display); letter-spacing: -.05em; color: #fbbf24; text-shadow: 0 0 6cqw rgba(244, 63, 94, .65); }
.table-screen .fever-overlay .jsa-mono { margin: 1.5cqw 0 0; font: 600 2.4cqw/1.4 var(--font-mono); letter-spacing: .16em; color: #fecdd3; }
.table-screen .fever-overlay .jsa-fever-bars { position: absolute; inset: 12% 0; display: flex; flex-direction: column; justify-content: space-between; opacity: .5; }
.table-screen .fever-overlay .jsa-fever-bar { height: 5%; background: linear-gradient(90deg, #f43f5e, transparent 35%, transparent 65%, #06b6d4); transform-origin: left center; }

/* -------------------------------------------------------------- the board */
.table-screen .table-board {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 10px;
  container-type: size;
  display: grid;
  place-items: center;
}

.table-screen .board-frame {
  position: relative;
  width: min(100cqw, calc(100cqh * 664 / 540));
  aspect-ratio: 664 / 540;
  border-radius: 14px;
  box-shadow:
    0 0 0 1px #2a1d06,
    0 0 0 3px #b8892b,
    0 0 0 4px #fde68a66,
    0 0 0 8px #0b0d13,
    0 0 0 9px #6b4e14,
    0 24px 60px rgba(0, 0, 0, 0.75),
    0 0 60px rgba(6, 182, 212, 0.1);
}

.table-screen .board-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 14px;
  background: #05060a;
}

.table-screen .board-backdrop {
  position: absolute;
  left: -4%;
  top: -4%;
  width: 108%;
  height: 62%;
  object-fit: cover;
  object-position: 50% 30%;
  filter: blur(5px) brightness(0.5) saturate(0.85);
  opacity: 0.9;
}

.table-screen .board-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 70% 45% at 50% 24%, transparent 40%, rgba(5, 6, 10, 0.75) 100%);
}

.table-screen .board-scene { position: absolute; inset: 0; }
.table-screen .board-scene canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.table-screen .table-board-svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }

.table-screen .board-counters {
  position: absolute;
  z-index: 4;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  pointer-events: none;
}

.table-screen .board-counter {
  padding: 3px 10px;
  border-radius: 99px;
  background: rgba(5, 7, 12, 0.78);
  border: 1px solid rgba(251, 191, 36, 0.28);
  color: var(--t-muted);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.table-screen .board-counter b { color: #fef3c7; font-weight: 700; }
.table-screen .board-counter em { color: #67e8f9; font-style: normal; }

/* ---------------------------------------------------------- trinket rail */
.table-screen .trinket-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 6px;
  border-radius: 14px;
  border: 1px solid var(--t-line);
  background: linear-gradient(180deg, rgba(18, 24, 38, 0.8), rgba(7, 9, 14, 0.9));
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.6);
}

.table-screen .trinket-panel-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--t-muted);
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.table-screen .trinket-panel-label b { color: var(--t-gold); font-size: 0.9rem; font-family: var(--font-display); }

.table-screen .trinket-rail {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 0;
  overflow: visible;
  width: 100%;
}

.table-screen .trinket-chip {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(42px, 3.4vw, 56px);
  aspect-ratio: 1;
  padding: 0;
  border-radius: 50%;
  border: 0;
  background: radial-gradient(circle at 40% 35%, #1f2937, #07090e 70%);
  box-shadow: 0 0 0 2px #7c5a14, 0 0 0 3px rgba(253, 230, 138, 0.5), 0 6px 14px rgba(0, 0, 0, 0.6);
  outline: none;
  cursor: help;
  flex: 0 0 auto;
}

.table-screen .trinket-chip:focus-visible { box-shadow: 0 0 0 2px #7c5a14, 0 0 0 4px var(--t-cyan), 0 6px 14px rgba(0, 0, 0, 0.6); }
.table-screen .trinket-icon { display: grid; place-items: center; width: 80%; height: 80%; }
.table-screen .trinket-art { width: 100%; height: 100%; object-fit: contain; border-radius: 0; }
.table-screen .trinket-icon .sprite-fallback { font-family: var(--font-display); font-weight: 800; color: var(--t-gold); font-size: 0.9rem; }

.table-screen .trinket-copy {
  position: absolute;
  right: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 60;
  width: 220px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--t-line);
  background: rgba(7, 9, 14, 0.97);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  gap: 3px;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 120ms ease;
  text-align: left;
}

.table-screen .trinket-chip:hover .trinket-copy,
.table-screen .trinket-chip:focus-visible .trinket-copy {
  opacity: 1;
  visibility: visible;
}

.table-screen .trinket-name { color: var(--t-gold); font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; }
.table-screen .trinket-effect { color: #cbd5e1; font-size: 0.78rem; line-height: 1.35; }

.table-screen .trinket-empty {
  color: var(--t-muted);
  font-size: 0.66rem;
  line-height: 1.3;
  text-align: center;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  letter-spacing: 0.08em;
  padding: 0;
  border: 0;
  background: none;
}

/* --------------------------------------------------------------- console */
.table-screen .table-console {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
  gap: var(--t-gap);
  align-items: stretch;
  min-width: 0;
}

.table-screen .prep-tray {
  position: relative;
  display: flex;
  align-items: center;
  gap: clamp(10px, 1.2vw, 18px);
  padding: 8px 14px;
  border-radius: 14px;
  border: 1px solid var(--t-line);
  background: linear-gradient(180deg, rgba(18, 24, 38, 0.92), rgba(9, 12, 20, 0.95));
  box-shadow: inset 0 1px 0 rgba(253, 230, 138, 0.08);
  min-width: 0;
}

.table-screen .prep-tray[data-locked='true'] .prep-group { opacity: 0.62; }

.table-screen .prep-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  transition: opacity 200ms ease;
}

.table-screen .prep-group-label {
  color: var(--t-muted);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.table-screen .prep-options { display: flex; gap: 6px; flex-wrap: nowrap; }

.table-screen .prep-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  max-width: 150px;
  padding: 4px 10px 4px 5px;
  border-radius: 99px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(148, 163, 184, 0.07);
  color: #e2e8f0;
  font-size: 0.76rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, transform 90ms ease;
}

.table-screen .prep-chip > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.table-screen .prep-chip:hover:not(:disabled) { border-color: rgba(251, 191, 36, 0.6); background: rgba(251, 191, 36, 0.08); }
.table-screen .prep-chip:active:not(:disabled) { transform: translateY(1px); }
.table-screen .prep-chip[aria-pressed='true'] { border-color: var(--t-gold); background: rgba(251, 191, 36, 0.14); color: #fef3c7; box-shadow: var(--glow-gold, 0 0 14px rgba(251, 191, 36, 0.28)); }
.table-screen .prep-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.table-screen .prep-chip.is-empty { justify-content: center; width: 38px; padding: 0; color: var(--t-muted); border-style: dashed; }
.table-screen .prep-chip.is-empty .prep-chip-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.table-screen .prep-chip-art { width: 28px; height: 28px; object-fit: contain; flex: 0 0 auto; }
.table-screen .prep-chip .sprite-fallback { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: rgba(251, 191, 36, 0.14); color: var(--t-gold); font-weight: 800; }
.table-screen .prep-slot-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(148, 163, 184, 0.25); }
.table-screen .prep-drink .prep-chip-text { max-width: 96px; overflow: hidden; text-overflow: ellipsis; }

.table-screen .prep-active { color: #6ee7b7; font-family: var(--font-mono); font-size: 0.64rem; white-space: nowrap; }

.table-screen .prep-select {
  min-height: 38px;
  min-width: 112px;
  padding: 6px 30px 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(6, 182, 212, 0.4);
  background: rgba(6, 182, 212, 0.08) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%2367e8f9'/></svg>") no-repeat right 10px center;
  color: #cffafe;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  appearance: none;
  cursor: pointer;
}

.table-screen .prep-select:disabled { opacity: 0.5; cursor: not-allowed; }
.table-screen .prep-select option { background: #0f1420; color: #e2e8f0; }

.table-screen .prep-feedback {
  position: absolute;
  left: 14px;
  bottom: calc(100% + 6px);
  margin: 0;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(7, 9, 14, 0.92);
  border: 1px solid var(--t-line);
  color: #fef3c7;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  white-space: nowrap;
  pointer-events: none;
  animation: t-toast 2.4s ease forwards;
}

/* cascade: the scoring bridge between slot and board */
.table-screen .cascade {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: safe center;
  gap: clamp(3px, 0.45vw, 10px);
  padding: 8px clamp(10px, 1.2vw, 18px);
  border-radius: 14px;
  border: 1px solid var(--t-line);
  background:
    radial-gradient(ellipse at 50% 120%, rgba(251, 191, 36, 0.12), transparent 60%),
    linear-gradient(180deg, rgba(18, 24, 38, 0.92), rgba(7, 9, 14, 0.96));
  min-width: 0;
  overflow: hidden;
}

.table-screen .cascade-term,
.table-screen .cascade-total,
.table-screen .cascade-lip {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-width: clamp(44px, 3.8vw, 76px);
  padding: 4px clamp(5px, 0.6vw, 12px);
  border-radius: 10px;
  border: 0;
  background: none;
}

.table-screen .cascade-term small,
.table-screen .cascade-total small,
.table-screen .cascade-lip small {
  color: rgba(255, 255, 255, 0.78);
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}

.table-screen .cascade-term b,
.table-screen .cascade-total b,
.table-screen .cascade-lip b {
  display: block;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: clamp(1.05rem, 1.55vw, 1.7rem);
  line-height: 1.05;
  color: #fff;
  white-space: nowrap;
}

.table-screen .cascade-chips { background: linear-gradient(180deg, #0891b2, #0e4f63); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 18px rgba(6, 182, 212, 0.25); }
.table-screen .cascade-mult { background: linear-gradient(180deg, #e11d48, #6b0f24); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 18px rgba(244, 63, 94, 0.25); }
.table-screen .cascade-xmult { background: linear-gradient(180deg, #9f1239, #3f0716); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18); }
.table-screen .cascade-drop { background: linear-gradient(180deg, #047857, #022c22); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18); }
.table-screen .cascade-op { color: rgba(253, 230, 138, 0.8); font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; }
.table-screen .cascade-eq { color: var(--t-gold); font-size: 1.4rem; }

.table-screen .cascade-total {
  min-width: clamp(90px, 9vw, 150px);
  background: linear-gradient(180deg, rgba(251, 191, 36, 0.2), rgba(120, 81, 14, 0.25));
  box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.55), 0 0 22px rgba(251, 191, 36, 0.18);
}

.table-screen .cascade-total small { color: #fde68a; }
.table-screen .cascade-total b { color: var(--t-gold); font-size: clamp(1.3rem, 2vw, 2.15rem); text-shadow: 0 0 18px rgba(251, 191, 36, 0.55); }
.table-screen .cascade-total { margin-left: 0; margin-right: 0; }
.table-screen .cascade-lip { margin-left: clamp(4px, 1vw, 18px); padding-left: 12px; border-left: 1px solid rgba(148, 163, 184, 0.18); border-radius: 0; }
.table-screen .cascade-lip b { color: #6ee7b7; font-size: clamp(1rem, 1.3vw, 1.4rem); }

.table-screen .cascade .is-punch-a { animation: t-punch-a 520ms var(--t-spring); }
.table-screen .cascade .is-punch-b { animation: t-punch-b 520ms var(--t-spring); }
.table-screen .cascade .cascade-total.is-punch-a,
.table-screen .cascade .cascade-total.is-punch-b { animation-delay: 380ms; animation-fill-mode: both; }
.table-screen .cascade.cascade-big .cascade-total { box-shadow: inset 0 0 0 1px #fde68a, 0 0 34px rgba(251, 191, 36, 0.55); }
.table-screen .cascade.cascade-mega .cascade-total { box-shadow: inset 0 0 0 2px #fff7d6, 0 0 48px rgba(251, 191, 36, 0.85); }
.table-screen .cascade.cascade-mega::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255, 247, 214, 0.18) 50%, transparent 70%);
  animation: t-sheen 1.4s ease-in-out infinite;
  pointer-events: none;
}

/* spin deck */
.table-screen .spin-deck {
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  column-gap: 12px;
  row-gap: 4px;
  align-items: center;
  padding: 6px 12px 6px 6px;
  border-radius: 16px;
  border: 1px solid var(--t-line);
  background: linear-gradient(180deg, rgba(18, 24, 38, 0.92), rgba(7, 9, 14, 0.96));
}

.table-screen .hud-spin.ui9-button {
  grid-row: 1 / span 2;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  min-width: clamp(176px, 15vw, 250px);
  min-height: clamp(64px, 7.4vh, 84px);
  padding: 0 18px;
  background: none;
  box-shadow: none;
  font-family: var(--font-display);
  cursor: pointer;
  transition: transform 90ms ease, filter 160ms ease;
}

.table-screen .hud-spin-label {
  font-size: clamp(1.45rem, 2.1vw, 2.15rem);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #fde68a;
  text-shadow: 0 0 2px #fff7d6, 0 0 14px rgba(251, 191, 36, 0.85), 0 0 30px rgba(245, 158, 11, 0.45), 0 2px 0 #78350f;
}

.table-screen .hud-spin-hint {
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #a5f3fc;
}

.table-screen .hud-spin[data-ready='true'] { animation: t-spin-ready 1.8s ease-in-out infinite; }
.table-screen .hud-spin.ui9-button:hover:not(:disabled) { filter: brightness(1.15) drop-shadow(0 0 16px rgba(251, 191, 36, 0.5)); animation: none; }
.table-screen .hud-spin.ui9-button:active:not(:disabled) { transform: translateY(2px) scale(0.98); }
.table-screen .hud-spin.ui9-button:disabled { opacity: 1; cursor: progress; filter: saturate(0.4) brightness(0.8); }
.table-screen .hud-spin.ui9-button:disabled .hud-spin-label { font-size: clamp(1rem, 1.4vw, 1.4rem); color: #cbd5e1; text-shadow: 0 1px 0 #000; }
.table-screen .hud-spin.ui9-button:focus-visible { outline: 3px solid var(--t-cyan); outline-offset: 3px; }

.table-screen .spin-lamps {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.table-screen .spin-lamps li {
  display: flex;
  align-items: center;
  gap: 4px;
  color: rgba(163, 177, 198, 0.75);
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.table-screen .spin-lamps i { width: 7px; height: 7px; border-radius: 50%; background: #1e293b; box-shadow: inset 0 0 0 1px #334155; }
.table-screen .spin-lamps li.on { color: #fef3c7; }
.table-screen .spin-lamps li.on i { background: var(--t-gold); box-shadow: 0 0 8px var(--t-gold), 0 0 2px #fff; }
.table-screen .spin-deck[data-phase='RESOLVING'] .spin-lamps li.on i { background: var(--t-cyan); box-shadow: 0 0 8px var(--t-cyan); }

.table-screen .speed-panel {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}

.table-screen .speed-label { color: var(--t-muted); font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; }
.table-screen .speed-group { display: flex; gap: 0; border-radius: 8px; overflow: hidden; border: 1px solid rgba(148, 163, 184, 0.28); }
.table-screen .speed-btn {
  min-width: 38px;
  min-height: 28px;
  padding: 2px 8px;
  border: 0;
  border-right: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(148, 163, 184, 0.06);
  color: #cbd5e1;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.table-screen .speed-btn:last-child { border-right: 0; }
.table-screen .speed-btn[aria-pressed='true'] { background: rgba(251, 191, 36, 0.2); color: #fde68a; }
.table-screen .speed-btn:focus-visible { outline: 2px solid var(--t-cyan); outline-offset: -2px; }

/* ------------------------------------------------------------------ juice */
.table-screen[data-flash='big'] .table-hero { animation: t-shake-a 520ms cubic-bezier(.36, .07, .19, .97); }
.table-screen[data-flash='big'][data-flash-id='1'] .table-hero { animation-name: t-shake-b; }
.table-screen[data-flash='mega'] .table-hero { animation: t-shake-big 760ms cubic-bezier(.36, .07, .19, .97); }
.table-screen[data-flash='fever']::after {
  content: '';
  position: absolute;
  inset: -6px;
  z-index: 30;
  pointer-events: none;
  border-radius: 18px;
  box-shadow: inset 0 0 0 2px rgba(244, 63, 94, 0.8), inset 0 0 80px rgba(244, 63, 94, 0.35), inset 0 0 160px rgba(6, 182, 212, 0.18);
  animation: t-fever 2.4s ease-out forwards;
}
.table-screen[data-flash='fever'] .hud-fever .hud-value { animation: t-punch-a 600ms var(--t-spring) 2; }
.table-screen[data-reduced-motion='true'] .table-hero { animation: none; }

@keyframes t-bank-up { 0% { transform: scale(1); color: #fff; } 30% { transform: scale(1.18); color: #bbf7d0; text-shadow: 0 0 26px rgba(16, 185, 129, 0.9); } 100% { transform: scale(1); } }
@keyframes t-bank-up-b { 0% { transform: scale(1); color: #fff; } 30% { transform: scale(1.18); color: #bbf7d0; text-shadow: 0 0 26px rgba(16, 185, 129, 0.9); } 100% { transform: scale(1); } }
@keyframes t-bank-down { 0% { color: #fb7185; transform: translateX(-3px); } 40% { transform: translateX(3px); } 100% { transform: none; } }
@keyframes t-bank-down-b { 0% { color: #fb7185; transform: translateX(-3px); } 40% { transform: translateX(3px); } 100% { transform: none; } }
@keyframes t-pips { 0% { transform: scale(1.25); filter: brightness(2); } 100% { transform: none; filter: none; } }
@keyframes t-pips-b { 0% { transform: scale(1.25); filter: brightness(2); } 100% { transform: none; filter: none; } }
@keyframes t-punch-a { 0% { transform: scale(1); } 25% { transform: scale(1.22); filter: brightness(1.6); } 100% { transform: scale(1); filter: none; } }
@keyframes t-punch-b { 0% { transform: scale(1); } 25% { transform: scale(1.22); filter: brightness(1.6); } 100% { transform: scale(1); filter: none; } }
@keyframes t-sheen { 0% { transform: translateX(-60%); } 100% { transform: translateX(60%); } }
@keyframes t-spin-ready { 0%, 100% { filter: drop-shadow(0 0 0 rgba(251, 191, 36, 0)); } 50% { filter: drop-shadow(0 0 14px rgba(251, 191, 36, 0.55)); } }
@keyframes t-led-in { 0% { opacity: 0; letter-spacing: 0.4em; } 100% { opacity: 1; } }
@keyframes t-toast { 0% { opacity: 0; transform: translateY(4px); } 10%, 80% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes t-fever-hot { 0% { box-shadow: inset 0 1px 2px rgba(0,0,0,.8), 0 0 0 1px rgba(244, 63, 94, .3); } 100% { box-shadow: inset 0 1px 2px rgba(0,0,0,.8), 0 0 12px 1px rgba(244, 63, 94, .8); } }
@keyframes t-fever { 0% { opacity: 0; } 8% { opacity: 1; } 70% { opacity: .8; } 100% { opacity: 0; } }
@keyframes t-shake-a { 10%, 90% { transform: translate(-1px, 0); } 20%, 80% { transform: translate(3px, -1px); } 30%, 50%, 70% { transform: translate(-5px, 1px); } 40%, 60% { transform: translate(5px, -1px); } }
@keyframes t-shake-b { 10%, 90% { transform: translate(1px, 0); } 20%, 80% { transform: translate(-3px, 1px); } 30%, 50%, 70% { transform: translate(5px, -1px); } 40%, 60% { transform: translate(-5px, 1px); } }
@keyframes t-shake-big { 10%, 90% { transform: translate(-2px, 1px) rotate(-0.2deg); } 20%, 80% { transform: translate(5px, -2px); } 30%, 50%, 70% { transform: translate(-8px, 2px) rotate(0.25deg); } 40%, 60% { transform: translate(8px, -2px); } }

/* ------------------------------------------------- medium desktop tuning */
@media (min-width: 1024px) and (max-width: 1599px) {
  .table-screen .cascade-lip { display: none; }
  .table-screen .cascade-total { min-width: clamp(80px, 7vw, 120px); }
}

@media (min-width: 1024px) and (max-width: 1360px) {
  .table-screen .prep-chip > span:last-child,
  .table-screen .prep-chip-text { display: none; }
  .table-screen .prep-chip { padding: 4px; max-width: none; }
  .table-screen .hud-seed .hud-kicker,
  .table-screen .hud-roundcash { display: none; }
}

@media (min-width: 1024px) and (max-height: 760px) {
  .table-screen .hud-pips i { height: 11px; }
  .table-screen .hud-spin.ui9-button { min-height: 58px; }
}

/* ----------------------------------------------------- stacked (< 1024px) */
@media (max-width: 1023.98px) {
  .screen.table-screen {
    height: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .table-screen .table-top { display: contents; }
  .table-screen .hud.ui9-panel { order: 0; }
  .table-screen .hud.ui9-panel {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 14px;
    padding: 6px 12px;
  }
  .table-screen .hud-quota,
  .table-screen .hud-fever { max-width: none; }
  .table-screen .hud-seed { align-items: flex-start; text-align: left; }
  .table-screen .log-panel { flex: none; order: 9; }
  .table-screen .log-drawer { top: auto; bottom: calc(100% + 6px); left: 0; right: auto; }
  .table-screen .table-hero-wrap,
  .table-screen .table-hero,
  .table-screen .table-console { display: contents; }
  .table-screen .table-cabinet-col { order: 1; }
  .table-screen .cascade { order: 2; flex-wrap: wrap; }
  .table-screen .spin-deck { order: 3; position: sticky; bottom: max(8px, env(safe-area-inset-bottom)); z-index: 20; justify-content: center; box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.6); background: rgba(9, 12, 20, 0.96); }
  .table-screen .table-board { order: 4; container-type: normal; height: auto; padding: 8px; }
  .table-screen .board-frame { width: 100%; }
  .table-screen .prep-tray { order: 5; flex-wrap: wrap; }
  .table-screen .trinket-panel { order: 6; flex-direction: row; align-items: center; padding: 8px 10px; }
  .table-screen .trinket-panel-label { flex-direction: row; gap: 6px; }
  .table-screen .trinket-rail { flex-direction: row; overflow-x: auto; overflow-y: visible; padding: 4px; }
  .table-screen .trinket-empty { writing-mode: horizontal-tb; transform: none; }
  .table-screen .table-top { order: 0; }
  .table-screen .cabinet-fit { container-type: normal; flex: none; display: block; }
  .table-screen .cabinet-shell { width: min(100%, 560px); margin: 0 auto; }
  .table-screen .trinket-copy { right: auto; left: 0; top: auto; bottom: calc(100% + 8px); transform: none; }
}

@media (max-width: 640px) {
  .table-screen .hud.ui9-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .table-screen .hud-quota,
  .table-screen .hud-fever { grid-column: span 2; }
  .table-screen .cascade { gap: 4px; padding: 6px; }
  .table-screen .cascade-op { font-size: 0.85rem; }
  .table-screen .cascade-term,
  .table-screen .cascade-total { padding: 4px 6px; }
  .table-screen .cascade-lip { margin-left: 0; border-left: 0; }
  .table-screen .spin-deck { grid-template-columns: 1fr; padding: 6px; }
  .table-screen .hud-spin.ui9-button { grid-row: auto; width: 100%; min-height: 64px; }
  .table-screen .spin-lamps { display: none; }
  .table-screen .speed-panel { justify-content: center; }
  .table-screen .speed-btn { min-height: 44px; min-width: 52px; }
  .table-screen .prep-chip,
  .table-screen .prep-select,
  .table-screen .log-toggle { min-height: 44px; }
  .table-screen .prep-options { flex-wrap: wrap; }
  .table-screen .board-counters { top: 6px; }
}
`;
