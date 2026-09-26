# @webappwiz/cli

Keeps a project in step with a webappwiz release: its dependencies, its agent
skills, and the rules it copied from the catalog.

```bash
bunx @webappwiz/cli update                 # pin webappwiz deps, like bun update
bunx @webappwiz/cli skills list            # what there is, and what you have
bunx @webappwiz/cli skills add scry        # install an agent skill
bunx @webappwiz/cli skills update          # refresh the ones already installed
bunx @webappwiz/cli rules list             # every rule there is, and what you have
bunx @webappwiz/cli rules add <id>         # copy a shipped rule in
bunx @webappwiz/cli rules add --recommended   # copy the recommended ones
bunx @webappwiz/cli rules update           # refresh the copies
```

## rules

A project's rules live in `.wiz/rules`, tracked with its code, one directory
per rule holding a `RULE.md` and, when it helps, `scripts/` and
`references/` beside it. The ones that ship come from
[`@webappwiz/rules`](../rules)'s catalog, and a project's own sit beside them
in the same shape. The `scry` skill reviews a change against them.

```
rule                 level    recommended   files          ships    installed   description
no-em-dashes         error    yes           **/*.{ts,md}   0.1.0    0.1.0       No em dashes, and no en dashes between words.
one-class-per-file   error    yes           **/*.ts        0.1.0    -           A file declares one top-level class.
mine                 error    -             **/*.ts        -        local       What this project wants.
```

`list` validates the frontmatter of every rule the project has and refuses to
list a broken one, naming the file and line instead. The body is the author's,
as a skill's is. `add` copies a shipped rule in, scripts and all, where it
runs and can be edited; `update` refreshes those copies and leaves the
project's own alone. Both replace what is there, as `skills` does.

A rule's scripts run whenever `scry` reviews against it, so they carry the
same risk as an agent skill: whoever installs them is trusting their code.
`add` and `update` name every script they write or change, so it can be read
before the next review.

`add --recommended` copies every rule the catalog recommends, which is the
way to start: the rules that read on any TypeScript, without the ones that
are about a stack a project may not have. It takes no rule id, so the
directory is the only positional it reads, with the flag last as everywhere
else here: `rules add ./project --recommended`. A project decides for itself
after that, since a copied rule is the project's to edit or delete.

Code excuses itself from a rule with a `scry-ignore <id>: <reason>`
comment above the line, or `scry-ignore-file <id>: <reason>` for the
file. These were `rule-ignore` and `rule-ignore-file` before the `scry`
skill replaced `review`; `scry` still honors the old spelling, but a project
should migrate, which is a plain find and replace of `rule-ignore` with
`scry-ignore`.

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
bunx @webappwiz/cli skills list ./project
bunx @webappwiz/cli skills add scry ./project
bunx @webappwiz/cli skills update ./project
```

```
SKILL      SHIPS  INSTALLED
arbor      1.4.0  1.3.0
scry       1.4.0  -
webappwiz  1.4.0  -
```

Three ship: `arbor`, which lands an agent's work from its own worktree;
`scry`, which reviews a change against a project's rules with parallel
agents, and adds, updates, and removes them; and
`webappwiz`, which sends an agent to the package's catalogue before it writes
infrastructure by hand.

`add` installs one skill by name. `update` refreshes the ones a project already
has and never installs a new one: which skills a project uses is its own
business, and a skill nobody chose should not arrive by way of an update.
The one exception is a renamed skill, which the project did choose: `update`
replaces our copy under the old name, such as `review`, with the new one.
`list` answers the one thing neither can: which version a project is actually
holding.

Both replace what is there; local edits to a synced skill do not survive, and
are not meant to.
