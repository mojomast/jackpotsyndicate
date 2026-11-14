import type { gsap } from 'gsap';
import type { CompletionHook } from '../contracts-shim';
import { TICKS_PER_SECOND } from '../contracts-shim';

export class TimelinePlayer {
  onComplete: CompletionHook | undefined;
  private active: gsap.core.Timeline | null = null;
  private startTick = 0;
  private completed = false;

  constructor(onComplete?: CompletionHook) { this.onComplete = onComplete; }
  play(timeline: gsap.core.Timeline, startTick: number): void {
    if (!Number.isFinite(startTick)) throw new Error('startTick must be finite.');
    this.stop(); this.active = timeline; this.startTick = startTick; this.completed = false;
    timeline.pause(); timeline.time(0, true);
  }
  syncToTick(currentTick: number): void {
    if (!Number.isFinite(currentTick)) throw new Error('currentTick must be finite.');
    if (!this.active) return;
    const seconds = Math.max(0, (currentTick - this.startTick) / TICKS_PER_SECOND);
    this.active.time(Math.min(seconds, this.active.duration()), true);
    if (!this.completed && seconds >= this.active.duration()) { this.completed = true; this.onComplete?.(); }
  }
  stop(): void { this.active?.pause(); this.active = null; }
}
