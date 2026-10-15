# conversations

- A relayed task's `## ⏳ Working <task>: on <agent>` shows as a Working card, with no archive offered while it works. (2026-10-14, agent-handoff)
- A refused `todo add` draws no line: there is no todo to name, and the agent says why. (2026-10-15, todo-add-line)
- Pause shows in the actions card only for an agent the person runs: running, not archived, not handed out by an orchestrator. (2026-10-15, pause-button)
- A paused agent stays idle after its checkpoint, and the usual 30-minute idle stop ends its process. (2026-10-15, pause-button)
- New sits atop the desktop sidebar, above the page tabs, with the waiting-on-you line heading the conversation list. (2026-10-15, new-button)
- A phone keeps its own New buttons, unchanged by the desktop's. (2026-10-15, new-button)
- The Check in bar sits above the composer once the agent has gone ten minutes since the last message it took, so a check-in restarts the count. (2026-10-15, check-in-button)
- The Check in bar shows only for an agent the person runs, with nothing queued for it: running, no checkpoint asked, not archived, not handed out. (2026-10-15, check-in-button)
- An external task counts as abandoned only when the page conversation that last took it is archived or deleted; one that moved to another task is left to going quiet, since a subagent's task looks the same. (2026-10-15, orphan-vs-external)
- An external task shows as quiet after 30 minutes without a commit, a file edit or an arbor command. (2026-10-15, orphan-vs-external)
- A review answered with changes stays a folded green Ready to merge card saying "Changes asked"; only an approved one becomes a line. (2026-10-15, calm-merge-cards)
- An approved review's line opens the review with a Show / Hide button, gray and read-only beneath it. (2026-10-15, calm-merge-cards)
