import { supersedeIteration } from "./supersede.js";

// Standalone governed CLI entry: `npx tsx src/governance/supersede-cli.ts --iteration <ID> --superseded-by <ID> --reason "<text>"`.
// Kept outside cli.ts so this infrastructure iteration does not depend on unrelated uncommitted CLI edits;
// cli.ts / package.json aliases can register the same command in a later governed iteration.
function flag(args: string[], name: string): string {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? "" : "";
}

const args = process.argv.slice(2);
try {
  const event = supersedeIteration({
    iterationId: flag(args, "--iteration"),
    supersededByIterationId: flag(args, "--superseded-by"),
    reason: flag(args, "--reason"),
    actor: flag(args, "--actor") || undefined,
  });
  console.log(JSON.stringify({
    event_id: event.event_id,
    iteration_id: event.iteration_id,
    superseded_by_iteration_id: flag(args, "--superseded-by"),
    event_type: event.event_type,
    event_hash: event.event_hash,
    recorded_at: event.recorded_at,
  }, null, 2));
} catch (error) {
  console.error(`ERROR: ${(error as Error).message}`);
  process.exitCode = 1;
}
