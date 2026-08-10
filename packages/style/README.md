# @webappwiz/style

Style rules agents can check. One markdown file is one rule — title is the
name, the prose under it the description, a `files` frontmatter glob picks the
files, and `## Good` / `## Bad` hold fenced examples:

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
import { defineStyleGuide, rule } from "@webappwiz/style";

export default defineStyleGuide([
	rule("./rules/single-class-per-file.md"),
]);
```

`webappwiz style check guide.ts` validates the guide; `webappwiz analyze
guide.ts [dir]` compiles it into per-rule agent tasks.
