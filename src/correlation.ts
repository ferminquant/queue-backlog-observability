import type { SimulationResult } from './model.js';
import { SpanNames, type LogEvent, type Span } from './signals.js';

export interface SpanNode {
  span: Span;
  children: SpanNode[];
}

export interface CorrelationResult {
  correlationId: string;
  messageId?: string;
  logEvents: LogEvent[];
  spans: Span[];
  spanTree: SpanNode[];
  queueWaitMs: number;
  processingMs: number;
  downstreamMs: number;
}

export function correlate(id: string, result: SimulationResult): CorrelationResult {
  const logEvents = result.events.filter(
    (e) => e.correlationId === id || e.messageId === id
  );
  const spans = result.spans.filter(
    (s) => s.correlationId === id || s.messageId === id
  );

  const messageId =
    spans.find((s) => s.messageId)?.messageId ??
    logEvents.find((e) => e.messageId)?.messageId;

  const roots = spans.filter((s) => !s.parentId);
  const byParent = new Map<string, Span[]>();
  for (const span of spans) {
    if (span.parentId) {
      const list = byParent.get(span.parentId) ?? [];
      list.push(span);
      byParent.set(span.parentId, list);
    }
  }

  function buildTree(span: Span): SpanNode {
    return {
      span,
      children: (byParent.get(span.spanId) ?? []).map(buildTree),
    };
  }

  const spanTree = roots.map(buildTree);

  const sumSpanDuration = (name: string): number =>
    spans
      .filter((s) => s.name === name)
      .reduce((sum, s) => sum + ((s.endTime ?? s.startTime) - s.startTime), 0);

  return {
    correlationId: id,
    messageId,
    logEvents,
    spans,
    spanTree,
    queueWaitMs: sumSpanDuration(SpanNames.QueueWait),
    processingMs: sumSpanDuration(SpanNames.WorkerProcess),
    downstreamMs: sumSpanDuration(SpanNames.DownstreamCall),
  };
}
