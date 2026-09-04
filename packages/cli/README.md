# @webappwiz/cli

Keeps a project in step with a webappwiz release, and divides a review of its
rules up for an agent to run.

```bash
bunx @webappwiz/cli update                 # pin webappwiz deps, like bun update
bunx @webappwiz/cli skills ls              # what there is, and what you have
bunx @webappwiz/cli skills add review      # install an agent skill
bunx @webappwiz/cli skills update          # refresh the ones already installed
bunx @webappwiz/cli rules ls               # every rule there is, and what you have
bunx @webappwiz/cli rules new <name>       # scaffold a rule of your own
bunx @webappwiz/cli rules add <id>         # copy a shipped rule in
bunx @webappwiz/cli rules add --recommended   # copy the recommended ones
bunx @webappwiz/cli rules update           # refresh the copies
bunx @webappwiz/cli rules review --since main   # divide a review up
```

## rules

A project's rules live in `.wiz/rules`, one directory per rule holding a
`RULE.md`: markdown with a little frontmatter, and no code. A rule is there or
it does not run. The ones that ship come from
[`@webappwiz/rules`](../rules)'s catalog, and a project's own sit beside them
in the same shape.

```
rule                 level    complexity   recommended   files          ships    installed   description
no-em-dashes         error    low          yes           **/*.{ts,md}   0.1.0    0.1.0       No em dashes, and no en dashes between words.
one-class-per-file   error    low          yes           **/*.ts        0.1.0    -           A file declares one top-level class.
mine                 error    medium       -             **/*.ts        -        local       What this project wants.
```

`ls` validates the frontmatter of every rule the project has and refuses to
list a broken one, naming the file and line instead. The body is the author's,
as a skill's is. `new` writes a `RULE.md` to fill in, with a comment saying
what goes where. `add` copies a shipped rule in, where it runs
and can be edited; `update` refreshes those copies and leaves the project's
own alone. Both replace what is there, as `skills` does.

`add --recommended` copies every rule the catalog recommends, which is the
way to start: the rules that read on any TypeScript, without the ones that
are about a stack a project may not have. It takes no rule id, so the
directory is the only positional it reads, with the flag last as everywhere
else here: `rules add ./project --recommended`. A project decides for itself
after that, since a copied rule is the project's to edit or delete.

### review

Nothing here spawns an agent. `review` asks git what changed since a ref,
matches each rule's glob against it, and prints the blocks of work that
divides into. A block gathers the rules of one complexity that match the same
files, so the agent that gets it reads each of those files once and judges it
against all of them:

```
2 files changed since main; 3 rules matched, 2 blocks to review

## block 1 (2 rules, 2 files, complexity low)

Read each rule listed below and apply those rules, and only those, to the
files listed after them. ...

Rules:

- `.wiz/rules/no-em-dashes/RULE.md` (no-em-dashes, error)
- `.wiz/rules/one-class-per-file/RULE.md` (one-class-per-file, error)

Files:

- src/a.ts
- src/b.ts (new)

Reply with only a JSON array, one element per violation, or [] when there
is none: [{"rule": ..., "file": ..., "line": ..., "message": ...}]
```

A block is the whole prompt for one subagent. It names each rule's file rather
than quoting it, so the agent that prints the blocks and spawns the subagents
never reads a rule, and the rules stay out of its context. The heading
carries the complexity its rules share, for choosing a model, and each rule is
listed with its level, so findings can be reported without opening anything.

How wide a block goes depends on that complexity: a `low` rule is a grep, so
several ride together, while a `high` rule takes a block to itself, where a
second rule in the prompt would cost more attention than the reread it saves.
`--chunk` caps the files in a block whatever the complexity.

The `review` skill teaches an agent the loop.

Code excuses itself from a rule with a `rule-ignore <id>: <reason>` comment
above the line, or `rule-ignore-file <id>: <reason>` for the file.

## update

Walks a directory for every `package.json` (workspaces, nested apps, anything)
and rewrites each webappwiz dependency to one version. They are released
together, so a project running two of them at different versions is running a
combination nobody tested.

The default version is this package's own, which is the point of `bunx`: the
release you invoke is the release you get. `--version` pins something else.
`workspace:` ranges are left alone; inside a monorepo they already track each
other. Installed skills and copied rules are refreshed too.

```bash
bunx @webappwiz/cli update ./apps --version 1.4.0
```

## skills

Puts the agent skills bundled with this package into `<dir>/.agents/skills/`.
Each skill's frontmatter carries the version it came from, so a stale copy is
visible rather than merely wrong.

```bash
bunx @webappwiz/cli skills ls ./project
bunx @webappwiz/cli skills add review ./project
bunx @webappwiz/cli skills update ./project
```

```
SKILL      SHIPS  INSTALLED
arbor      1.4.0  1.3.0
review     1.4.0  -
webappwiz  1.4.0  -
```

Three ship: `arbor`, which lands an agent's work from its own worktree;
`review`, which runs the rules through subagents without reading one; and
`webappwiz`, which sends an agent to the package's catalogue before it writes
infrastructure by hand.

`add` installs one skill by name. `update` refreshes the ones a project already
has and never installs a new one: which skills a project uses is its own
business, and a skill nobody chose should not arrive by way of an update. `ls`
answers the one thing neither can: which version a project is actually holding.

Both replace what is there; local edits to a synced skill do not survive, and
are not meant to.
