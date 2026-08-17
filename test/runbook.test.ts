import { describe, it, expect } from 'vitest';
import { runBacklogBreachScenario } from '../src/scenario.js';
import { assembleRunbook, formatRunbook } from '../src/runbook.js';

describe('runbook', () => {
  const result = runBacklogBreachScenario();
  const runbook = assembleRunbook(result);

  it('assembles failure state from breach events', () => {
    expect(runbook.failureState.length).toBeGreaterThan(0);

    for (const state of runbook.failureState) {
      expect(state.thresholdType).toBeDefined();
      expect(state.tick).toBeGreaterThanOrEqual(0);
      expect(state.observedValue).toBeGreaterThanOrEqual(state.threshold);
    }
  });

  it('collects leading indicator evidence', () => {
    expect(runbook.evidence.maxDepth).toBeGreaterThan(runbook.evidence.depthAtInjectionTick);
    expect(runbook.evidence.maxOldestAgeSeconds).toBeGreaterThan(0);
    expect(runbook.evidence.workerLatencyP95MaxMs).toBeGreaterThan(0);
    expect(runbook.evidence.downstreamLatencyMaxMs).toBeGreaterThan(0);
  });

  it('provides an ordered list of next checks', () => {
    expect(runbook.nextChecks.length).toBeGreaterThan(0);

    for (let i = 0; i < runbook.nextChecks.length; i++) {
      expect(typeof runbook.nextChecks[i]).toBe('string');
      expect(runbook.nextChecks[i].length).toBeGreaterThan(0);
    }
  });

  it('produces deterministic formatted output', () => {
    const first = formatRunbook(assembleRunbook(result));
    const second = formatRunbook(assembleRunbook(result));

    expect(first).toBe(second);
    expect(first).toContain('Failure state');
    expect(first).toContain('Evidence');
    expect(first).toContain('Next checks');
  });
});
