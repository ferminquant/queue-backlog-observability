import { runBacklogBreachScenario } from './scenario.js';
import { assembleRunbook, formatRunbook } from './runbook.js';

function main(): void {
  const result = runBacklogBreachScenario();
  const runbook = assembleRunbook(result);
  console.log(formatRunbook(runbook));
}

main();
