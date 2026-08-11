# @webappwiz/rules

The default style guide for webappwiz projects: one markdown file per rule,
plus a typed index so guides compose with spreads and opt out by identity:

```ts
import { base, classesOverFunctionExports } from "@webappwiz/rules";
import { defineStyleGuide, rule } from "@webappwiz/style";

export default defineStyleGuide([
	...base.filter((r) => r !== classesOverFunctionExports),
	rule("./rules/project-specific.md"),
]);
```

Audit and run a guide with `webappwiz style audit` and `webappwiz style
analyze`.
