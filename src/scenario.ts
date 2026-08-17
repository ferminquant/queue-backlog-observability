import { runSimulation, type ScenarioConfig } from './model.js';

export const defaultBacklogBreachConfig: ScenarioConfig = {
  durationTicks: 600,
  submissionRatePerTick: 30,
  workerCount: 3,
  normalLatencyMs: 40,
  injectedLatencyMs: 900,
  injectionTick: 200,
  errorRate: 0.02,
  maxRetries: 2,
  ageWarningThresholdSeconds: 120,
  ageBreachThresholdSeconds: 300,
  depthWarningThreshold: 200,
  depthBreachThreshold: 500,
  seed: 12345,
};

export function runBacklogBreachScenario(overrides?: Partial<ScenarioConfig>) {
  return runSimulation({ ...defaultBacklogBreachConfig, ...overrides });
}
