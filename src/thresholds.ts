import { Metric, LogEvent, MetricNames, LogEventNames } from './signals.js';
import type { ScenarioConfig } from './model.js';

export function evaluateThresholds(
  tick: number,
  timestamp: number,
  metrics: Metric[],
  config: ScenarioConfig,
  oldestMessage?: { correlationId: string; messageId: string }
): LogEvent[] {
  const events: LogEvent[] = [];
  const correlationId = oldestMessage?.correlationId ?? 'system';
  const messageId = oldestMessage?.messageId ?? 'system';

  const ageMetric = metrics.find((m) => m.name === MetricNames.OldestMessageAgeSeconds);
  const depthMetric = metrics.find((m) => m.name === MetricNames.QueueDepthApproximate);

  const age = ageMetric?.value ?? 0;
  const depth = depthMetric?.value ?? 0;

  if (age >= config.ageBreachThresholdSeconds) {
    events.push({
      name: LogEventNames.BacklogThresholdBreached,
      timestamp,
      correlationId,
      messageId,
      attributes: {
        tick,
        thresholdType: MetricNames.OldestMessageAgeSeconds,
        observedValue: age,
        threshold: config.ageBreachThresholdSeconds,
        severity: 'breach',
      },
    });
  } else if (age >= config.ageWarningThresholdSeconds) {
    events.push({
      name: LogEventNames.BacklogThresholdWarning,
      timestamp,
      correlationId,
      messageId,
      attributes: {
        tick,
        thresholdType: MetricNames.OldestMessageAgeSeconds,
        observedValue: age,
        threshold: config.ageWarningThresholdSeconds,
        severity: 'warning',
      },
    });
  }

  if (depth >= config.depthBreachThreshold) {
    events.push({
      name: LogEventNames.BacklogThresholdBreached,
      timestamp,
      correlationId,
      messageId,
      attributes: {
        tick,
        thresholdType: MetricNames.QueueDepthApproximate,
        observedValue: depth,
        threshold: config.depthBreachThreshold,
        severity: 'breach',
      },
    });
  } else if (depth >= config.depthWarningThreshold) {
    events.push({
      name: LogEventNames.BacklogThresholdWarning,
      timestamp,
      correlationId,
      messageId,
      attributes: {
        tick,
        thresholdType: MetricNames.QueueDepthApproximate,
        observedValue: depth,
        threshold: config.depthWarningThreshold,
        severity: 'warning',
      },
    });
  }

  return events;
}
