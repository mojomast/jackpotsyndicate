/** Inline package-owned styles keep direct factory imports usable by Node hosts. */
export const REEL_STYLES = String.raw`
@property --jsa-light-hue{syntax:'<angle>';inherits:true;initial-value:0deg}
@property --jsa-light-intensity{syntax:'<number>';inherits:true;initial-value:.16}
@property --jsa-sweep-angle{syntax:'<angle>';inherits:true;initial-value:-24deg}
.jsa-root[data-reels-version="2"]{--jsa-brass:var(--brass-300,var(--jsa-gold));--jsa-pale:var(--brass-100,var(--jsa-gold));--jsa-accent:var(--jsa-cyan);--jsa-ink:var(--color-text,var(--jsa-gold))}
.jsa-root[data-reels-version="2"] .jsa-cell{padding:1.4%;border:0;background:none;perspective:650px}
.jsa-root[data-reels-version="2"] .jsa-symbol{min-width:0;min-height:0;transform-style:preserve-3d}
.jsa-root[data-reels-version="2"] .jsa-symbol>.jsa-sprite{width:100%;height:100%;max-width:100%;max-height:100%;filter:none}
.jsa-root[data-reels-version="2"] .jsa-reel-window{background:var(--jsa-obsidian);isolation:isolate;container-type:size}
.jsa-root[data-reels-version="2"] .jsa-cell-glow{inset:4%;border:1px solid var(--jsa-brass);border-radius:8%;box-shadow:inset 0 0 20px color-mix(in srgb,var(--jsa-brass) 24%,transparent);background:radial-gradient(ellipse,color-mix(in srgb,var(--jsa-brass) 22%,transparent),transparent 70%)}
.jsa-root[data-reels-version="2"] .jsa-drum-bed{position:absolute;top:0;height:100%;border-right:1px solid color-mix(in srgb,var(--jsa-brass) 48%,var(--jsa-panel));background:linear-gradient(90deg,var(--jsa-obsidian),color-mix(in srgb,var(--jsa-panel) 85%,var(--jsa-brass)) 49%,var(--jsa-obsidian));box-shadow:inset 0 1px 0 color-mix(in srgb,var(--jsa-brass) 55%,transparent)}
.jsa-root[data-reels-version="2"] .jsa-reel-divider{position:absolute;top:0;bottom:0;width:2px;margin-left:-2px;background:var(--jsa-pale);box-shadow:0 0 9px var(--jsa-brass);z-index:8}
.jsa-root[data-reels-version="2"] .jsa-streams{z-index:2;overflow:hidden}
.jsa-root[data-reels-version="2"] .jsa-reel-stream{position:absolute;top:0;height:100%;perspective:700px;perspective-origin:50% 50%;overflow:hidden}
.jsa-root[data-reels-version="2"] .jsa-reel-drum{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.jsa-root[data-reels-version="2"] .jsa-drum-facet{position:absolute;left:0;width:100%;padding:4% 10%;backface-visibility:hidden;transform-origin:50% 50%;display:grid;place-items:center;border-top:1px solid color-mix(in srgb,var(--jsa-brass) 8%,transparent)}
.jsa-root[data-reels-version="2"] .jsa-drum-facet>.jsa-sprite{width:100%;height:100%;filter:none}
.jsa-root[data-reels-version="2"] .jsa-echo{position:absolute;inset:0;mix-blend-mode:screen;pointer-events:none;opacity:0;will-change:transform,opacity}
.jsa-root[data-reels-version="2"] .jsa-echo-tile{position:absolute;left:0;width:100%;padding:4% 10%;display:grid;place-items:center}
.jsa-root[data-reels-version="2"] .jsa-light-rig{position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden}
.jsa-root[data-reels-version="2"] .jsa-ambient-light{position:absolute;inset:0;opacity:var(--jsa-light-intensity);filter:hue-rotate(var(--jsa-light-hue));background:linear-gradient(0deg,color-mix(in srgb,var(--jsa-accent) 70%,transparent),transparent 25%,transparent 70%,var(--jsa-accent));mix-blend-mode:screen}
.jsa-root[data-reels-version="2"] .jsa-glass-sweep{position:absolute;inset:-70%;opacity:.16;transform:rotate(var(--jsa-sweep-angle));background:linear-gradient(90deg,transparent 42%,color-mix(in srgb,var(--jsa-pale) 16%,transparent) 46%,var(--jsa-pale) 48%,transparent 49%,transparent 53%,color-mix(in srgb,var(--jsa-accent) 35%,transparent) 55%,transparent 58%);mix-blend-mode:screen}
.jsa-root[data-reels-version="2"] .jsa-curvature{position:absolute;inset:0;z-index:4;pointer-events:none;background:linear-gradient(var(--jsa-obsidian),transparent 19%,transparent 80%,var(--jsa-obsidian));opacity:.76;box-shadow:inset 0 0 12px var(--jsa-obsidian)}
.jsa-root[data-reels-version="2"] .jsa-scanlines{position:absolute;inset:0;z-index:9;pointer-events:none;opacity:.02;background:repeating-linear-gradient(0deg,transparent 0 2px,var(--jsa-brass) 2px 3px)}
.jsa-root[data-reels-version="2"] .jsa-tension{position:absolute;inset:0;opacity:0;background:linear-gradient(0deg,color-mix(in srgb,var(--jsa-accent) 42%,transparent),transparent 65%);mix-blend-mode:screen}
.jsa-root[data-reels-version="2"] .jsa-paylines{position:absolute;inset:0;width:100%;height:100%;z-index:6;pointer-events:none;filter:none;overflow:visible}
.jsa-root[data-reels-version="2"] .jsa-effects{position:absolute;inset:0;z-index:7;pointer-events:none}
.jsa-root[data-reels-version="2"] .jsa-bloom{position:absolute;inset:0;filter:blur(5px);mix-blend-mode:screen;opacity:0;pointer-events:none}
.jsa-root[data-reels-version="2"] .jsa-bloom .jsa-cell{border:0;background:none}
.jsa-root[data-reels-version="2"] .jsa-sheen{position:absolute;inset:8%;opacity:0;overflow:hidden;mask-image:radial-gradient(ellipse,var(--jsa-gold) 25%,transparent 68%);mix-blend-mode:screen;pointer-events:none}
.jsa-root[data-reels-version="2"] .jsa-sheen-light{position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,var(--jsa-pale) 49%,transparent 60%);will-change:transform}
.jsa-root[data-reels-version="2"] .jsa-particle{position:absolute;width:3px;height:7px;border:1px solid var(--jsa-pale);background:var(--jsa-brass);border-radius:1px;opacity:0;will-change:transform,opacity}
.jsa-root[data-reels-version="2"] .jsa-particle[data-kind="spark"]{width:2px;height:11px;border:0;background:var(--jsa-accent)}
.jsa-root[data-reels-version="2"] .jsa-win-tier{position:absolute;left:0;right:0;top:0;z-index:10;pointer-events:none;text-align:center;font:650 clamp(7px,2.3cqw,15px)/1.4 var(--jsa-font-mono);letter-spacing:.28em;color:var(--jsa-pale);background:linear-gradient(90deg,transparent,var(--jsa-obsidian),transparent);padding:1%}
.jsa-root[data-reels-version="2"] .jsa-rgb{position:absolute;inset:0;opacity:0;mix-blend-mode:screen;pointer-events:none}
.jsa-root[data-reels-version="2"] .jsa-rgb-red{filter:sepia(1) saturate(5) hue-rotate(300deg)}
.jsa-root[data-reels-version="2"] .jsa-rgb-cyan{filter:sepia(1) saturate(5) hue-rotate(140deg)}
.jsa-root[data-reels-version="2"] .jsa-effects>[data-anim="drop-symbol"],.jsa-root[data-reels-version="2"] .jsa-effects>[data-anim="tumble-symbol"]{background:none;border:0}
.jsa-root[data-reels-version="2"] .jsa-fragment{position:absolute;inset:0;clip-path:polygon(0 0,100% 0,50% 100%)}
.jsa-root[data-reels-version="2"][data-motion="reduced"] .jsa-scanlines,.jsa-root[data-reels-version="2"][data-motion="reduced"] .jsa-glass-sweep{display:none}
.jsa-root[data-reels-version="2"][data-motion="reduced"] .jsa-ambient-light{filter:none}
.jsa-root[data-reels-version="2"][data-motion="reduced"] [data-anim="sprite"]{filter:none!important}
.jsa-root[data-reels-version="2"][data-grain="false"] .jsa-scanlines{display:none}
`;

export function ensureReelStyles(): void {
  if (document.getElementById('jsa-reels-v2-styles')) return;
  const style = document.createElement('style'); style.id = 'jsa-reels-v2-styles'; style.textContent = REEL_STYLES; document.head.append(style);
}
