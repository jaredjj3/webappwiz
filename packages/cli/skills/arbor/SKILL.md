---
name: arbor
description: Use the @webappwiz/arbor CLI to land your work on trunk, or a base branch given as an argument, from an isolated git worktree without pull requests. Read this before making any code change in an arbor repository, since it decides where the work happens, and whenever you need to add, claim, merge, remove, list, show, locate, wait for, or escalate a task.
argument-hint: "[base-branch]"
version: 0.0.0
---

# Using arbor

`arbor` runs many agents on one repo, each in its own git worktree, landing on
trunk without pull requests. Run it with `bunx @webappwiz/arbor <command>` (or
`arbor` if on PATH).

**Rule:** never use raw git for state transitions arbor covers. Every landing
goes through `arbor merge`. The only exception is finishing an in-progress
rebase (`git add` / `git rebase --continue`), then merging again.

Run `arbor --help` for the list of commands, and `arbor <command> --help` for
what a command does and its arguments.

## Before you start

Work happens in a worktree, and other agents may already be in one. Before
creating anything:

1. List the files and directories you expect to touch.
2. `arbor ls`. For each task in flight, `arbor show <task>`: it prints that
   task's state and its `TODO.md` without taking the lease, so looking cannot
   disturb the agent driving it. For the files it has actually changed:
   `git -C "$(arbor path <task>)" diff --name-only main...task/<task>`.
3. Compare with your list. If nothing overlaps, carry on.

If something does overlap, wait for it: the overlap disappears once the other
task merges, and starting now buys a rebase conflict instead. Do not ask
permission to wait; say one line about what you are doing, then block on it:

> `alpha` is already changing `packages/arbor/index.ts`. Waiting for it to
> land (up to 20 minutes) before I start.

```bash
arbor wait alpha --timeout 20   # minutes; default 30
```

Pick the timeout for how long the human is likely to be happy hearing nothing:
shorter when they are watching, longer for work that will obviously take a
while. Then act on how it returns:

- `gone`: the overlap has cleared. Redo the checks above (trunk has moved) and
  carry on.
- `escalated`: that task is stuck on a person, so yours is too. Tell the human
  what it is blocked on and what you were going to do, and wait for an answer.
- anything else it reports resting (`orphaned`, `stray`, `unrecorded`,
  `unknown`): that tree is broken and nobody is driving it. Say so and ask.
- exit 14 `timed_out`: it is still going. Go back to the human with the choice,
  and say what you have not done:

  > Still waiting on `alpha` after 20 minutes. I have not started anything.
  > Keep waiting, work alongside it, or pick up something else?

Only ask before waiting if the wait itself is the problem: the task has been
sitting for hours, or you were told this was urgent.

## Leases

A lease records who is driving a tree. `arbor add` and `arbor claim` take
one; `merge` and `rm` release it. `arbor ls` prints it in the `LEASE` column
and `arbor show` as `lease:`, with three values:

- `held`: an agent is on this tree right now. The heartbeat is under 90 seconds
  old and, when the holder is on this host, its process is still alive. Taking
  it fails with exit 6 `lease_held`. Leave the tree alone.
- `stale`: a lease is recorded but has gone quiet, because the agent exited or
  because it has not run an arbor command inside the staleness window. Arbor
  only heartbeats while a command runs, so an agent busy doing the actual work
  reads stale too. `claim` will take a stale lease, so read `arbor show <task>`
  before you assume the tree was abandoned.
- `none`: no lease recorded. Nobody has held this tree since it was created or
  last released.

The lease says who is on the tree, not how the work is going: a `stale` lease on
a `working` task is the normal state of a task mid-edit. `arbor wait` blocks on
the status for that reason, never on the lease.

## Workflow

1. `arbor add <task>` (or `arbor claim <task>` to resume; `arbor show
   <task>` first if you want to see what a tree is before taking its lease).
   A task lands on trunk by default; `arbor add <task> --base <branch>`
   makes one destined for another branch instead, starting from it and
   merging onto it. `arbor show` prints a task's base. When this skill is
   invoked with a branch argument (`/arbor feature/auth`), or the user names
   the branch the work should land on, pass it as `--base` to every task you
   create for that request. Otherwise omit `--base`; never guess a base from
   the currently checked-out branch.
2. Write `TODO.md` at the worktree root before starting (see below).
3. Do the work; commit with git (arbor never commits for you). Keep `TODO.md`
   current as you go.
4. `arbor merge`. On failure, act on the exit code below and merge again.

### Escalation

