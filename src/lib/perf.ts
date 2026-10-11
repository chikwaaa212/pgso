/**
 * Temporary timing instrumentation (PERF_TRACE=1).
 * Usage:
 *   import { perf, timed } from '@/lib/perf';
 *   const t = perf('login'); ... t.step('auth'); ... t.done(); // logs when enabled
 * Server-Timing: use perfHeader(startedAt, steps) in route handlers.
 * Leave behind env flag; no-op when PERF_TRACE !== '1'.
 */

export function perfEnabled(): boolean {
  try {
    return process.env.PERF_TRACE === '1';
  } catch {
    return false;
  }
}

export interface PerfTimer {
  step(name: string): void;
  done(extra?: Record<string, unknown>): void;
  headerValue(): string;
}

export function perf(label: string): PerfTimer {
  const start = Date.now();
  let last = start;
  const steps: Array<{ name: string; ms: number }> = [];
  const log = (msg: string, data?: unknown) => {
    if (!perfEnabled()) return;
    try {
      console.log(`[perf ${label}] ${msg}`, data ?? '');
    } catch {
      /* ignore */
    }
  };
  return {
    step(name: string) {
      if (!perfEnabled()) return;
      const now = Date.now();
      steps.push({ name, ms: now - last });
      last = now;
    },
    done(extra?: Record<string, unknown>) {
      if (!perfEnabled()) return;
      const total = Date.now() - start;
      const breakdown = steps.map((s) => `${s.name} ${s.ms}ms`).join(' + ');
      log(`total ${total}ms = ${breakdown || '(no steps)'}${extra ? ' ' + JSON.stringify(extra) : ''}`);
    },
    headerValue() {
      return steps.map((s) => `${s.name};dur=${s.ms}`).join(', ');
    },
  };
}

export async function timed<T>(label: string, timer: PerfTimer, stepName: string, fn: () => Promise<T>): Promise<T> {
  if (!perfEnabled()) return fn();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    try {
      console.log(`[perf ${label}] step ${stepName}: ${Date.now() - t0}ms`);
    } catch {
      /* ignore */
    }
    timer.step(stepName);
  }
}
