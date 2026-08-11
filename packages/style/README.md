# @webappwiz/style

Style rules agents can check. One markdown file is one rule: the file name is
the id a report cites, the title is the human name, the prose under it the
description, a `files` frontmatter glob picks the files, and `## Good` /
`## Bad` hold fenced examples:

```markdown
---
files: "**/*.ts"
---

# Single class per file

Each file exports at most one class.

## Good
​```ts
class Foo {}
​```

## Bad
​```ts
class Foo {}
class Bar {}
​```
```

A guide is a TypeScript module so composition stays typed:

```ts
// style.config.ts
import { defineStyleGuide, rule } from "@webappwiz/style";

export default defineStyleGuide([
	rule("./rules/single-class-per-file.md"),
]);
```

A rule reports as an error unless its frontmatter says `level: warning`.

The guide lives in `style.config.ts` unless a command is told otherwise.
`webappwiz style check` validates it, `style ls` lists its rules, `style show
<id>` prints one in full, and `style analyze [dir]` checks the code, handing
one rule at a time to the agent command in `--agent` and printing what comes
back as lint output.