If the work needs verification that tests alone can't provide (visual or UX
changes, external services, destructive migrations, anything you can't confirm
mechanically) do not merge. Instead:

1. `arbor escalate <reason>`.
2. Under `## Blocked` in `TODO.md`, state exactly what needs verifying and the
   question the human must answer, specific enough that a yes/no or a short
   answer unblocks the task.
3. Print the output of `arbor path <task>` so the human can find the worktree
   and view the work.

Never ask a human to picture a change. Leave something they can look at, and
print its **absolute path** so it is one click from the terminal. For anything
visual or UX (a page, a component, CLI output, a rendered file), that means a
screenshot: if starting the thing is cheap (a dev server, a script, a command
that prints), just start it, capture it, and say where the image is. If it is
expensive or has side effects (a full build, a deploy, anything touching a real
service), ask before starting it, and say what it will cost.

> Screenshot of the new task card:
> `/Users/you/repo-arbor/mytask/.arbor-shots/task-card.png`
> Dev server still up at http://localhost:5173 if you want to click around.

A screenshot is not a substitute for the question: `## Blocked` still ends in
something a human can answer with a yes or a sentence.

If you claim a tree whose `TODO.md` has a `## Blocked` section that has not been
answered, do not resume work or merge: ask the user the open question and
wait for their answer first.

A successful merge discards the worktree, branch and record: the task is done
and disappears from `arbor ls`. Your working directory is deleted with it, so
`cd` to the main tree (the path merge prints) before running anything else.

## TODO.md

Your session can die at any moment. Keep a `TODO.md` at the worktree root so
another agent with zero context can `arbor claim` the task and continue. It is
gitignored: never commit it, and never mention it in a commit message.

Write it for a stranger: the task, what you have done, what is left, and
anything you learned that is not obvious from the diff (files that matter,
decisions made, dead ends, commands to verify). Update it as you finish steps,
not just at the end. An unupdated TODO.md is worse than none.

The shape is fixed, so anyone reading it knows where to look:

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

## Blocked
What needs verifying, and the one question a human has to answer?
```

- The title is `# <task>`: the task name, exactly as `arbor add` took it.
- `## Goal` and `## Next` are required. `Done`, `Notes` and `Blocked` are there
  when they have something in them. Nothing else: put it under `Notes`.
- Work is checkboxes, `- [ ]` and `- [x]`. `## Next` always has at least one
  unchecked item, since a task with nothing left merges and disappears. Move a
  finished item to `## Done` rather than deleting it: what you have already
  tried is context a stranger needs.
- Those checkboxes are the only progress the task reports: `Done` over
  `Done + Next` is the bar `arbor dev` draws for it. So write every step you
  can foresee as a `- [ ]` item before you start, keep them roughly one
  commit's worth of work each, and check one off as soon as it is done rather
  than at the end. A task that discovers work as it goes will see the bar go
  backwards, which is honest and fine; one that keeps a single "do the thing"
  item reports nothing at all.
- `## Blocked` only when you `arbor escalate`, and it ends in a real question.

`arbor show <task>` prints the file and every way it departs from that shape.
Run it on your own task once you have written the file.

## Committing

Write plain commit messages with **no attribution**: no `Co-authored-by:`
trailers, no "Generated with", no agent/model names, no `--author` overrides.
Write it as a normal human-authored commit describing the change.

## Exit codes

Failures print JSON on stdout and an explanation on stderr.

- 0: success.
- 1 `usage`: fix the invocation.
- 2 `conflict`: rebase left in progress. Resolve markers, `git add`,
  `git rebase --continue`, then merge again.
- 3 `tests_failed`: branch rolled back, trunk untouched. Fix the code and
  merge again.
- 4 `lease_lost`: another agent took the tree mid-merge. **Stop. Do not
  retry.**
- 5 `budget_exhausted`: out of merge attempts. Escalate, or rm and redo
  against current trunk.
- 6 `lease_held`: another agent is driving this tree.
- 7 `dirty`: uncommitted changes. Commit, then merge.
- 8 `not_found`: no such task, or not run from a task worktree.
- 9 `hook_failed`: `postCreate` failed; worktree exists. Fix and re-run the
  hook by hand.
- 10 `exists`: task already exists. Claim it, or rm first.
- 11 `orphaned`: record with no worktree. Remove it with `arbor rm`.
- 12 `merge_failed`: trunk could not fast-forward (usually a dirty main
  worktree).
- 13 `already_removed`: nothing left to remove.
- 14 `timed_out`: `arbor wait` gave up; the task is still going. Ask the human
  whether to keep waiting.
