---
name: review
description: "Review a change against the RULE.md rules in this project's .wiz/rules directory by handing each rule to a separate agent, without reading a rule yourself. Use only when the project has a .wiz/rules directory and the user asks to run, check, or apply the rules, the wiz rules, or the webappwiz rules to a change, or asks to write, add, or edit a rule there. Not for a general code review, a pull request review, a security review, or any review that does not name the rules."
version: 0.0.12
---

# Reviewing against the rules

The rules are markdown, one per directory under `.wiz/rules`, each a `RULE.md`
another agent reads. You never read one. Reading rules loads their prose into
your context and you start reasoning about style instead of running the
review, so the whole loop is built to keep them out of your sight: the CLI
divides the work into blocks that name a rule's file, and whoever gets the
block opens it.

Run the CLI with `bunx @webappwiz/cli rules <command>`. `rules --help` lists
the commands; this file covers only what the CLI cannot tell you.

## The loop

1. Make sure the work is finished and its tests pass. Review is the last step,
   not a way to find out what to build.
2. Run `rules review --since <ref>`, with the ref the change is measured from:
   `main` for a branch, `HEAD` for uncommitted work. It prints a summary line
   and then one block per unit of work, each starting with a `## ` heading.
3. Run every block through whatever this harness gives you for parallel work:
   subagents, background tasks, a workflow, worktrees, whatever is at hand.
   One agent per block, started together, each given the whole block verbatim
   as its prompt and nothing else. The block already says which file to read,
   which files to judge, how to see the change, and how to answer. Never put
   two blocks in front of the same agent, and never run one yourself: both
   end with rules in a context that is supposed to stay clear of them. If
   nothing here runs work in parallel, still send one block to one agent and
   do it in turn.
4. Collect the replies. Each is a JSON array of `{file, line, message}`, empty
   when the rule found nothing.
5. Report the findings grouped by file, each with its rule id and the rule's
   level from the block heading. Then stop. Fixing is a separate decision.

If a block's reply is not a JSON array, run that block again once, then
report it as unanswered rather than guessing what it found.

## Choosing a model

Every heading carries the rule's complexity:

```
## no-em-dashes (3 files, complexity low)
```

Complexity is how hard the rule is to judge. `low` is a grep or a count:
give it the cheapest, fastest model available. `high` is design judgment
across a whole file: give it the strongest. `medium` is whatever the harness
uses by default. Ignore all of this when the system you run the blocks
through does not let you choose one.

## Fixing

When asked to fix what the review found, run one agent per finding, in
parallel the same way, each given a prompt like this and nothing else about
the rule:

```
Read `.wiz/rules/<id>/RULE.md`. In `<file>` at line <line>, the code <message>.
Change the code so it follows the rule, touching as little as you can, and
reply with the diff.
```

It reads the rule and decides the fix. You still have not read it.

## Writing a rule

When asked to write a rule, or to add one from the catalog:

- `rules ls` lists every rule that ships and every rule the project has.
- `rules add <id>` copies a shipped rule into `.wiz/rules/<id>/RULE.md`,
  where it runs and can be edited.
- `rules new <name>` scaffolds `.wiz/rules/<name>/RULE.md` to fill in. The
  frontmatter has `description`, `files` (the glob a review matches changed
  files against), `level` (`error` or `warning`), `complexity` (`low`,
  `medium` or `high`). The body is yours, as a skill's is: the template
  suggests a title, the prose an agent judges by, and `## Good` and
  `## Bad` sections with examples, and nothing checks for them. Fill it in,
  delete the comment that explains it, and run `rules ls`: it validates the
  frontmatter of every rule and names the line that is wrong.

Rules are English. A rule that only concerns some files says so in its glob;
a rule that only concerns files with some construct says so in its prose, and
whoever reads it greps or writes a script to find them. There is no code to
write for a rule, ever.

Writing a rule is the one time you read one, and only the one you are
writing. To remove a rule, delete its directory.
