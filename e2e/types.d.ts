import type {
  Command,
  CommandResult,
  GameEvent,
  Phase,
  RunState,
} from '../packages/contracts/src/index';

interface RunStateReader {
  getState(): Readonly<RunState>;
}

interface TestApiLike {
  newRun(seed: string): void;
  dispatch(cmd: Command): CommandResult;
  runUntil(
    target: Phase | ((core: RunStateReader) => boolean),
    maxTicks: number,
  ): Promise<boolean>;
  getState(): Readonly<RunState>;
  stateHash(): string;
  setSpeed(multiplier: number): void;
  grantCash(amount: number): void;
}

type ContentVariant = 'default' | 'lip' | 'j6';

interface E2EHarness {
  attach(options?: { seed?: string; content?: ContentVariant }): { seed: string };
  mountTrinket(itemId: string): void;
  grantCash(amount: number): void;
  events(): GameEvent[];
  startRecording(): void;
  recordedEvents(): GameEvent[];
  stateHash(): string;
  friction(floorId: string): number;
  playGolden(): {
    hash: string;
    expected: string;
    phase: Phase;
    seed: string;
    ticks: number;
    events: number;
  };
  startLoop(): void;
  stopLoop(): void;
  measureSpin(speed: number, seed: string): Promise<number>;
  audioGains(): number[];
  lastResumeHash(): string | null;
}

declare global {
  interface Window {
    __JS_TEST__?: TestApiLike;
    __E2E__?: E2EHarness;
  }
}

export {};
