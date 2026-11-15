/** @jsxRuntime automatic */
import { useMemo } from 'react';
import {
  buildDrawPlan,
  type DrawCommand,
} from '@jackpotsyndicate/board-render';
import type { GameCore, GameEvent, PhysicsEvent } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';

const EXIT_TYPES = new Set(['ChuteExit', 'LipDrop', 'GutterLoss', 'GutterBounce']);

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
        {plan.commands.map((command, index) => (
          <Command key={`${command.kind}-${index}`} command={command} index={index} />
        ))}
      </svg>
    </section>
  );
}
