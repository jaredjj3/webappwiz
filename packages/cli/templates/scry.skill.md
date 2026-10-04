---
name: scry
description: "Write, update, and remove the scry rules in this project's .wiz/scry, which `wiz scry` checks a change against like a linter. Use when the user explicitly asks for a rule, or asks for a style or convention change across the codebase that a rule could enforce from now on (\"stop using default exports\", \"comments should say why\"). Also use when asked to scry a change or run `wiz scry`."
version: 0.0.31
---

# Scry

`wiz scry` checks a change against the project's rules. A rule is a
directory under `.wiz/scry`, tracked with the code it governs:

```
.wiz/scry/<id>/
├── RULE.md        # required: what the rule wants, in prose a model judges by
├── scripts/       # optional: programs that do the mechanical part
├── evals/         # optional: cases whose answer is known, like tests
└── references/    # optional: anything longer the rule points to
```

`RULE.md` opens with frontmatter:

- `name`: its directory, in kebab case. Required.
- `description`: one line. Required.
- `files`: a glob of the files it applies to. Every file when absent.
- `level`: `error` or `warning`. `error` when absent.
- `effort`: how much judgment it takes, which picks the model that checks
  it. `none` when its scripts decide it alone and no model runs, `low` for a
  grep or a count, `medium` (the default) for most rules, `high` for design
  judgment across a whole file.
- `threshold`: how sure the model has to be that a change breaks the rule
  before it is reported, from 0 to 1. 0.7 when absent; raise it for a rule
  that reports too much, lower it for one that misses.

The body is what a decision model judges by: it reads the rule, the file and
the change, and answers how likely the changed lines are to break the rule,
without writing anything. So the body has to say what counts and what does
not plainly enough that no reasoning is needed. One condition a rule judges
best; good and bad examples do the rest.

Code excuses itself from a rule with a comment holding
`scry-ignore <id>: <reason>`, which covers the statement under it, or
`scry-ignore-file <id>: <reason>`, which covers the whole file. Before scry
these were `rule-ignore` and `rule-ignore-file`; the old spelling still
counts, `wiz scry` names the files that use it, and renaming them is a plain
find and replace. When you touch one of those files, rename its comments.

Run the CLI with `bunx @webappwiz/cli scry`, which checks, or
`bunx @webappwiz/cli scry <command>`: `list`, `add <id>`, `add --recommended`,
`update`, `remove <id>`. `scry --help` says the rest. A project from before
scry, with rules in `.wiz/rules`, moves them with `bunx @webappwiz/cli update`.

## Checking a change

`wiz scry` is a linter: it finds the change with git, asks a decision model
how likely each changed file is to break each of its rules, and prints one
block of findings, each with that probability. When the user names
directories or files, pass them, as in `bunx @webappwiz/cli scry
packages/api`, and it checks only the changed files under them.
Show its report as it printed it, in one code block, and add nothing to it.
The progress lines it prints to stderr while the calls run are not part of
the report; leave them out.
Fixing what it found is a separate request; do not start unless asked.

## Fixing what it found

The model decides what is reported; fixing it is yours. For each finding,
read the rule it names, `.wiz/scry/<rule>/RULE.md`, and change the lines it
points at to follow it. A finding about a run of added lines points at the
first of them, so read the run. Then run `wiz scry` again on the same paths.
A finding is a probability, not a proof: when the code already follows the
rule, leave it, say which finding you left and why, and offer a
`scry-ignore` comment or a higher `threshold` for the rule rather than
working around it.

## Models

