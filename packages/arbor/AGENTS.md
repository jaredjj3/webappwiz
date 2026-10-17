arbor has moved to its own repository, `stringsync/splates`, with its
history, beside its skill and evals. Make changes to arbor there, not here:
what is left of `packages/arbor`, `skills/arbor` and `evals/arbor-skill` in
webappwiz goes when #309 retires `@webappwiz/arbor`.

If you change this package's API, check that the agent skill at
`skills/arbor/SKILL.md` is still in sync. That is the source; this repo's
`.agents/skills/arbor` links to it, and other projects install it from a
release tag with `bunx skills add`.

`arbor` runs whichever checkout you are standing in, so working on this package
from a worktree merges with the code you are editing. Pin the main tree for the
merge itself: `WEBAPPWIZ_ROOT="$(arbor path)" arbor merge`.

To compare a change to the skill, the user runs `bin/wiz dev eval` (see
`evals/arbor-skill/README.md`). Only they start it: it spends money.
