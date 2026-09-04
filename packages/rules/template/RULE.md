---
name: {{name}}
description: One line saying what the rule wants, as `rules ls` shows it.
files: "**/*.ts"
level: error
complexity: medium
---

<!-- Frontmatter: `files` is the glob a review matches changed files against;
anything finer is the subagent's job. `level` is error or warning.
`complexity` is low when a grep or a count settles the rule, high when it
takes design judgment across a file, medium between. The body is yours: the
headings below are a suggestion, not a requirement. Delete this comment. -->

# {{title}}

What the rule wants and why, in prose a subagent reads verbatim. Say what
counts and what does not: it decides the borderline cases from this alone.

## Good

Code that follows the rule, and what makes it follow.

```ts
```

## Bad

Code that breaks it, and what makes it break.

```ts
```
