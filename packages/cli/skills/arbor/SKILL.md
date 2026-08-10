---
name: arbor
description: Use the @webappwiz/arbor CLI to land your work on trunk from an isolated git worktree without pull requests. Use this whenever you are an AI coding agent working on a task in an arbor worktree and need to create, claim, graft, prune, list, locate, or escalate a workstream.
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

## Workflow

1. `arbor create <task>` (or `arbor claim <task>` to resume).
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
