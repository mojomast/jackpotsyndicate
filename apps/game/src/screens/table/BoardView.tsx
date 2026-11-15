/** @jsxRuntime automatic */
import { useMemo } from 'react';
import {
  buildDrawPlan,
  projectPoint,
  type DrawCommand,
} from '@jackpotsyndicate/board-render';
import type { GameCore, GameEvent, PhysicsEvent } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import assetManifest from '../../../public/atlas/asset-manifest.json';
import {
  spriteAssetFromManifest,
  type SpriteManifest,
} from '../../store/spriteResolver';

const MANIFEST = assetManifest as SpriteManifest;
const EXIT_TYPES = new Set(['ChuteExit', 'LipDrop', 'GutterLoss', 'GutterBounce']);

const TOKEN_SPRITE: Record<string, string> = {
  diamond: 'token.diamond',
  cherry: 'token.cherry',
  uranium: 'token.uranium',
  skull: 'token.skull',
  seven: 'token.bullion',
  scrap: 'token.copper',
  ice: 'token.ice',
};

const ORB_SPRITE: Record<string, string> = {
  diamond: 'symbol.diamond',
  cherry: 'symbol.cherry',
  uranium: 'symbol.uranium',
  skull: 'symbol.skull',
  seven: 'symbol.seven',
  scrap: 'symbol.scrap',
};

function spriteUrl(key: string | null | undefined): string | null {
  return key ? spriteAssetFromManifest(MANIFEST, key)?.url ?? null : null;
}


function physicsEvents(events: readonly GameEvent[]): PhysicsEvent[] {
  return events.filter((event) => EXIT_TYPES.has(event.t)).slice(-24) as PhysicsEvent[];
}

function styleOf(command: DrawCommand): Record<string, string | number> {
  const style: Record<string, string | number> = {};
  if ('fill' in command && command.fill) {
    style.fill = command.fill.color;
    if (command.fill.alpha !== undefined) style.fillOpacity = command.fill.alpha;
  } else {
    style.fill = 'none';
  }
  if ('stroke' in command && command.stroke) {
    style.stroke = command.stroke.color;
    style.strokeWidth = command.stroke.width ?? 1;
    if (command.stroke.alpha !== undefined) style.strokeOpacity = command.stroke.alpha;
  }
  return style;
}

function Command({ command, index }: { command: DrawCommand; index: number }) {
  const style = styleOf(command);
  switch (command.kind) {
    case 'rect':
      return (
        <rect
          key={index}
          x={command.x}
          y={command.y}
          width={command.w}
          height={command.h}
          rx={command.radius ?? 0}
          style={style}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          key={index}
          cx={command.x}
          cy={command.y}
          rx={command.rx}
          ry={command.ry}
          transform={command.rotation ? `rotate(${(command.rotation * 180) / Math.PI} ${command.x} ${command.y})` : undefined}
          style={style}
        />
      );
    case 'circle':
      return <circle key={index} cx={command.x} cy={command.y} r={command.r} style={style} />;
    case 'polygon': {
      const points: string[] = [];
      for (let i = 0; i < command.points.length; i += 2) {
        points.push(`${command.points[i]},${command.points[i + 1]}`);
      }
      return <polygon key={index} points={points.join(' ')} style={style} />;
    }
    case 'line':
      return (
        <line
          key={index}
          x1={command.x1}
          y1={command.y1}
          x2={command.x2}
          y2={command.y2}
          style={style}
        />
      );
    case 'text':
      return (
        <text
          key={index}
          x={command.x}
          y={command.y}
          fill={command.color}
          fontSize={command.size}
          textAnchor={command.align === 'center' ? 'middle' : command.align === 'right' ? 'end' : 'start'}
        >
          {command.text}
        </text>
      );
    default:
      return null;
  }
}

export interface BoardViewProps {
  core: GameCore;
  floorId: string;
  gutterRisk: number;
}

/**
 * T-071 board plan rendered as an SVG surface. The deterministic DrawPlan is
 * the renderer's own output; this adapter keeps the Table testable in jsdom
 * while the Pixi adapter remains available for GPU hosts.
 */
