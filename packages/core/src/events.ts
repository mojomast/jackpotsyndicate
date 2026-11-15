/**
 * C-2 event bus.
 *
 * The core emits every engine and physics event through one bus so consumers
 * (UI, audio, animation) see exactly the same ordered stream. Events are
 * stamped with the core tick; physics events arrive unstamped and are stamped
 * at the boundary.
 */
import type { EngineEvent, GameEvent, PhysicsEvent } from '@jackpotsyndicate/contracts';

export type AnySimEvent = EngineEvent | PhysicsEvent;
export type EventListener = (event: GameEvent) => void;

function eventTick(event: AnySimEvent): number | undefined {
  const value = (event as { tick?: unknown }).tick;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Stamp an event with `tick` unless it already carries a numeric tick. */
export function stampEvent(event: AnySimEvent, tick: number): GameEvent {
  const existing = eventTick(event);
  return { ...event, tick: existing ?? tick } as GameEvent;
}

/**
 * Ordered event queue with optional live subscribers. `drain()` is what
 * `GameCore.tick()` returns; subscribers receive the same events immediately.
 */
export class EventBus {
  private readonly queue: GameEvent[] = [];
  private readonly listeners = new Set<EventListener>();
  private readonly log: GameEvent[] = [];

  emit(event: AnySimEvent, tick: number): GameEvent {
    const stamped = stampEvent(event, tick);
    this.queue.push(stamped);
    this.log.push(stamped);
    for (const listener of [...this.listeners]) listener(stamped);
    return stamped;
  }

  publish(event: AnySimEvent, tick: number): GameEvent {
    return this.emit(event, tick);
  }

  drain(): GameEvent[] {
    return this.queue.splice(0, this.queue.length);
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  unsubscribe(listener: EventListener): void {
    this.listeners.delete(listener);
  }

  on(listener: EventListener): () => void {
    return this.subscribe(listener);
  }

  off(listener: EventListener): void {
    this.unsubscribe(listener);
  }

  clear(): void {
    this.queue.length = 0;
    this.log.length = 0;
  }

  /** Every event emitted since the bus was created or last cleared. */
  get history(): readonly GameEvent[] {
    return this.log;
  }

  get pending(): number {
    return this.queue.length;
  }
}
