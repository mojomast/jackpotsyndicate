import { TimelinePlayer, prefersReducedMotion } from '../src';
import type { FactoryName } from '../src';
import { fixtures, mount, names } from './catalog';
import './style.css';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><div class="brand">J<span>◆</span>S</div><div><p class="kicker">JACKPOT SYNDICATE</p><h1>Animation lab</h1></div><a href="/artifacts/">Watch trailer ↗</a></header>
<section class="controls"><label>Composition<select id="factory">${names.map(name => `<option>${name}</option>`).join('')}</select></label><label>Motion<select id="motion"><option value="full">Full motion</option><option value="reduced">Reduced motion</option></select></label><button id="toggle">Play</button><button id="reset">Restart</button><label>Simulation speed<select id="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></section>
<div class="stage-wrap"><div id="stage"></div><span class="stage-label">LIVE TIMELINE / 60 TICKS PER SECOND</span></div>
<section class="scrubber"><input id="tick" type="range" min="0" value="0" step="0.1" aria-label="Simulation tick"><output id="readout"></output></section>
<footer><p>One timeline. Any tick. Same frame.</p><p>Drag backwards, pause, or change speed. Animation only reveals the supplied fixture.</p></footer>`;
const stage = document.querySelector<HTMLElement>('#stage')!;
const selector = document.querySelector<HTMLSelectElement>('#factory')!;
const motion = document.querySelector<HTMLSelectElement>('#motion')!;
const speed = document.querySelector<HTMLSelectElement>('#speed')!;
const scrubber = document.querySelector<HTMLInputElement>('#tick')!;
const readout = document.querySelector<HTMLOutputElement>('#readout')!;
const toggle = document.querySelector<HTMLButtonElement>('#toggle')!;
let active = mount(stage, 'reelSpin', fixtures.reelSpin), tick = 0, playing = false;
const player = new TimelinePlayer(() => { playing = false; toggle.textContent = 'Play'; });
motion.value = prefersReducedMotion() ? 'reduced' : 'full';
function show() { player.syncToTick(tick); scrubber.value = String(tick); readout.textContent = `${tick.toFixed(1)} / ${(active.duration() * 60).toFixed(0)} ticks`; }
function rebuild() {
  player.stop(); active.kill(); const name = selector.value as FactoryName;
  stage.className = ['reelSpin', 'lineWin', 'tumbleStep', 'gridRelayout'].includes(name) ? 'cabinet-stage' : 'scene-stage';
  active = mount(stage, name, { ...fixtures[name], reducedMotion: motion.value === 'reduced' });
  tick = 0; playing = false; toggle.textContent = 'Play'; scrubber.max = String(active.duration() * 60);
  player.play(active, 0); show();
}
selector.addEventListener('change', rebuild); motion.addEventListener('change', rebuild);
toggle.addEventListener('click', () => { if (tick >= active.duration() * 60) { tick = 0; player.play(active, 0); } playing = !playing; toggle.textContent = playing ? 'Pause' : 'Play'; });
document.querySelector('#reset')!.addEventListener('click', rebuild);
scrubber.addEventListener('input', () => { playing = false; toggle.textContent = 'Play'; tick = Number(scrubber.value); show(); });
// The demo is the host simulation. The package itself owns no clock.
let last: number | undefined;
function frame(now: number) { if (last !== undefined && playing) { tick = Math.min(active.duration() * 60, tick + (now - last) / 1000 * 60 * Number(speed.value)); show(); } last = now; requestAnimationFrame(frame); }
rebuild(); requestAnimationFrame(frame);
