# @webappwiz/rules

Rules written in markdown, and webappwiz's catalog of them. Nothing here runs
a rule: a rule is English an agent reads, helped by any scripts beside it, and
this package's job is to keep the documents in shape and to ship the ones
webappwiz maintains.

The catalog is one directory per rule under [`catalog/`](./catalog),
exported from `@webappwiz/rules/catalog` as id to the files in that
directory. A project copies the ones it wants into `.wiz/rules` with
`@webappwiz/cli rules add`, or the ones the catalog recommends with
`rules add --recommended`, and writes its own beside them. The `scry` skill
reviews a change against them.

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
`level` is `error` or `warning`, `error` when absent. `recommended: true` puts
a rule in the set `rules add --recommended` installs, which is for a rule that
reads on any project rather than one about a stack it may not have. A rule
that shipped carries `version`; one a project wrote does not.

`Rules.load(dir)` reads every rule under `<dir>/.wiz/rules` and reports every
broken one at once.

## Scripts

A script does the part of a rule a program can settle, so the agent judging
it starts from a short list. It takes the files to check as arguments,
prints one candidate a line as `file:line: message`, exits 0 whether it found
anything or not, and never writes. The rule's `RULE.md` says how to run it.
[`example-script`](./catalog/example-script) shows the shape.

A script runs on every review of its rule, so it is code a project trusts the
way it trusts an agent skill: read it before it runs.
