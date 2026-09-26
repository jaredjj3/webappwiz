# @webappwiz/scry

Rules written in markdown, the check that runs them against a change, and
webappwiz's catalog of them. A rule is English an agent reads, helped by any
scripts beside it; this package parses rules, plans and runs a check, and
ships the rules webappwiz maintains. `@webappwiz/cli scry` is its
command line. It was published as `@webappwiz/rules` until it took scry's
name; `@webappwiz/cli update` renames the dependency.

The catalog is one directory per rule under [`catalog/`](./catalog),
exported from `@webappwiz/scry/catalog` as id to the files in that
directory. A project copies the ones it wants into `.wiz/scry` with
`@webappwiz/cli scry add`, or the ones the catalog recommends with
`scry add --recommended`, and writes its own beside them.

## A rule

```
no-default-exports/
├── RULE.md
└── scripts/        # optional
    └── check.sh
```

```markdown
---
name: no-default-exports
description: Modules export named bindings, never a default.
files: "**/*.{ts,tsx}"
level: error
effort: low
recommended: true
---

# No default exports

Why, and what counts.

## Good

## Bad
```

`Rule.parse` is the only way to make one, so holding a `Rule` means the
frontmatter passed: it has a `name` matching its directory and a
`description`. Anything else fails with `path:line: why`. The body is the
author's, the way a skill's is: it only has to say enough that an agent who
reads nothing else can judge the rule.

`files` is a glob of the files the rule applies to, every file when absent.
`level` is `error` or `warning`, `error` when absent. `effort` is how much
judgment the rule takes, which picks the agent that checks it: `none` when
its scripts decide it and no agent runs, `low`, `medium` (the default), or
`high`. `recommended: true` puts
a rule in the set `scry add --recommended` installs, which is for a rule that
reads on any project rather than one about a stack it may not have. A rule
that shipped carries `version`; one a project wrote does not.

`Rules.load(dir)` reads every rule under `<dir>/.wiz/scry` and reports every
broken one at once.

## A check

```ts
const { root, paths } = await Git.locate(process.cwd(), ["packages/api"]);
const rules = await Rules.load(root);
const changes = await new Git(root).changes("main", paths);
const check = await Check.prepare({ dir: root, rules, changes });
console.log(check.tokens, check.efforts);
const report = await check.run({ agents, jobs: 4 });
```

`Git.changes` is what changed since a ref, or with none, the uncommitted work
when there is any and otherwise the branch since trunk, kept to the paths it
is given. `Git.locate` finds the repository root and turns paths from a
working directory into paths from it. `Check.prepare` does everything that
costs nothing: it matches rules to files, runs their scripts, and builds
the `Call`s. A call holds one effort's rules once and every file that
matches exactly those rules, until the next file would take it past `batch`
estimated input tokens (32,000 by default). `tokens` estimates what the calls would send, so a
caller can ask before spending it. `run` sends them to an `Agent`, anything
with `ask(prompt)`, and reads the last JSON array in each reply. A call that
fails or cannot be read is reported as unchecked, never guessed at.

## Scripts

A script does the part of a rule a program can settle. A check runs every
file in a rule's `scripts/` with the rule's changed files as arguments, by
the interpreter its `#!` line names. It prints one candidate a line as
`file:line: message`, exits 0 whether it found anything or not, and never
writes. Under `effort: none` its lines are findings, honoring `scry-ignore`
comments; under any other effort they go to the agent as candidates.
[`example-script`](./catalog/example-script) shows the shape.

A script runs on every check of its rule, so it is code a project trusts the
way it trusts an agent skill: read it before it runs.
