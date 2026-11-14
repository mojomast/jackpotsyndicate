import type { DesignTokens, SpriteResolver, SymbolId } from '../contracts-shim';
import { svgNode } from './dom';

export const defaultSpriteResolver: SpriteResolver = () => null;

function symbolShape(id: SymbolId, t: DesignTokens): string {
  const c = t.color;
  switch (id) {
    case 'diamond': return `<path d="M12 34 31 12H69L88 34 50 90Z" fill="${c.cyan}" stroke="#b9f5ff" stroke-width="3"/><path d="m12 34 38 56 18-56-18-22-19 22 19 56M12 34h76" fill="none" stroke="#d6faff" stroke-width="2"/><path d="M31 12 12 34h19Z" fill="#fff" opacity=".5"/>`;
    case 'cherry': return `<path d="M30 55Q37 20 59 13M69 55Q66 21 59 13" fill="none" stroke="${c.emerald}" stroke-width="5"/><path d="M59 14Q82 9 85 28 67 29 59 14" fill="${c.emerald}"/><circle cx="29" cy="64" r="22" fill="${c.crimson}" stroke="#ff9fb3" stroke-width="3"/><circle cx="72" cy="65" r="21" fill="${c.crimson}" stroke="#ff9fb3" stroke-width="3"/><path d="M16 58q2-10 12-10M60 59q2-9 11-9" fill="none" stroke="#ffe1e8" stroke-width="4" stroke-linecap="round"/>`;
    case 'uranium': return `<circle cx="50" cy="50" r="39" fill="#092b27" stroke="${c.emerald}" stroke-width="4"/><circle cx="50" cy="50" r="9" fill="${c.emerald}"/><path d="M42 36 28 12a42 42 0 0 1 44 0L58 36ZM65 49H93a42 42 0 0 1-22 38L57 63ZM35 49H7a42 42 0 0 0 22 38l14-24Z" fill="${c.emerald}"/><circle cx="50" cy="50" r="47" fill="none" stroke="#8ef5c9" stroke-width="1"/>`;
    case 'skull': return `<path d="M21 17 50 7 79 17 92 46 78 70v21H22V70L8 46Z" fill="#dce7f5" stroke="#fff" stroke-width="2"/><path d="m23 38 22 5-6 19-17-7ZM77 38l-22 5 6 19 17-7ZM50 59l8 14H42Z" fill="${c.obsidian}"/><path d="M33 77v14m17-14v14m17-14v14" stroke="${c.obsidian}" stroke-width="5"/><path d="m24 23 26-9 26 9" fill="none" stroke="#90a3bc" stroke-width="2"/>`;
    case 'seven': return `<path d="M13 12H88V32L57 90H28L61 36H13Z" fill="${c.crimson}" stroke="#ffcc99" stroke-width="4"/><path d="M21 20H79V27H21ZM45 51H79V65H37Z" fill="${c.gold}"/><path d="m34 82 28-46" stroke="#ff91b0" stroke-width="3"/>`;
  }
}

function portrait(key: string, t: DesignTokens): string {
  if (key === 'boss.zero') return `<path d="M50 8 89 39 77 80 50 96 23 80 11 39Z" fill="#0a2c42" stroke="${t.color.cyan}" stroke-width="2"/><path d="M25 34 15 10l22 17L50 3l13 24 22-17-10 24M27 45h17m12 0h17M38 72l12 7 12-7M50 30v30" fill="none" stroke="#bcefff" stroke-width="3"/>`;
  if (key === 'boss.auditor') return `<path d="M16 18 50 3 84 18 94 71 50 97 6 71Z" fill="#182331" stroke="${t.color.gold}" stroke-width="2"/><path d="M22 33h56v24H22Z" fill="${t.color.crimson}"/><path d="M28 44h13m18 0h13M29 69h42M39 77h22M50 4v20" stroke="#fff0cf" stroke-width="3"/>`;
  return `<path d="M23 98 31 71h38l8 27" fill="#273245" stroke="${t.color.gold}" stroke-width="2"/><path d="M30 30h40v26L60 74H40L30 56Z" fill="#344557" stroke="#e4c58b" stroke-width="2"/><path d="M17 38h66M27 32l6-22h34l6 22Z" fill="#0b101a" stroke="${t.color.gold}" stroke-width="3"/><path d="M35 49h10m10 0h10M44 63h12M46 80h8l3 18H43Z" stroke="${t.color.crimson}" stroke-width="3"/>`;
}

export function sprite(key: string, tokens: DesignTokens, resolver: SpriteResolver): SVGSVGElement {
  const node = svgNode('svg', 'sprite') as SVGSVGElement;
  node.classList.add('jsa-sprite'); node.setAttribute('aria-hidden', 'true');
  node.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const resolved = resolver(key);
  if (resolved) {
    const { url, x, y, w, h } = resolved;
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0) throw new Error('Invalid atlas region.');
    node.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    const image = svgNode('image', 'atlas-image'); image.setAttribute('href', url); node.append(image);
  } else {
    node.setAttribute('viewBox', '0 0 100 100');
    if (key.startsWith('symbol.')) node.innerHTML = symbolShape(key.slice(7) as SymbolId, tokens);
    else if (key.startsWith('boss.')) node.innerHTML = portrait(key, tokens);
    else {
      const color = key.includes('CRYO') ? tokens.color.cyan : key.includes('FOUNDRY') ? tokens.color.crimson : key.includes('PENTHOUSE') ? tokens.color.gold : tokens.color.emerald;
      node.innerHTML = `<path d="M0 0h100v100H0Z" fill="${tokens.color.obsidian}"/><path d="M0 100 50 47 100 100M0 0 50 47 100 0M0 25 50 47 100 25M0 75l50-28 50 28M25 0v100m50-100v100" stroke="${color}" stroke-width=".5" fill="none"/><path d="M36 25h28v55H36Z" fill="${tokens.color.panel}" stroke="${color}"/>`;
    }
  }
  node.dataset.key = key; return node;
}
