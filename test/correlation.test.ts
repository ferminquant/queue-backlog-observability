import { describe, it, expect } from 'vitest';
import { runBacklogBreachScenario } from '../src/scenario.js';
import { correlate } from '../src/correlation.js';
import { LogEventNames, SpanNames } from '../src/signals.js';

describe('correlation', () => {
  const result = runBacklogBreachScenario();

  const firstBreach = result.breaches[0];
  if (!firstBreach) {
    throw new Error('expected at least one breach event');
  }
  const correlationId = firstBreach.correlationId;

  const correlation = correlate(correlationId, result);

  it('returns the full arc of spans for one correlation id', () => {
    const spanNames = new Set(correlation.spans.map((s) => s.name));

    expect(spanNames.has(SpanNames.ApiSubmit)).toBe(true);
    expect(spanNames.has(SpanNames.QueueWait)).toBe(true);
    expect(spanNames.has(SpanNames.WorkerProcess)).toBe(true);
    expect(spanNames.has(SpanNames.DownstreamCall)).toBe(true);

    for (const span of correlation.spans) {
      expect(span.correlationId).toBe(correlationId);
    }
  });

  it('returns log events covering received, started, and completed or failed', () => {
    const eventNames = correlation.logEvents.map((e) => e.name);

    expect(eventNames).toContain(LogEventNames.MessageReceived);
    expect(eventNames).toContain(LogEventNames.MessageProcessingStarted);

    const terminalEvent =
      eventNames.includes(LogEventNames.MessageProcessingCompleted) ||
      eventNames.includes(LogEventNames.MessageProcessingFailed);

    expect(terminalEvent).toBe(true);
  });

  it('matches the correlation id used for lookup', () => {
    expect(correlation.correlationId).toBe(correlationId);
    expect(correlation.messageId).toBeDefined();
  });
});
