# @webappwiz/cli

Keeps a project in step with a webappwiz release, and divides a review of its
rules up for an agent to run.

```bash
bunx @webappwiz/cli update                 # pin webappwiz deps, like bun update
bunx @webappwiz/cli skills ls              # what there is, and what you have
bunx @webappwiz/cli skills add rules-review   # install an agent skill
bunx @webappwiz/cli skills update          # refresh the ones already installed
bunx @webappwiz/cli rules ls               # every rule there is, and what you have
bunx @webappwiz/cli rules new <name>       # scaffold a rule of your own
bunx @webappwiz/cli rules add <id>         # copy a shipped rule in
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
rule                 level    complexity   files          ships    installed   description
no-em-dashes         error    low          **/*.{ts,md}   0.1.0    0.1.0       No em dashes, and no en dashes between words.
one-class-per-file   error    low          **/*.ts        0.1.0    -           A file declares one top-level class.
mine                 error    medium       **/*.ts        -        local       What this project wants.
```

`ls` validates the frontmatter of every rule the project has and refuses to
list a broken one, naming the file and line instead. The body is the author's,
as a skill's is. `new` writes a `RULE.md` to fill in, with a comment saying
what goes where. `add` copies a shipped rule in, where it runs
and can be edited; `update` refreshes those copies and leaves the project's
own alone. Both replace what is there, as `skills` does.

### review

Nothing here spawns an agent. `review` asks git what changed since a ref,
matches each rule's glob against it, and prints one block of work per rule
that matched, cut into several when a rule matched more than `--chunk` files:

```
2 files changed since main; 2 rules matched, 2 blocks to review

## no-em-dashes (2 files, complexity low)

Read `.wiz/rules/no-em-dashes/RULE.md` and apply that rule, and only that
rule, to the files listed below. ...

- src/a.ts
- src/b.ts (new)

Reply with only a JSON array, one element per violation, or [] when there
is none: [{"file": ..., "line": ..., "message": ...}]
```

A block is the whole prompt for one subagent. It names the rule's file rather
than quoting it, so the agent that prints the blocks and spawns the subagents
never reads a rule, and the rules stay out of its context. The heading
carries the rule's complexity, for choosing a model. The `rules-review` skill
teaches an agent the loop.

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
bunx @webappwiz/cli skills add rules-review ./project
bunx @webappwiz/cli skills update ./project
```

```
SKILL         SHIPS  INSTALLED
arbor         1.4.0  1.3.0
rules-review  1.4.0  -
webappwiz     1.4.0  -
```

Three ship: `arbor`, which lands an agent's work from its own worktree;
`rules-review`, which runs the rules through subagents without reading one;
and
`webappwiz`, which sends an agent to the package's catalogue before it writes
infrastructure by hand.

`add` installs one skill by name. `update` refreshes the ones a project already
has and never installs a new one: which skills a project uses is its own
business, and a skill nobody chose should not arrive by way of an update. `ls`
answers the one thing neither can: which version a project is actually holding.

Both replace what is there; local edits to a synced skill do not survive, and
are not meant to.
