# @webappwiz/rules

Rules written in markdown, and the review work they divide a change into.
Nothing here runs a rule: a rule is English, a subagent reads it, and this
package's job is to keep the documents in shape and to say which rule reads
which files.

It also owns webappwiz's own rules, one `RULE.md` per directory under
[`catalog/`](./catalog), exported from `@webappwiz/rules/catalog` as id to
document. A project copies the ones it wants into `.wiz/rules` with
`@webappwiz/cli rules add`, and writes its own beside them.

## A rule

```markdown
---
name: no-default-exports
description: Modules export named bindings, never a default.
files: "**/*.{ts,tsx}"
level: error
complexity: low
---

# No default exports

Why, and what counts.

## Good

## Bad
```

`Rule.parse` is the only way to make one, so holding a `Rule` means the
frontmatter passed: it has `name`, `description`, `level` and `complexity`,
and the name matches its directory. Anything else fails with `path:line: why`.
The body is the author's, the way a skill's is: the template suggests a
title and `## Good` and `## Bad` sections, and nothing checks for them.

`files` is the glob a review matches changed files against; anything finer
is the subagent's job. `complexity` (`low`,
`medium`, `high`) is how hard the rule is to judge, so the parent agent can
pick a model for the subagent. A rule that shipped carries `version`; one a
project wrote does not.

## A review

```ts
const rules = await Rules.load(dir);
const files = await changed(dir, "main");
for (const block of rules.review(files, { chunk: 25 })) {
	console.log(block.prompt("main"));
}
```

`Rules.load` reads every rule under `<dir>/.wiz/rules` and reports every
broken one at once. `changed` asks git what is new or different since a ref,
committed or not. `review` gives one `Block` per rule that matches any of the
files, cut into several when a rule matches more than `chunk`.

A block's `prompt` is the whole of what a subagent is told: the rule's path,
the files, how to see the change, and the reply contract. It names the
rule's file rather than quoting it, so whoever prints the prompt never reads
the rule. Its heading carries the complexity for whoever chooses the model.

## The template

`template(name)` is the `RULE.md` that `rules new` writes: every field a
review needs, the shape a rule usually takes, and a comment saying what goes
where. It parses as it is.