Each effort has a model, `clef` for all three when nothing says
otherwise. `clef` and `clef-flash` run on
Cloudflare Workers AI and need `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`; a Jev like `jev-latest` runs on TypeSafe and needs
`TYPESAFE_API_KEY`. They come from the environment, or else the system's
secret store. When `wiz scry` says one is missing, ask the user to run
`bunx @webappwiz/cli creds add <NAME>` themselves, which asks for the
value at a hidden prompt. Never ask for a value, set one, or look one up;
`bunx @webappwiz/cli creds list` shows what is there without showing
any. Models are
set per effort in `.wiz/config.ts` (the project's),
`~/.config/wiz/config.ts` (the user's own, over the project's), or
`WIZ_SCRY_MODEL_LOW`, `_MEDIUM`, `_HIGH` (over both), and `--model <name>`
judges every rule with one, to compare two:

```ts
import { defineConfig } from "@webappwiz/cli/config";

export default defineConfig({
	scry: {
		models: { low: "clef", medium: "clef", high: "clef" },
		jobs: 8, // calls at once
	},
});
```

To compare models, or to see whether a rule's wording or `threshold` works,
run `bunx @webappwiz/cli scry eval`, once per model with `--model`. It
judges each rule against its eval cases and its Good and Bad examples and
says which it got wrong. A rule that gets its own cases wrong needs plainer
prose, clearer examples, or another threshold before it can be trusted on
real code.

When it refuses a config holding `agents`, `budget` or `batch`, those are
from before decision models: show the user the message, and with their
yes, replace `agents` with `models` and drop the other two.

## When a style change could be a rule

When the user asks for a change across the codebase that should hold from
now on, not just once, offer a rule for it before or alongside making the
change: a rule keeps the next change from undoing it. Making the change now
and adding the rule are two pieces of work; say which you are doing.

## Adding a rule

1. Find out what the rule wants: what counts, what does not, and an example
   of each. Ask for what the user has not said.
2. **Check whether the project's own tooling can enforce it** before writing
   anything. Find out what the project actually runs, from its manifests and
   lockfiles, its linter, formatter, and compiler configuration, its
   pre-commit hooks, its CI workflows, and its own check scripts, and
   consider only those tools. When one of them can express the rule, say so,
   show the configuration you would add, and ask whether to do that instead
   of the rule, or as well: a linter checks every file for nothing, and a
   rule costs a model call. When nothing the project runs fits, say so, and
   do not propose adopting a new tool unless asked.
3. When a shipped rule covers it, `wiz scry add <id>` copies it in, and it can
   be edited from there. Otherwise write `.wiz/scry/<id>/RULE.md`, with an
   id that says what the rule wants.
4. Pick the lowest effort that can judge it. When part of it is mechanical,
   offer a script (see Scripts); when a script can decide all of it, the
   rule takes `effort: none` and costs nothing to check.
5. Write its evals (see Evals).
6. Run `wiz scry list`, which validates every rule's frontmatter and names the
   line that is wrong, then `wiz scry eval <id>`.

## Updating a rule

Edit it, and check the project's tooling again when what it asks changes.
Keep its examples in step with its prose. A rule copied from the catalog
takes local edits, but `wiz scry update` overwrites them; say so before editing
one that carries a `version`, and offer to drop that line so the copy
becomes the project's own.

## Removing a rule

Confirm with the user, then run `wiz scry remove <id>`, which deletes its
directory, scripts and all.

## Evals

A rule's `evals/` holds cases whose answer is known, the way tests sit
beside code. `<name>.good.<ext>` is a file that should not be found to
break the rule; `<name>.bad.<ext>` is one that should. Write a few of each
for every rule a model judges:

- Name a case for what the code is (`invoice-parser.ts`,
  `cart-totals.test.ts`), never for the verdict or the rule: the model is
  shown `<name>.<ext>`.
- Make them different from the rule's own Good and Bad examples, which the
  model reads with the rule: an eval case is the only code it has not seen.
- Bad cases break the rule plainly, by its own wording, one way each. Good
  cases include a near miss the rule's wording excuses, and one the rule
  does not apply to.
- No comment says which a case is.

A check never checks them. When `wiz scry eval` gets one wrong, change the
rule's prose, examples or `threshold`, not the case, unless the case was
wrong by the rule's own wording.

## Scripts

A script does the part of a rule a program can settle. `wiz scry` runs
every file in the rule's `scripts/`, so each one follows this contract:

- It opens with a `#!` line naming what runs it, such as `#!/bin/sh` or
  `#!/usr/bin/env bun`. That line is how it runs; it needs no executable bit.
- It takes the files to check as arguments, from the project root.
- It prints one candidate a line, `file:line: message`, and exits 0 whether
  it found anything or not. A nonzero exit reports the rule as not checked.
- It reads and never writes.

With `effort: none`, every line it prints is a finding. With any other
effort, the model judges each line it prints against the rule, and a
finding there carries the script's message, so a script that only narrows
the search is still worth having. Write it in whatever the project
already runs, so it needs nothing new installed.

**Every new or changed script needs the user's approval before it is
saved.** Show the whole script, or the whole diff, and say plainly that it
runs on every future `wiz scry`, on whatever machine runs one, so it
deserves the same line-by-line reading as any code about to execute.
Strongly encourage them to read it, then wait for a yes. The same goes for
scripts that arrive from elsewhere: when `wiz scry add` or `wiz scry update`
reports a script, pass its warning on and ask the user to read it before the
next check.