export function BoardView({ core, floorId, gutterRisk }: BoardViewProps) {
  const tick = useGameStore((store) => Math.floor(store.state.tick / 2));
  const events = useGameStore((store) => store.events);

  const plan = useMemo(() => {
    const snapshot = core.getSimSnapshot();
    return buildDrawPlan(snapshot, {
      gutterRisk,
      floorId,
      events: physicsEvents(events),
      vfxTick: snapshot.tick,
    });
  }, [core, tick, floorId, gutterRisk, events]);

  const floorArt = spriteUrl(`floor.${floorId}.bg`);
  const tokenArt = plan.tokens
    .map((token) => ({ id: token.id, url: spriteUrl(TOKEN_SPRITE[token.symbolId]), token }))
    .filter((entry): entry is { id: number; url: string; token: (typeof plan.tokens)[number] } => entry.url !== null);
  const orbArt = plan.orbs
    .map((orb) => ({ id: orb.id, url: spriteUrl(ORB_SPRITE[orb.symbolId]), orb }))
    .filter((entry): entry is { id: number; url: string; orb: (typeof plan.orbs)[number] } => entry.url !== null);
  const pegArt = plan.pegs
    .map((peg) => ({ id: peg.id, url: spriteUrl(`peg.${peg.kind}`), peg }))
    .filter((entry): entry is { id: number; url: string; peg: (typeof plan.pegs)[number] } => entry.url !== null);

  const useTokenSprites = plan.tokens.length > 0 && tokenArt.length === plan.tokens.length;
  const useOrbSprites = plan.orbs.length > 0 && orbArt.length === plan.orbs.length;
  const usePegSprites = plan.pegs.length > 0 && pegArt.length === plan.pegs.length;

  const commands = plan.commands.filter((command) => {
    if (useTokenSprites && command.layer === 'tokens') return false;
    if (useOrbSprites && command.layer === 'orbs') return false;
    if (usePegSprites && command.layer === 'pegs') return false;
    return true;
  });
  const backdropCommands = commands.filter(
    (command) => command.layer === 'background' || command.layer === 'pinfield',
  );
  const foregroundCommands = commands.filter(
    (command) => command.layer !== 'background' && command.layer !== 'pinfield',
  );

  return (
    <section className="table-board panel" data-testid="board" aria-label="Pinfield and coin pusher board">
      <div className="table-board-heading">
        <span>Board</span>
        <span>{plan.orbs.length} orbs · {plan.tokens.length} tokens</span>
      </div>
      <svg
        className="table-board-svg"
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        role="img"
        aria-label="Live pinfield and shelf"
        data-board-tick={plan.tick}
      >
        {backdropCommands.map((command, index) => (
          <Command key={`${command.kind}-${index}`} command={command} index={index} />
        ))}
        {floorArt ? (
          <image
            className="table-board-floor"
            href={floorArt}
            x={0}
            y={0}
            width={plan.width}
            height={plan.height}
            preserveAspectRatio="xMidYMid slice"
            opacity={0.34}
            aria-hidden="true"
          />
        ) : null}
        {foregroundCommands.map((command, index) => (
          <Command key={`${command.kind}-${index}`} command={command} index={index} />
        ))}
        <g className="table-board-sprites" aria-hidden="true">
          {usePegSprites
            ? pegArt.map(({ id, url, peg }) => {
                const point = projectPoint(peg.x, peg.y);
                const size = peg.radius * point.scale * 2;
                return (
                  <image
                    key={`peg-${id}`}
                    href={url}
                    x={point.x - size / 2}
                    y={point.y - size / 2}
                    width={size}
                    height={size}
                    preserveAspectRatio="xMidYMid meet"
                  />
                );
              })
            : null}
          {useOrbSprites
            ? orbArt.map(({ id, url, orb }) => {
                const point = projectPoint(orb.x, orb.y);
                const size = orb.radius * point.scale * 2;
                return (
                  <image
                    key={`orb-${id}`}
                    href={url}
                    x={point.x - size / 2}
                    y={point.y - size / 2}
                    width={size}
                    height={size}
                    preserveAspectRatio="xMidYMid meet"
                  />
                );
              })
            : null}
          {useTokenSprites
            ? tokenArt.map(({ id, url, token }) => (
                <image
                  key={`token-${id}`}
                  href={url}
                  x={token.screen.x - token.rx}
                  y={token.screen.y - token.rx}
                  width={token.rx * 2}
                  height={token.rx * 2}
                  preserveAspectRatio="xMidYMid meet"
                />
              ))
            : null}
        </g>
      </svg>
    </section>
  );
}
