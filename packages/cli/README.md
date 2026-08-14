# @webappwiz/cli

Keeps a project in step with a webappwiz release.

```bash
bunx @webappwiz/cli update             # pin @webappwiz/* deps, like bun update
bunx @webappwiz/cli skills ls          # what there is, and what you have
bunx @webappwiz/cli skills add arbor   # install an agent skill
bunx @webappwiz/cli skills update      # refresh the ones already installed
bunx @webappwiz/cli rules ls           # every rule there is
bunx @webappwiz/cli judge .            # check a directory against them
bunx @webappwiz/cli signoff            # does this change need a person?
```

## rules

Every rule webappwiz judges itself by lives in
[`@webappwiz/rules`](../rules/judge.ts) as a constant, one class each. There is
no config file and no preset: a rule is in that list or it does not exist.

```
ID                  RULE                       SET      LEVEL    FILES
no-em-dashes        No em dashes               judge    error    **/*.ts
one-class-per-file  One class per file         judge    error    **/*.ts
visual-work-tested  Visual work is tested      signoff
```

`rules show <id>` prints one in full: its glob, its level, and the document an
agent is handed verbatim.

The `SET` column is which of the two lists a rule is in. `judge` rules are what
`judge` checks files against, file by file. `signoff` rules have no glob and no
level because they are about a change rather than a file: `signoff` weighs them,
and what they answer is whether it needs a person rather than where the code is
wrong.

## signoff

Weighs a change against the signoff rules and exits 1 with a reason when one of
them wants a person to look before it merges. One agent call over the whole
diff, since that is what these rules are about.

```bash
bunx @webappwiz/cli signoff                    # everything since main
bunx @webappwiz/cli signoff --since HEAD~3     # measured against another ref
bunx @webappwiz/cli signoff --print            # the rules, to apply yourself
```

`--print` is the cheapest signoff there is: the agent about to merge reads the
rules and weighs its own change, spawning nothing. A project points its agent
instructions at that rather than at a list of rule ids, which goes stale the
next time a rule is added.

## judge

Runs the rules over a directory, one agent call per set of rules sharing a set
of files.

```bash
bunx @webappwiz/cli judge . --agent haiku
bunx @webappwiz/cli judge . --estimate        # what would this read, and cost
bunx @webappwiz/cli judge . --print           # print the prompts, spawn nothing
bunx @webappwiz/cli judge . --since main      # only what changed
```

Each rule's code half runs first, free, and only what it escalates reaches an
agent. `--budget` caps what a run may read before it asks whether you meant it;
`--estimate` answers that without having to guess a budget low enough to be
refused. `--print`, `--estimate` and running are three things to do with one
plan, so passing two of them is an error rather than one quietly winning. Code excuses itself from a rule with a `judge-ignore <id>: <reason>`
comment above the line, or `judge-ignore-file <id>: <reason>` for the file.

## update

Walks a directory for every `package.json` (workspaces, nested apps, anything)
and rewrites each `@webappwiz/*` dependency to one version. They are released
together, so a project running two of them at different versions is running a
combination nobody tested.

The default version is this package's own, which is the point of `bunx`: the
release you invoke is the release you get. `--version` pins something else.
`workspace:` ranges are left alone; inside a monorepo they already track each
other.

```bash
bunx @webappwiz/cli update ./apps --version 1.4.0
```

## skills

Puts the agent skills bundled with this package into `<dir>/.agents/skills/`.
Each skill's frontmatter carries the version it came from, so a stale copy is
visible rather than merely wrong.

```bash
bunx @webappwiz/cli skills ls ./project
bunx @webappwiz/cli skills add arbor ./project
bunx @webappwiz/cli skills update ./project
```

```
SKILL  SHIPS  INSTALLED
arbor  1.4.0  1.3.0
other  1.4.0  -
```

`add` installs one skill by name. `update` refreshes the ones a project already
has and never installs a new one: which skills a project uses is its own
business, and a skill nobody chose should not arrive by way of an update. `ls`
answers the one thing neither can: which version a project is actually holding.

Both replace what is there; local edits to a synced skill do not survive, and
are not meant to.
