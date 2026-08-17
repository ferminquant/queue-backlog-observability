import {
  Metric,
  LogEvent,
  Span,
  MetricNames,
  LogEventNames,
  SpanNames,
} from './signals.js';
import { evaluateThresholds } from './thresholds.js';

export interface ScenarioConfig {
  durationTicks: number;
  submissionRatePerTick: number;
  workerCount: number;
  normalLatencyMs: number;
  injectedLatencyMs: number;
  injectionTick: number;
  errorRate: number;
  maxRetries: number;
  ageWarningThresholdSeconds: number;
  ageBreachThresholdSeconds: number;
  depthWarningThreshold: number;
  depthBreachThreshold: number;
  seed: number;
}

export interface SimulationResult {
  config: ScenarioConfig;
  messages: Array<{ messageId: string; correlationId: string; enqueueTick: number }>;
  metrics: Metric[];
  events: LogEvent[];
  spans: Span[];
  breaches: LogEvent[];
}

interface InternalMessage {
  messageId: string;
  correlationId: string;
  enqueueTick: number;
  receiveCount: number;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

class Clock {
  private tick = 0;
  constructor(private readonly baseTimeMs: number = 0) {}

  setTick(tick: number): void {
    this.tick = tick;
  }

  tickMs(): number {
    return this.baseTimeMs + this.tick * 1000;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export function runSimulation(config: ScenarioConfig): SimulationResult {
  const prng = mulberry32(config.seed);
  const clock = new Clock(0);

  const visible: InternalMessage[] = [];
  const messages: InternalMessage[] = [];
  const events: LogEvent[] = [];
  const spans: Span[] = [];
  const breaches: LogEvent[] = [];
  const metrics: Metric[] = [];

  const recent = {
    received: [] as number[],
    deleted: [] as number[],
    attempts: [] as number[],
    failures: [] as number[],
  };

  let spanSeq = 0;
  let submissionSeq = 0;
  let dlqCount = 0;

  function pushWindow(arr: number[], value: number): void {
    arr.push(value);
    if (arr.length > 60) arr.shift();
  }

  function sumLast(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0);
  }

  function enqueueVisible(msg: InternalMessage): void {
    let i = 0;
    while (i < visible.length && visible[i].enqueueTick <= msg.enqueueTick) {
      i++;
    }
    visible.splice(i, 0, msg);
  }

  function currentLatency(tick: number): number {
    return tick >= config.injectionTick ? config.injectedLatencyMs : config.normalLatencyMs;
  }

  for (let tick = 0; tick < config.durationTicks; tick++) {
    clock.setTick(tick);
    const latency = currentLatency(tick);
    const timestamp = clock.tickMs();

    let receivedThisTick = 0;
    let deletedThisTick = 0;
    let attemptsThisTick = 0;
    let failuresThisTick = 0;
    const completedDurations: number[] = [];
    const downstreamDurations: number[] = [];

    // API submissions
    for (let i = 0; i < config.submissionRatePerTick; i++) {
      const seq = submissionSeq++;
      const correlationId = `corr-${tick}-${seq}`;
      const messageId = `msg-${tick}-${seq}`;
      const msg: InternalMessage = {
        messageId,
        correlationId,
        enqueueTick: tick,
        receiveCount: 0,
      };

      messages.push(msg);
      enqueueVisible(msg);

      const ts = timestamp + i;
      events.push({
        name: LogEventNames.MessageReceived,
        timestamp: ts,
        correlationId,
        messageId,
        attributes: { tick },
      });

      const apiSpanId = `span-${spanSeq++}`;
      spans.push({
        spanId: apiSpanId,
        name: SpanNames.ApiSubmit,
        startTime: ts,
        endTime: ts,
        correlationId,
        messageId,
      });
      spans.push({
        spanId: `span-${spanSeq++}`,
        parentId: apiSpanId,
        name: SpanNames.QueueWait,
        startTime: ts,
        endTime: undefined,
        correlationId,
        messageId,
      });

      receivedThisTick++;
    }

    // Worker pool processing
    for (let w = 0; w < config.workerCount; w++) {
      const workerId = `worker-${w}`;
      let budget = 1000;

      while (budget >= latency && visible.length > 0) {
        const msg = visible.shift()!;
        const waitSpan = spans.find(
          (s) =>
            s.name === SpanNames.QueueWait &&
            s.messageId === msg.messageId &&
            s.endTime === undefined
        );

        const startOffset = 1000 - budget;
        const startTime = timestamp + startOffset;
        const endTime = startTime + latency;

        if (waitSpan) {
          waitSpan.endTime = startTime;
        }

        const processSpanId = `span-${spanSeq++}`;
        const downstreamSpanId = `span-${spanSeq++}`;

        spans.push({
          spanId: processSpanId,
          parentId: waitSpan?.spanId,
          name: SpanNames.WorkerProcess,
          startTime,
          endTime,
          correlationId: msg.correlationId,
          messageId: msg.messageId,
          workerId,
        });
        spans.push({
          spanId: downstreamSpanId,
          parentId: processSpanId,
          name: SpanNames.DownstreamCall,
          startTime,
          endTime,
          correlationId: msg.correlationId,
          messageId: msg.messageId,
          workerId,
        });

        events.push({
          name: LogEventNames.MessageProcessingStarted,
          timestamp: startTime,
          correlationId: msg.correlationId,
          messageId: msg.messageId,
          workerId,
          attributes: { tick, downstreamLatencyMs: latency },
        });

        attemptsThisTick++;
        const failed = prng() < config.errorRate;

        events.push({
          name: LogEventNames.DownstreamCallCompleted,
          timestamp: endTime,
          correlationId: msg.correlationId,
          messageId: msg.messageId,
          workerId,
          attributes: {
            tick,
            downstreamLatencyMs: latency,
            status: failed ? 'failure' : 'success',
          },
        });

        if (failed) {
          failuresThisTick++;
          if (msg.receiveCount < config.maxRetries) {
            msg.receiveCount++;
            events.push({
              name: LogEventNames.MessageProcessingFailed,
              timestamp: endTime,
              correlationId: msg.correlationId,
              messageId: msg.messageId,
              workerId,
              attributes: { tick, retryCount: msg.receiveCount },
            });

            enqueueVisible(msg);
            const apiSpan = spans.find(
              (s) => s.name === SpanNames.ApiSubmit && s.messageId === msg.messageId
            );
            spans.push({
              spanId: `span-${spanSeq++}`,
              parentId: apiSpan?.spanId,
              name: SpanNames.QueueWait,
              startTime: endTime,
              endTime: undefined,
              correlationId: msg.correlationId,
              messageId: msg.messageId,
            });
          } else {
            dlqCount++;
            events.push({
              name: LogEventNames.MessageProcessingFailed,
              timestamp: endTime,
              correlationId: msg.correlationId,
              messageId: msg.messageId,
              workerId,
              attributes: { tick, dlq: true },
            });
          }
        } else {
          deletedThisTick++;
          events.push({
            name: LogEventNames.MessageProcessingCompleted,
            timestamp: endTime,
            correlationId: msg.correlationId,
            messageId: msg.messageId,
            workerId,
            attributes: { tick },
          });
          completedDurations.push(latency);
          downstreamDurations.push(latency);
        }

        budget -= latency;
      }
    }

    pushWindow(recent.received, receivedThisTick);
    pushWindow(recent.deleted, deletedThisTick);
    pushWindow(recent.attempts, attemptsThisTick);
    pushWindow(recent.failures, failuresThisTick);

    const depth = visible.length;
    const oldestAge = depth > 0 ? tick - visible[0].enqueueTick : 0;
    const oldestMessage =
      depth > 0
        ? { correlationId: visible[0].correlationId, messageId: visible[0].messageId }
        : undefined;

    const sortedDurations = [...completedDurations].sort((a, b) => a - b);
    const p50 = Math.round(percentile(sortedDurations, 50));
    const p95 = Math.round(percentile(sortedDurations, 95));
    const p99 = Math.round(percentile(sortedDurations, 99));
    const avgDownstream =
      downstreamDurations.length > 0
        ? Math.round(
            downstreamDurations.reduce((a, b) => a + b, 0) / downstreamDurations.length
          )
        : 0;

    const attemptsWindow = sumLast(recent.attempts);
    const failuresWindow = sumLast(recent.failures);
    const errorRate = attemptsWindow > 0 ? failuresWindow / attemptsWindow : 0;

    const tickMetrics: Metric[] = [
      {
        name: MetricNames.QueueDepthApproximate,
        value: depth,
        timestamp,
        labels: { tick: String(tick) },
      },
      {
        name: MetricNames.OldestMessageAgeSeconds,
        value: oldestAge,
        timestamp,
        labels: { tick: String(tick) },
      },
      {
        name: MetricNames.WorkerProcessingLatencyMs,
        value: p50,
        timestamp,
        labels: { tick: String(tick), percentile: 'p50' },
      },
      {
        name: MetricNames.WorkerProcessingLatencyMs,
        value: p95,
        timestamp,
        labels: { tick: String(tick), percentile: 'p95' },
      },
      {
        name: MetricNames.WorkerProcessingLatencyMs,
        value: p99,
        timestamp,
        labels: { tick: String(tick), percentile: 'p99' },
      },
      {
        name: MetricNames.WorkerErrorRate,
        value: errorRate,
        timestamp,
        labels: { tick: String(tick) },
      },
      {
        name: MetricNames.DownstreamLatencyMs,
        value: avgDownstream,
        timestamp,
        labels: { tick: String(tick) },
      },
      {
        name: MetricNames.MessagesReceivedPerMin,
        value: sumLast(recent.received),
        timestamp,
        labels: { tick: String(tick) },
      },
      {
        name: MetricNames.MessagesDeletedPerMin,
        value: sumLast(recent.deleted),
        timestamp,
        labels: { tick: String(tick) },
      },
      {
        name: MetricNames.DlqMessageCount,
        value: dlqCount,
        timestamp,
        labels: { tick: String(tick) },
      },
    ];

    metrics.push(...tickMetrics);

    const thresholdEvents = evaluateThresholds(
      tick,
      timestamp,
      tickMetrics,
      config,
      oldestMessage
    );
    events.push(...thresholdEvents);
    breaches.push(...thresholdEvents);
  }

  return { config, messages, metrics, events, spans, breaches };
}
