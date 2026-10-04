# @webappwiz/scry

Rules written in markdown, the check that runs them against a change, and
webappwiz's catalog of them. A rule is English a decision model judges by,
helped by any scripts beside it; this package parses rules, plans and runs a
check, and ships the rules webappwiz maintains. `@webappwiz/cli scry` is its
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
├── scripts/        # optional
│   └── check.sh
└── evals/          # optional
    ├── route-table.good.ts
    └── user-service.bad.ts
```

```markdown
---
name: no-default-exports
description: Modules export named bindings, never a default.
files: "**/*.{ts,tsx}"
level: error
effort: low
threshold: 0.7
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
author's, the way a skill's is: it only has to say plainly enough what
counts that a model reading nothing else can judge the rule.

`files` is a glob of the files the rule applies to, every file when absent.
`level` is `error` or `warning`, `error` when absent. `effort` is how much
judgment the rule takes, which picks the model that checks it: `none` when
its scripts decide it and no model runs, `low`, `medium` (the default), or
`high`. `threshold` is how sure the model has to be, from 0 to 1, before a
finding is reported, 0.7 when absent. `recommended: true` puts
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
const account = { id: accountId, token: apiToken };
const report = await check.run({
	judges: new Map([
		["low", new Clef("clef", account)],
		["medium", new Clef("clef", account)],
		["high", new Jev("jev-latest", typesafeKey)],
	]),
	jobs: 8,
});
```

`Git.changes` is what changed since a ref, or with none, the uncommitted work
when there is any and otherwise the branch since trunk, kept to the paths it
is given. `Git.locate` finds the repository root and turns paths from a
working directory into paths from it. `Check.prepare` does everything that
costs nothing: it matches rules to files, runs their scripts, and builds
the `Call`s. A call is one judgment about one file, for the rules of one
effort it matches: the file's numbered text, its diff and those rules go in
its state once, with a yes-or-no question for each rule and each run of
lines the change added, and one for each line a script flagged. Lines and
files a `scry-ignore` comment excuses are never asked about. A file with
more than 64 questions takes more than one call. `tokens` estimates what the
calls would send.

`run` sends them to a `Judge`, anything with `judge(judgment)` that answers
each question with the probability of yes. `Clef` (`clef` or `clef-flash` on
Cloudflare Workers AI) and `Jev` (on TypeSafe, or anything else serving
`/v1/systemone`) are the two this package has; both take the request and
reply of the Jev API. A finding is a question answered at or above its
rule's threshold, with that `probability`, and it names the rule's
description, or the script's message for a flagged line. A call that fails
or leaves a question unanswered is reported as unchecked, never guessed at.

## Evals

A rule's `evals/` holds cases whose answer is known, the way tests sit
beside code: `<name>.good.<ext>` is a file that should not be found to
break the rule, and `<name>.bad.<ext>` one that should. The model is shown
`<name>.<ext>`, so a name says what the code is, never which it is. A check
never checks a rule's eval cases, and the repository's own biome and tsc
leave them out, since a bad one breaks the rule on purpose.

`Evaluation.prepare({ dir, rules })` makes a call for each eval case and
each code block under a rule's `## Good` and `## Bad`, the same call a check
makes for a new file, and `run({ judges, jobs })` reports what probability
each came back with and whether that is right at the rule's threshold:
under it for a good case, at or over it for a bad one. The code blocks are
in the rule the model reads, so they are a floor; the eval cases are code it
has not seen. It is how two judges are compared, and how a rule's wording
or threshold is tuned.

## Scripts

A script does the part of a rule a program can settle. A check runs every
file in a rule's `scripts/` with the rule's changed files as arguments, by
the interpreter its `#!` line names. It prints one candidate a line as
`file:line: message`, exits 0 whether it found anything or not, and never
writes. Under `effort: none` its lines are findings, honoring `scry-ignore`
comments; under any other effort the model judges each one.
[`example-script`](./catalog/example-script) shows the shape.

A script runs on every check of its rule, so it is code a project trusts the
way it trusts an agent skill: read it before it runs.
