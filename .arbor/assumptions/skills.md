# skills

- A system's assumptions live in `.arbor/assumptions/<system>.md`, one file per system, committed with the task. (2026-10-14, system-assumptions)
- The assumptions check runs at merge only, before the squash; a removed task skips it. (2026-10-14, system-assumptions)
- A read-only subagent on the cheapest model runs the check, and the merging agent edits the files. (2026-10-14, system-assumptions)
- A contradicted assumption keeps its line, with a `→ contradicted` line under it, and a todo when code elsewhere still follows it. (2026-10-14, system-assumptions)
- An agent's assumption that goes against a recorded one is marked `→ replaced`, so drift shows too. (2026-10-14, system-assumptions)
