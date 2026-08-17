import type { SimulationResult } from './model.js';
import { MetricNames, LogEventNames } from './signals.js';

export interface FailureState {
  thresholdType: string;
  tick: number;
  observedValue: number;
  threshold: number;
}

export interface RunbookEvidence {
  depthAtInjectionTick: number;
  maxDepth: number;
  maxDepthTick: number;
  maxOldestAgeSeconds: number;
  maxOldestAgeTick: number;
  workerLatencyP95MaxMs: number;
  workerLatencyP50MaxMs: number;
  downstreamLatencyMaxMs: number;
  workerErrorRateMax: number;
}

export interface Runbook {
  failureState: FailureState[];
  evidence: RunbookEvidence;
  nextChecks: string[];
}

function metricsByTick(result: SimulationResult): Map<number, Map<string, number>> {
  const map = new Map<number, Map<string, number>>();
  for (const metric of result.metrics) {
    const tick = Number(metric.labels?.tick ?? 0);
    let tickMap = map.get(tick);
    if (!tickMap) {
      tickMap = new Map<string, number>();
      map.set(tick, tickMap);
    }
    const key = metric.labels?.percentile ? `${metric.name}:${metric.labels.percentile}` : metric.name;
    tickMap.set(key, metric.value);
  }
  return map;
}

export function assembleRunbook(result: SimulationResult): Runbook {
  const byTick = metricsByTick(result);

  const seenTypes = new Set<string>();
  const failureState: FailureState[] = [];
  for (const event of result.breaches) {
    if (event.name !== LogEventNames.BacklogThresholdBreached) continue;
    const thresholdType = String(event.attributes?.thresholdType ?? 'unknown');
    if (seenTypes.has(thresholdType)) continue;
    seenTypes.add(thresholdType);
    failureState.push({
      thresholdType,
      tick: Number(event.attributes?.tick ?? 0),
      observedValue: Number(event.attributes?.observedValue ?? 0),
      threshold: Number(event.attributes?.threshold ?? 0),
    });
  }

  let depthAtInjectionTick = 0;
  let maxDepth = 0;
  let maxDepthTick = 0;
  let maxOldestAgeSeconds = 0;
  let maxOldestAgeTick = 0;
  let workerLatencyP95MaxMs = 0;
  let workerLatencyP50MaxMs = 0;
  let downstreamLatencyMaxMs = 0;
  let workerErrorRateMax = 0;

  for (let tick = 0; tick < result.config.durationTicks; tick++) {
    const tickMetrics = byTick.get(tick);
    if (!tickMetrics) continue;

    if (tick === result.config.injectionTick) {
      depthAtInjectionTick = tickMetrics.get(MetricNames.QueueDepthApproximate) ?? 0;
    }

    const depth = tickMetrics.get(MetricNames.QueueDepthApproximate) ?? 0;
    if (depth > maxDepth) {
      maxDepth = depth;
      maxDepthTick = tick;
    }

    const oldestAge = tickMetrics.get(MetricNames.OldestMessageAgeSeconds) ?? 0;
    if (oldestAge > maxOldestAgeSeconds) {
      maxOldestAgeSeconds = oldestAge;
      maxOldestAgeTick = tick;
    }

    const p95 = tickMetrics.get(`${MetricNames.WorkerProcessingLatencyMs}:p95`) ?? 0;
    if (p95 > workerLatencyP95MaxMs) {
      workerLatencyP95MaxMs = p95;
    }

    const p50 = tickMetrics.get(`${MetricNames.WorkerProcessingLatencyMs}:p50`) ?? 0;
    if (p50 > workerLatencyP50MaxMs) {
      workerLatencyP50MaxMs = p50;
    }

    const downstream = tickMetrics.get(MetricNames.DownstreamLatencyMs) ?? 0;
    if (downstream > downstreamLatencyMaxMs) {
      downstreamLatencyMaxMs = downstream;
    }

    const errorRate = tickMetrics.get(MetricNames.WorkerErrorRate) ?? 0;
    if (errorRate > workerErrorRateMax) {
      workerErrorRateMax = errorRate;
    }
  }

  const evidence: RunbookEvidence = {
    depthAtInjectionTick,
    maxDepth,
    maxDepthTick,
    maxOldestAgeSeconds,
    maxOldestAgeTick,
    workerLatencyP95MaxMs,
    workerLatencyP50MaxMs,
    downstreamLatencyMaxMs,
    workerErrorRateMax,
  };

  const nextChecks = [
    'Confirm downstream latency regression',
    'Check worker error rate',
    'Decide scale-out vs rollback',
  ];

  return { failureState, evidence, nextChecks };
}

export function formatRunbook(runbook: Runbook): string {
  const lines: string[] = [];

  lines.push('Queue backlog runbook');
  lines.push('=====================');
  lines.push('');

  lines.push('Failure state');
  lines.push('-------------');
  if (runbook.failureState.length === 0) {
    lines.push('No thresholds breached.');
  } else {
    for (const state of runbook.failureState) {
      lines.push(
        `- ${state.thresholdType} breached at tick ${state.tick} (observed ${state.observedValue}, threshold ${state.threshold})`
      );
    }
  }
  lines.push('');

  const ev = runbook.evidence;
  lines.push('Evidence');
  lines.push('--------');
  lines.push(`- Queue depth grew from ${ev.depthAtInjectionTick} at injection to ${ev.maxDepth} at tick ${ev.maxDepthTick}`);
  lines.push(`- Oldest message age reached ${ev.maxOldestAgeSeconds} seconds at tick ${ev.maxOldestAgeTick}`);
  lines.push(`- Worker processing latency p95 peaked at ${ev.workerLatencyP95MaxMs} ms`);
  lines.push(`- Worker processing latency p50 peaked at ${ev.workerLatencyP50MaxMs} ms`);
  lines.push(`- Downstream latency peaked at ${ev.downstreamLatencyMaxMs} ms`);
  lines.push(`- Worker error rate peaked at ${ev.workerErrorRateMax.toFixed(3)}`);
  lines.push('');

  lines.push('Next checks');
  lines.push('-----------');
  for (let i = 0; i < runbook.nextChecks.length; i++) {
    lines.push(`${i + 1}. ${runbook.nextChecks[i]}`);
  }

  return lines.join('\n');
}
