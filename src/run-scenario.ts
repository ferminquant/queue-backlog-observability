import { runBacklogBreachScenario } from './scenario.js';
import { MetricNames, LogEventNames } from './signals.js';
import { correlate, type SpanNode } from './correlation.js';
import type { Metric, LogEvent } from './signals.js';

function main(): void {
  const result = runBacklogBreachScenario();
  const lines: string[] = [];

  lines.push('backlog breach scenario');
  lines.push(
    `ticks=${result.config.durationTicks} workers=${result.config.workerCount} injectionTick=${result.config.injectionTick}`
  );
  lines.push('');

  const metricsByTick = new Map<number, Metric[]>();
  for (const metric of result.metrics) {
    const tick = Number(metric.labels?.tick ?? 0);
    const list = metricsByTick.get(tick) ?? [];
    list.push(metric);
    metricsByTick.set(tick, list);
  }

  const thresholdsByTick = new Map<number, LogEvent[]>();
  for (const event of result.events) {
    if (
      event.name === LogEventNames.BacklogThresholdBreached ||
      event.name === LogEventNames.BacklogThresholdWarning
    ) {
      const tick = Number(event.attributes?.tick ?? 0);
      const list = thresholdsByTick.get(tick) ?? [];
      list.push(event);
      thresholdsByTick.set(tick, list);
    }
  }

  for (let tick = 0; tick < result.config.durationTicks; tick++) {
    const tickMetrics = metricsByTick.get(tick) ?? [];
    const depth =
      tickMetrics.find((m) => m.name === MetricNames.QueueDepthApproximate)?.value ?? 0;
    const oldestAge =
      tickMetrics.find((m) => m.name === MetricNames.OldestMessageAgeSeconds)?.value ?? 0;
    const thresholdEvents = thresholdsByTick.get(tick) ?? [];
    const names = thresholdEvents.map((e) => e.name).join(',') || '-';

    lines.push(
      `tick=${tick.toString().padStart(3, '0')} depth=${depth.toString().padStart(4)} oldestAge=${oldestAge.toString().padStart(4)} breaches=${names}`
    );
  }

  const firstBreach = result.events.find(
    (e) => e.name === LogEventNames.BacklogThresholdBreached
  );
  let correlationId = firstBreach?.correlationId;

  if (!correlationId || correlationId === 'system') {
    let maxWait = -1;
    for (const message of result.messages) {
      const correlation = correlate(message.correlationId, result);
      if (correlation.queueWaitMs > maxWait) {
        maxWait = correlation.queueWaitMs;
        correlationId = message.correlationId;
      }
    }
  }

  if (!correlationId) {
    correlationId = 'corr-0-0';
  }

  const correlation = correlate(correlationId, result);
  lines.push('');
  lines.push(
    `correlated trace for ${correlationId} (messageId=${correlation.messageId ?? 'n/a'})`
  );
  lines.push(
    `queueWaitMs=${correlation.queueWaitMs} processingMs=${correlation.processingMs} downstreamMs=${correlation.downstreamMs}`
  );

  lines.push('log events:');
  for (const event of correlation.logEvents) {
    lines.push(
      `  ${event.name} @${event.timestamp} worker=${event.workerId ?? '-'} ${JSON.stringify(event.attributes ?? {})}`
    );
  }

  lines.push('span tree:');
  function printSpan(node: SpanNode, indent: string): void {
    const span = node.span;
    const duration = (span.endTime ?? span.startTime) - span.startTime;
    lines.push(
      `${indent}${span.name} [${span.startTime}-${span.endTime ?? '?'}] dur=${duration}ms worker=${span.workerId ?? '-'}`
    );
    for (const child of node.children) {
      printSpan(child, indent + '  ');
    }
  }
  for (const root of correlation.spanTree) {
    printSpan(root, '  ');
  }

  console.log(lines.join('\n'));
}

main();
