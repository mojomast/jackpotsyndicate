import { useEffect, useRef } from 'react';
import type { GameCore, GameEvent } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';

interface SubscribableCore extends GameCore {
  subscribe?(listener: (event: GameEvent) => void): () => void;
}

/**
 * Listen to every GameEvent the core emits, for presentation only. Uses the
 * core's live bus when it has one, otherwise diffs the store's event mirror.
 */
export function subscribeCoreEvents(core: GameCore, listener: (event: GameEvent) => void): () => void {
  const subscribable = core as SubscribableCore;
  if (typeof subscribable.subscribe === 'function') return subscribable.subscribe(listener);
  let seen = useGameStore.getState().events;
  return useGameStore.subscribe((store) => {
    if (store.events === seen) return;
    const previous = seen;
    seen = store.events;
    const last = previous[previous.length - 1];
    const start = last ? store.events.lastIndexOf(last) + 1 : 0;
    for (const event of store.events.slice(start)) listener(event);
  });
}

/** React hook form of `subscribeCoreEvents`; the latest handler is always used. */
export function useCoreEvents(core: GameCore, handler: (event: GameEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribeCoreEvents(core, (event) => ref.current(event)), [core]);
}
