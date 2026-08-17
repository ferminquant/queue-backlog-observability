import { describe, it, expect } from 'vitest';
import { runBacklogBreachScenario } from '../src/scenario.js';
import { MetricNames, LogEventNames } from '../src/signals.js';

describe('signals', () => {
  const result = runBacklogBreachScenario();

  it('emits backlog.threshold.warning before backlog.threshold.breached', () => {
    const warningTicks = new Set<number>();
    const breachTicks = new Set<number>();

    for (const event of result.events) {
      const tick = Number(event.attributes?.tick ?? 0);
      if (event.name === LogEventNames.BacklogThresholdWarning) {
        warningTicks.add(tick);
      }
      if (event.name === LogEventNames.BacklogThresholdBreached) {
        breachTicks.add(tick);
      }
    }

    const firstWarning = Math.min(...warningTicks);
    const firstBreach = Math.min(...breachTicks);

    expect(firstWarning).toBeLessThan(firstBreach);
  });

  it('emits QueueDepthApproximate and OldestMessageAgeSeconds every tick', () => {
    const metricsByTick = new Map<number, Set<string>>();

    for (const metric of result.metrics) {
      const tick = Number(metric.labels?.tick ?? 0);
      const set = metricsByTick.get(tick) ?? new Set<string>();
      set.add(metric.name);
      metricsByTick.set(tick, set);
    }

    for (let tick = 0; tick < result.config.durationTicks; tick++) {
      const names = metricsByTick.get(tick);
      expect(names?.has(MetricNames.QueueDepthApproximate), `tick ${tick}`).toBe(true);
      expect(names?.has(MetricNames.OldestMessageAgeSeconds), `tick ${tick}`).toBe(true);
    }
  });

  it('raises WorkerProcessingLatencyMs p95 into the injected range after tick 200', () => {
    let maxP95 = 0;

    for (const metric of result.metrics) {
      if (metric.name !== MetricNames.WorkerProcessingLatencyMs) continue;
      if (metric.labels?.percentile !== 'p95') continue;
      const tick = Number(metric.labels.tick ?? 0);
      if (tick >= result.config.injectionTick && metric.value > maxP95) {
        maxP95 = metric.value;
      }
    }

    expect(maxP95).toBeGreaterThanOrEqual(result.config.injectedLatencyMs * 0.8);
  });
});
