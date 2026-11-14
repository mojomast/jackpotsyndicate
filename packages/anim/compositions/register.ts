import type { gsap } from 'gsap';
declare global { interface Window { __timelines: Record<string, gsap.core.Timeline> } }
export function register(id: string, timeline: gsap.core.Timeline) {
  window.__timelines ||= {}; window.__timelines[id] = timeline;
}
