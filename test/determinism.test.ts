import { describe, it, expect } from 'vitest';
import { runBacklogBreachScenario } from '../src/scenario.js';

describe('determinism', () => {
  it('produces identical results with the same seed', () => {
    const first = runBacklogBreachScenario();
    const second = runBacklogBreachScenario();

    expect(first).toEqual(second);
  });

  it('produces different timings with a different seed', () => {
    const baseline = runBacklogBreachScenario();
    const different = runBacklogBreachScenario({ seed: 99999 });

    const baselineTimestamps = baseline.events.map((e) => e.timestamp);
    const differentTimestamps = different.events.map((e) => e.timestamp);

    expect(baselineTimestamps).not.toEqual(differentTimestamps);
  });

  it('keeps the same shape with a different seed', () => {
    const baseline = runBacklogBreachScenario();
    const different = runBacklogBreachScenario({ seed: 99999 });

    expect(different.config).toEqual(expect.objectContaining({
      durationTicks: baseline.config.durationTicks,
      submissionRatePerTick: baseline.config.submissionRatePerTick,
      workerCount: baseline.config.workerCount,
      injectionTick: baseline.config.injectionTick,
    }));

    expect(different.messages).toHaveLength(baseline.messages.length);
    expect(different.metrics.length).toBe(baseline.metrics.length);

    const baselineSpanNames = new Set(baseline.spans.map((s) => s.name));
    const differentSpanNames = new Set(different.spans.map((s) => s.name));
    expect(differentSpanNames).toEqual(baselineSpanNames);

    const baselineEventNames = new Set(baseline.events.map((e) => e.name));
    const differentEventNames = new Set(different.events.map((e) => e.name));
    expect(differentEventNames).toEqual(baselineEventNames);
  });
});
