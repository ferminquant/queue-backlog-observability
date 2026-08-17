import { describe, it, expect } from 'vitest';
import { evaluateThresholds } from '../src/thresholds.js';
import { MetricNames, LogEventNames } from '../src/signals.js';
import type { ScenarioConfig } from '../src/model.js';

const config: ScenarioConfig = {
  durationTicks: 10,
  submissionRatePerTick: 1,
  workerCount: 1,
  normalLatencyMs: 10,
  injectedLatencyMs: 100,
  injectionTick: 5,
  errorRate: 0,
  maxRetries: 0,
  ageWarningThresholdSeconds: 120,
  ageBreachThresholdSeconds: 300,
  depthWarningThreshold: 200,
  depthBreachThreshold: 500,
  seed: 1,
};

function makeMetrics(age: number, depth: number) {
  return [
    { name: MetricNames.OldestMessageAgeSeconds, value: age, timestamp: 0, labels: { tick: '0' } },
    { name: MetricNames.QueueDepthApproximate, value: depth, timestamp: 0, labels: { tick: '0' } },
  ];
}

describe('thresholds', () => {
  it('emits no events when both metrics are below warning', () => {
    const events = evaluateThresholds(0, 0, makeMetrics(0, 0), config, {
      correlationId: 'c',
      messageId: 'm',
    });

    expect(events).toHaveLength(0);
  });

  it('emits exactly a warning when age is at the warning threshold', () => {
    const events = evaluateThresholds(0, 0, makeMetrics(config.ageWarningThresholdSeconds, 0), config, {
      correlationId: 'c',
      messageId: 'm',
    });

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(LogEventNames.BacklogThresholdWarning);
    expect(events[0].attributes?.thresholdType).toBe(MetricNames.OldestMessageAgeSeconds);
  });

  it('emits exactly a warning when depth is at the warning threshold', () => {
    const events = evaluateThresholds(0, 0, makeMetrics(0, config.depthWarningThreshold), config, {
      correlationId: 'c',
      messageId: 'm',
    });

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(LogEventNames.BacklogThresholdWarning);
    expect(events[0].attributes?.thresholdType).toBe(MetricNames.QueueDepthApproximate);
  });

  it('emits exactly a breach when age is above the breach threshold', () => {
    const events = evaluateThresholds(
      0,
      0,
      makeMetrics(config.ageBreachThresholdSeconds + 1, 0),
      config,
      { correlationId: 'c', messageId: 'm' }
    );

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(LogEventNames.BacklogThresholdBreached);
    expect(events[0].attributes?.thresholdType).toBe(MetricNames.OldestMessageAgeSeconds);
  });

  it('emits exactly a breach when depth is above the breach threshold', () => {
    const events = evaluateThresholds(
      0,
      0,
      makeMetrics(0, config.depthBreachThreshold + 1),
      config,
      { correlationId: 'c', messageId: 'm' }
    );

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(LogEventNames.BacklogThresholdBreached);
    expect(events[0].attributes?.thresholdType).toBe(MetricNames.QueueDepthApproximate);
  });

  it('emits both age and depth events when both breach', () => {
    const events = evaluateThresholds(
      0,
      0,
      makeMetrics(config.ageBreachThresholdSeconds + 1, config.depthBreachThreshold + 1),
      config,
      { correlationId: 'c', messageId: 'm' }
    );

    expect(events).toHaveLength(2);
    const types = events.map((e) => e.attributes?.thresholdType);
    expect(types).toContain(MetricNames.OldestMessageAgeSeconds);
    expect(types).toContain(MetricNames.QueueDepthApproximate);

    for (const event of events) {
      expect(event.name).toBe(LogEventNames.BacklogThresholdBreached);
    }
  });
});
