import type { DesignTokens, GridSize, SpriteResolver, SymbolId } from '../contracts-shim';
import { SYMBOL_IDS } from '../contracts-shim';
import { anchor, anchors, applyTokens, cellAt, element, positionCell, svgNode, validateGrid, validateSize } from './dom';
import { sprite } from './sprites';
import { ensureReelStyles } from './reels.styles';

export function createCabinet(root: HTMLElement, size: GridSize, tokens: DesignTokens, sprites: SpriteResolver): void {
  validateSize(size); applyTokens(root, tokens); ensureReelStyles();
  root.dataset.reelsVersion = '2';
  const existingRail = root.querySelector<HTMLElement>('[data-anim="bezel-rail"]');
  const cabinet = element('section', 'cabinet', 'jsa-cabinet');
  cabinet.dataset.cols = String(size.cols); cabinet.dataset.rows = String(size.rows);
  const header = element('header', 'cabinet-header', 'jsa-cabinet-header');
  const title = element('span', 'cabinet-title'); title.textContent = 'SYNDICATE';
  const serial = element('span', 'cabinet-serial'); serial.textContent = `${size.cols} × ${size.rows} / VAULT SYSTEM`;
  header.append(title, serial);
  const window = element('div', 'reel-window', 'jsa-reel-window'); window.style.aspectRatio = `${size.cols} / ${size.rows}`;
  const grid = element('div', 'grid', 'jsa-layer');
  for (let col = 0; col < size.cols; col++) for (let row = 0; row < size.rows; row++) {
    const cell = element('div', 'cell', 'jsa-cell'); positionCell(cell, col, row, size);
    cell.dataset.col = String(col); cell.dataset.row = String(row);
    const face = element('div', 'symbol', 'jsa-symbol');
    const id = SYMBOL_IDS[(col * 2 + row) % SYMBOL_IDS.length]!;
    cell.dataset.symbol = id; face.append(sprite(`symbol.${id}`, tokens, sprites));
    const glow = element('div', 'cell-glow', 'jsa-cell-glow'); glow.style.opacity = '0';
    cell.append(glow, face); grid.append(cell);
  }
  const streams = element('div', 'reel-streams', 'jsa-layer jsa-streams');
  const overlay = svgNode('svg', 'payline-overlay') as SVGSVGElement;
  overlay.classList.add('jsa-paylines'); overlay.setAttribute('viewBox', '0 0 1000 1000'); overlay.setAttribute('preserveAspectRatio', 'none');
  overlay.setAttribute('aria-hidden', 'true');
  const effects = element('div', 'cell-effects', 'jsa-layer jsa-effects');
  const rig = element('div', 'light-rig', 'jsa-light-rig');
  rig.append(element('div', 'ambient-light', 'jsa-ambient-light'), element('div', 'glass-sweep', 'jsa-glass-sweep'));
  const ribs = element('div', 'reel-ribs', 'jsa-layer');
  for (let col = 0; col < size.cols; col++) {
    const bed = element('div', 'drum-bed', 'jsa-drum-bed');
    Object.assign(bed.style, { left: `${col * 100 / size.cols}%`, width: `${100 / size.cols}%` });
    const divider = element('div', 'reel-divider', 'jsa-reel-divider'); divider.dataset.col = String(col);
    divider.style.left = `${(col + 1) * 100 / size.cols}%`; divider.style.opacity = '0';
    ribs.append(bed, divider);
  }
  const curvature = element('div', 'curvature', 'jsa-curvature');
  const scanlines = element('div', 'scanlines', 'jsa-scanlines');
  const tier = element('div', 'win-tier', 'jsa-win-tier'); tier.style.opacity = '0';
  window.append(ribs, grid, streams, rig, curvature, overlay, effects, scanlines, tier);
  const rail = existingRail || element('div', 'bezel-rail', 'jsa-bezel-rail');
  const drops = element('div', 'drop-layer', 'jsa-layer jsa-drops');
  cabinet.append(header, window, rail); root.replaceChildren(cabinet, drops);
}

export function setCabinetGrid(root: HTMLElement, grid: SymbolId[][], tokens: DesignTokens, sprites: SpriteResolver): void {
  const cabinet = anchor(root, 'cabinet');
  const size = { cols: Number(cabinet.dataset.cols), rows: Number(cabinet.dataset.rows) } as GridSize;
  validateGrid(grid, size);
  grid.forEach((column, col) => column.forEach((id, row) => {
    const cell = cellAt(root, [col, row]); cell.dataset.symbol = id;
    anchor(cell, 'symbol').replaceChildren(sprite(`symbol.${id}`, tokens, sprites));
  }));
}

export function ensureCabinet(root: HTMLElement, size: GridSize, tokens: DesignTokens, sprites: SpriteResolver): void {
  const cabinet = root.querySelector<HTMLElement>('[data-anim="cabinet"]');
  if (!cabinet || Number(cabinet.dataset.cols) !== size.cols || Number(cabinet.dataset.rows) !== size.rows) createCabinet(root, size, tokens, sprites);
  for (const node of anchors(root, 'symbol')) { node.style.opacity = '1'; node.style.transform = ''; node.style.filter = ''; }
  for (const node of anchors(root, 'cell-glow')) node.style.opacity = '0';
}
