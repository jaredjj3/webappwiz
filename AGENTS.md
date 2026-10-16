Use the arbor skill for any work that may change code: start a task with
`arbor add` before investigating, and land it with `arbor merge`.

After making code changes:

- `bin/wiz dev fix` typecheck, format, and check the project, scry included.
- `bin/wiz dev test` test each package. It takes a heavy-job slot itself, so
  it needs no `arbor heavy`.

During an arbor task, the user may be on the arbor dev server from another device, so give every link as both its remote and its local URL.

Only run `bin/wiz dev eval` when the user asks you to, since it uses tokens the
user pays for: billed to an API key, or counted against their Claude plan's
usage limits.
`bin/wiz dev eval report` and the evals' tests (`bin/wiz dev test`) are free.
