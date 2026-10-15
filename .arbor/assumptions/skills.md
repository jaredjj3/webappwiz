# skills

- A system's assumptions live in `.arbor/assumptions/<system>.md`, one file per system, committed with the task. (2026-10-14, system-assumptions)
- The assumptions check runs at merge only, before the squash; a removed task skips it. (2026-10-14, system-assumptions)
- A read-only subagent on the cheapest model runs the check, and the merging agent edits the files. (2026-10-14, system-assumptions)
- A contradicted assumption keeps its line, with a `→ contradicted` line under it, and a todo when code elsewhere still follows it. (2026-10-14, system-assumptions)
- An agent's assumption that goes against a recorded one is marked `→ replaced`, so drift shows too. (2026-10-14, system-assumptions)
- An agent hands its task down to a cheaper model only when the work is long and mechanical, since a short task costs less to finish than to hand on. (2026-10-14, agent-handoff)
  → contradicted 2026-10-14 in handoff-needs-reason: the user asked for a concrete reason the task gave, never a model mismatch; down only when most of the task is ahead, fully planned and mechanical
- An agent that hands on with `--relay` reports it as `## ⏳ Working <task>: on <agent>`, then ends on the task's own Merged, Removed or Escalated report. (2026-10-14, agent-handoff)
- An agent hands its task up only after a step failed twice despite a change of course, or a call it could not settle after investigating. (2026-10-14, handoff-needs-reason)
