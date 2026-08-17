# queue-backlog-observability

Deterministic local model of a queue backlog / latency breach for a portfolio case study.

This repo simulates API submissions feeding a FIFO queue, a fixed worker pool pulling jobs, and a downstream latency step that collapses throughput. It emits metrics, logs, and trace spans that mirror production telemetry, then correlates a single message across its full lifecycle and assembles a runbook from the breach state.

## What it models

- **Metrics every tick**: queue depth, oldest-message age, worker processing latency (p50/p95/p99), worker error rate, downstream latency, receive/delete rates, DLQ count.
- **Threshold events**: `backlog.threshold.warning` fires before `backlog.threshold.breached` for age and depth.
- **Correlation**: a `correlationId` joins `api.submit` → `queue.wait` → `worker.process` → `downstream.call` spans and the log events for one message.
- **Runbook output**: given the scenario result, it assembles the failure state, leading-indicator evidence, and ordered next checks.

Everything runs locally with seeded randomness — no live AWS calls, no `Math.random`, no wall-clock timing outside the tick clock.

## Local commands

```bash
npm install
npm test                 # vitest suite
npm run build            # TypeScript type check
npm run scenario         # breach timeline + correlated trace
npm run runbook          # formatted runbook from the breach
npm run verify           # npm test && npm run build
```

## Architecture

- `src/signals.ts` — metric, log event, and span types plus their frozen names.
- `src/model.ts` — `runSimulation(config)` drives the tick loop and emits telemetry.
- `src/scenario.ts` — `defaultBacklogBreachConfig` and `runBacklogBreachScenario(overrides?)`.
- `src/thresholds.ts` — `evaluateThresholds(...)` turns metrics into warning/breach events.
- `src/correlation.ts` — `correlate(id, result)` returns spans, log events, and timing sums for one id.
- `src/runbook.ts` — `assembleRunbook(result)` and `formatRunbook(runbook)` for breach response output.
- `src/run-scenario.ts` / `src/run-runbook.ts` — CLI entry points.
- `test/*.test.ts` — signal, correlation, threshold, determinism, and runbook tests.

## Case study link

The case study page lands in a later step; the portfolio lives at https://ferminquant.github.io/personal-portfolio/.
