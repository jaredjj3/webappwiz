---
name: arbor
description: Use the @webappwiz/arbor CLI to land your work on trunk from an isolated git worktree without pull requests. Read this before making any code change in an arbor repository — it decides where the work happens — and whenever you need to create, claim, graft, prune, list, show, locate, wait for, or escalate a workstream.
version: 0.0.0
---

# Using arbor

`arbor` runs many agents on one repo, each in its own git worktree, landing on
trunk without pull requests. Run it with `bunx @webappwiz/arbor <command>` (or
`arbor` if on PATH).

**Rule:** never use raw git for state transitions arbor covers — every landing
goes through `arbor graft`. The only exception is finishing an in-progress
rebase (`git add` / `git rebase --continue`), then grafting again.

Run `arbor --help` for the list of commands, and `arbor <command> --help` for
what a command does and its arguments.

## Before you start

Work happens in a worktree, and other agents may already be in one. Before
creating anything:

1. List the files and directories you expect to touch.
2. `arbor ls`. For each task in flight, `arbor show <task>` — it prints that
   task's state and its `TODO.md` without taking the lease, so looking cannot
   disturb the agent driving it. For the files it has actually changed:
   `git -C "$(arbor path <task>)" diff --name-only main...task/<task>`.
3. Compare with your list. If nothing overlaps, carry on.

If something does overlap, wait for it — the overlap disappears once the other
task grafts, and starting now buys a rebase conflict instead. Do not ask
permission to wait; say one line about what you are doing, then block on it:

> `alpha` is already changing `packages/arbor/index.ts`. Waiting for it to
> land (up to 20 minutes) before I start.

```bash
arbor wait alpha --timeout 20   # minutes; default 30
```

Pick the timeout for how long the human is likely to be happy hearing nothing —
shorter when they are watching, longer for work that will obviously take a
while. Then act on how it returns:

- `gone` — the overlap has cleared. Redo the checks above (trunk has moved) and
  carry on.
- `escalated` — that task is stuck on a person, so yours is too. Tell the human
  what it is blocked on and what you were going to do, and wait for an answer.
- anything else it reports resting (`orphaned`, `stray`, `unrecorded`,
  `unknown`) — that tree is broken and nobody is driving it. Say so and ask.
- exit 14 `timed_out` — it is still going. Go back to the human with the choice,
  and say what you have not done:

  > Still waiting on `alpha` after 20 minutes. I have not started anything.
  > Keep waiting, work alongside it, or pick up something else?

Only ask before waiting if the wait itself is the problem — the task has been
sitting for hours, or you were told this was urgent.

## Workflow

1. `arbor create <task>` (or `arbor claim <task>` to resume; `arbor show
   <task>` first if you want to see what a tree is before taking its lease).
2. Write `TODO.md` at the worktree root before starting (see below).
3. Do the work; commit with git (arbor never commits for you). Keep `TODO.md`
   current as you go.
4. `arbor graft`. On failure, act on the exit code below and graft again.

### Escalation

If the work needs verification that tests alone can't provide — visual or UX
changes, external services, destructive migrations, anything you can't confirm
mechanically — do not graft. Instead:

1. `arbor escalate <reason>`.
2. In `TODO.md`, state exactly what needs verifying and the question the
   human must answer — specific enough that a yes/no or a short answer
   unblocks the task.
3. Print the output of `arbor path <task>` so the human can find the worktree
   and view the work.

If you claim a tree whose `TODO.md` records an escalation that has not been
answered, do not resume work or graft: ask the user the open question and
wait for their answer first.

A successful graft discards the worktree, branch and record — the task is done
and disappears from `arbor ls`. Your working directory is deleted with it, so
`cd` to the main tree (the path graft prints) before running anything else.

## TODO.md

Your session can die at any moment. Keep a `TODO.md` at the worktree root so
another agent with zero context can `arbor claim` the task and continue. It is
gitignored — never commit it, and never mention it in a commit message.

Write it for a stranger: the task, what you have done, what is left, and
anything you learned that is not obvious from the diff (files that matter,
decisions made, dead ends, commands to verify). Update it as you finish steps,
not just at the end — an unupdated TODO.md is worse than none.

```markdown
# <task>

## Goal
One or two lines: what "done" means.

## Done
- [x] thing that is committed and working

## Next
- [ ] the immediate next step
- [ ] after that

## Notes
- Where the relevant code lives, decisions, dead ends, how to verify.
```

## Committing

Write plain commit messages with **no attribution**: no `Co-authored-by:`
trailers, no "Generated with", no agent/model names, no `--author` overrides.
Write it as a normal human-authored commit describing the change.

## Exit codes

Failures print JSON on stdout and an explanation on stderr.

- 0 — success.
- 1 `usage` — fix the invocation.
- 2 `conflict` — rebase left in progress. Resolve markers, `git add`,
  `git rebase --continue`, then graft again.
- 3 `tests_failed` — branch rolled back, trunk untouched. Fix the code and
  graft again.
- 4 `lease_lost` — another agent took the tree mid-graft. **Stop. Do not
  retry.**
- 5 `budget_exhausted` — out of graft attempts. Escalate, or prune and redo
  against current trunk.
- 6 `lease_live` — another agent is driving this tree.
- 7 `dirty` — uncommitted changes. Commit, then graft.
- 8 `not_found` — no such task, or not run from a task worktree.
- 9 `hook_failed` — `postCreate` failed; worktree exists. Fix and re-run the
  hook by hand.
- 10 `exists` — task already exists: claim it, or prune first.
- 11 `orphaned` — record with no worktree. Prune it.
- 12 `merge_failed` — trunk could not fast-forward (usually a dirty main
  worktree).
- 13 `already_pruned` — nothing left to remove.
- 14 `timed_out` — `arbor wait` gave up; the task is still going. Ask the human
  whether to keep waiting.
