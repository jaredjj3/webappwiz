---
name: review
description: Review a change against the project's rules in .wiz/rules by handing each rule to a subagent, never reading a rule yourself. Use after the work is done and its tests pass, whenever asked to review, lint, or check style against the rules, and whenever asked to write, add, or change a rule.
version: 0.0.10
---

# Reviewing against the rules

The rules are markdown, one per directory under `.wiz/rules`, each a `RULE.md`
a subagent reads. You never read one. Reading rules loads their prose into
your context and you start reasoning about style instead of running the
review, so the whole loop is built to keep them out of your sight: the CLI
divides the work into blocks that name a rule's file, and a subagent opens it.

Run the CLI with `bunx @webappwiz/cli rules <command>` (or `wiz cli rules`
if `wiz` is on PATH). `rules --help` lists the commands; this file covers
only what the CLI cannot tell you.

## The loop

1. Make sure the work is finished and its tests pass. Review is the last step,
   not a way to find out what to build.
2. Run `rules review --since <ref>`, with the ref the change is measured from:
   `main` for a branch, `HEAD` for uncommitted work. It prints a summary line
   and then one block per unit of work, each starting with a `## ` heading.
3. Spawn one subagent per block, all in parallel, and give each the whole
   block verbatim as its prompt. Add nothing. The block already says which
   file to read, which files to judge, how to see the change, and how to
   answer.
4. Collect the replies. Each is a JSON array of `{file, line, message}`, empty
   when the rule found nothing.
5. Report the findings grouped by file, each with its rule id and the rule's
   level from the block heading. Then stop. Fixing is a separate decision.

If a block's reply is not a JSON array, run that block again once, then
report it as unanswered rather than guessing what it found.

## Choosing a model

Every heading carries the rule's complexity, and a `hints:` line when the
rule has more to say:

```
## no-em-dashes (3 files, complexity low)
hints: A grep for the two characters finds every candidate.
```

Complexity is how hard the rule is to judge. `low` is a grep or a count:
give it the cheapest, fastest model available. `high` is design judgment
across a whole file: give it the strongest. `medium` is whatever the harness
uses by default. The hints say what judging takes, such as that a file
without some construct cannot break the rule, so the subagent may write a
one-off script to cull files before reading any.

## Fixing

When asked to fix what the review found, spawn one subagent per finding with
a prompt like this, and nothing else about the rule:

```
Read `.wiz/rules/<id>/RULE.md`. In `<file>` at line <line>, the code <message>.
Change the code so it follows the rule, touching as little as you can, and
reply with the diff.
```

The subagent reads the rule and decides the fix. You still have not read it.

## Writing a rule

When asked to write a rule, or to add one from the catalog:

- `rules ls` lists every rule that ships and every rule the project has.
- `rules add <id>` copies a shipped rule into `.wiz/rules/<id>/RULE.md`,
  where it runs and can be edited.
- `rules new <name>` scaffolds `.wiz/rules/<name>/RULE.md` to fill in. The
  frontmatter has `description`, `files` (the glob a review matches changed
  files against), `level` (`error` or `warning`), `complexity` (`low`,
  `medium` or `high`), and optionally `hints`. The body has a title, the
  prose a subagent judges by, and `## Good` and `## Bad` sections with
  examples. Fill it in, delete the comment that explains it, and run
  `rules ls`: it validates every rule and names the line that is wrong.

Rules are English. A rule that only concerns some files says so in its glob;
a rule that only concerns files with some construct says so in its prose, and
the subagent that reads it greps or writes a script to find them. There is no
code to write for a rule, ever.

Writing a rule is the one time you read one, and only the one you are
writing. To remove a rule, delete its directory.
