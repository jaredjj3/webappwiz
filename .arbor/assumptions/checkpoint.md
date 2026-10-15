# checkpoint

- An agent that fails to come back after a restart has its checkpoint forgotten and is left failed for the person to open; nothing retries it. (2026-10-15, auto-resume-checkpoint)
- A checkpoint's restart does not refuse on `held` commands, unlike `/api/restart`: the person chose to restart, and refusing after the agents were asked would strand them. Power lists `held` as a warning beforehand. (2026-10-15, checkpoint-restart-held)
