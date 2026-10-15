# checkpoint

- An agent that fails to come back after a restart has its checkpoint forgotten and is left failed for the person to open; nothing retries it. (2026-10-15, auto-resume-checkpoint)
- A checkpoint's restart does not refuse on `held` commands, unlike `/api/restart`: the person chose to restart, and refusing after the agents were asked would strand them. Power lists `held` as a warning beforehand. (2026-10-15, checkpoint-restart-held)
- Auto restart keeps its own 5 s watch to decide when to count down; Power's 1 s poller alone sees a restart come back. (2026-10-15, fold-auto-restart-into-power)
- An auto restart's countdown reads "Restarting arbor dev in 0:42" on Power's run screen, then goes through Power's Restarting slide and reload, with the header's "Restarted" after. (2026-10-15, fold-auto-restart-into-power)
- Closing Power mid-countdown cancels the auto restart. (2026-10-15, fold-auto-restart-into-power)
