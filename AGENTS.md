Use the arbor skill for any work that may change code: start a task with
`arbor add` before investigating, and land it with `arbor merge`.

After making code changes:

- `bin/wiz dev fix` typecheck, format, and check the project, scry included.
- `bin/wiz dev test` test each package.

Don't use em dashes.

Git stash is not used in this repo, so you don't have to check the stash.

`bin/wiz dev eval` (`evals/arbor-skill`) runs the arbor skill against
`claude -p` and costs real money: never run it, or ask a subagent to, unless
the user asks you to. `bin/wiz dev eval report` and the evals' tests, run with
`bin/wiz dev test`, spend nothing.
